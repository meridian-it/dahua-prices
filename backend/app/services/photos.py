"""Product photos, looked up by model in a chain of sources (order set in the admin panel).

Sources:
  * dahuasecurity - the official vendor site: 400 px renders on a transparent background, but
    the global catalog has no CIS-only models (…TL1P-A-IL-…-S7, CS4xxx switches…);
  * icecat - the Open Icecat product-content catalog (JSON API, no registration): exact part
    number lookup, covers some of the regional models the vendor site lacks;
  * tdtorus - tdtorus.ru, a Russian distributor catalog: search by model, the CIS-market models
    under their exact price-list names (reachable from a server in Russia);
  * bing - Bing Images web search by model: the last resort for CIS-market models
    (…TL1P-A-IL-…-S7, HAC-…P-U-IL, -PRO/-PROX) that no catalog has; a result is accepted only if
    its title/URL contains the model (see BingSource).

The vendor search also returns products that live on transmission.dahuasecurity.com (switches,
routers): that site is a JS app without server-rendered gallery, so the 400 px search thumbnail
(the same render the main site uses) is taken.

How a price-list model is matched:

    DH-IPC-HFW5259TP-ASE-IL-0280B-S2
    └┬┘    └──────┬──────┘ └─┬─┘ └┬┘
  prefix    core model     lens  hardware revision

The vendor site lists products without the DH-/DHI- prefix, without the lens and usually without
the PAL "P" (HFW5259TP -> HFW5259T). Its search is a substring search, so we query the shortest
form of the model and pick, from the results, the most specific candidate that matches exactly
(after normalisation). Lens/revision/PAL variants share housing and photos, so such a match is
`found`; a match only after dropping a trailing suffix ("-PRO", "(L)") is reported as `close` so
the admin can review it. Icecat is queried by part number with the same candidate list.

Reliability: network failures (DNS, timeouts, 429/5xx) are *transient* - the product is put back
in the queue and the job pauses with a backoff while the network is down instead of marking
hundreds of products as failed. Products that still end in `error` are retried by the next
automatic run (after an import / on server start).

Images are converted to WebP and stored locally under DATA_DIR/media, deduplicated by source
URL - lens variants of one camera share files.
"""

from __future__ import annotations

import asyncio
import hashlib
import html
import io
import json
import logging
import re
import time
import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any
from urllib.parse import quote, urljoin

import httpx
from PIL import Image
from sqlalchemy import Integer, and_, func, or_, select, update

from app.config import env
from app.db import SessionLocal
from app.models import Job, Product
from app.services.app_settings import load_settings

log = logging.getLogger("it-trade.photos")

MEDIA_URL = "/api/media"
JOB_KIND = "photos"
HEARTBEAT_STALE = timedelta(seconds=20)
USER_AGENT = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36"
SOURCES = ("dahuasecurity", "icecat", "tdtorus", "bing")
# Bump when matching/sources improve: products left without a photo by an older version are
# re-checked by the next automatic ("missing") run.
MATCHER_VERSION = 4

CAMERA_KINDS = {"camera", "thermal"}
RE_PREFIX = re.compile(r"^(?:DHI|DH|EZ)-")
RE_LENS = re.compile(r"-\d{4,5}B?(?=-|$)")          # -0280B, -0360B, -27135
RE_REVISION = re.compile(r"-S\d{1,2}$")             # -S2, -S7
RE_PAL = re.compile(r"^((?:IPC|HAC)-[A-Z]+\d+[A-Z0-9]*?)P(?=-|$)")
# soft trailing qualifiers: "(L)", "(868)", "-B", "-PRO", "-PROX", "-RU" (not "-IL", "-PV": real features)
RE_TRAILING = re.compile(r"(?:\([^()]*\)|-(?:[A-Z]{1,3}|PROX?))$")
HARD_SUFFIXES = {"IL", "PV", "AS", "ZS", "ZE", "LED", "A", "S", "W", "P", "T", "E", "D"}




def media_dir() -> Path:
    return env.data_dir / "media"


def norm(name: str) -> str:
    return re.sub(r"[^A-Z0-9]", "", RE_PREFIX.sub("", name.upper().strip()))


@dataclass
class Candidates:
    exact: list[str]          # equivalent names (lens / revision / PAL variants)
    close: list[str]          # with a trailing suffix dropped - needs review
    queries: list[str]        # search keywords, most promising first


def candidates(model: str, kind: str | None = None) -> Candidates:
    m = RE_PREFIX.sub("", model.upper().strip())
    is_camera = kind in CAMERA_KINDS or bool(re.match(r"^(IPC|HAC|SD|PTZ|TPC)", m))
    if is_camera:
        m = RE_LENS.sub("", m)
    exact: list[str] = []

    def add(lst: list[str], v: str) -> None:
        if v and v not in lst and v not in exact:
            lst.append(v)

    add(exact, m)
    no_rev = RE_REVISION.sub("", m)
    add(exact, no_rev)
    for v in list(exact):
        if is_camera:
            add(exact, RE_PAL.sub(r"\1", v))

    close: list[str] = []
    for v in list(exact):
        cur = v
        for _ in range(2):
            shorter = RE_TRAILING.sub("", cur)
            dropped = cur[len(shorter):].lstrip("-")
            # never shrink to a bare series code or drop a feature suffix
            if (shorter == cur or len(norm(shorter)) < 5 or not re.search(r"\d", shorter)
                    or dropped in HARD_SUFFIXES):
                break
            add(close, shorter)
            cur = shorter

    shortest_exact = min(exact, key=len)
    queries = [shortest_exact]
    if close:
        queries.append(min(close, key=len))
    return Candidates(exact=exact, close=close, queries=queries)


def result_names(alt: str) -> list[str]:
    """Names a search result stands for: "VTH2421FB/VTH2421FW", "Picoo P3D" -> several."""
    alt = html.unescape(alt).strip()
    names = [alt]
    parts = [p.strip() for p in alt.split("/")]
    if len(parts) > 1 and all(len(p) >= 5 for p in parts):
        names += parts
    for n in list(names):
        if " " in n:
            names.append(n.split()[-1])
    return names


@dataclass
class SearchHit:
    name: str
    url: str
    thumb: str | None


@dataclass
class Match:
    hit: SearchHit
    quality: str              # found | close
    candidate: str


def pick_match(c: Candidates, hits: list[SearchHit]) -> Match | None:
    index: dict[str, SearchHit] = {}
    for h in hits:
        for n in result_names(h.name):
            index.setdefault(norm(n), h)
    for quality, names in (("found", c.exact), ("close", c.close)):
        for cand in names:
            h = index.get(norm(cand))
            if h is not None:
                return Match(hit=h, quality=quality, candidate=cand)
    return None



# ------------------------------------------------------------------ HTTP

TRANSIENT_STATUS = {408, 425, 429, 500, 502, 503, 504}


class TransientError(Exception):
    """Network-level failure (DNS, timeout, 429/5xx): says nothing about the product, retry later."""


class Http:
    """Shared client: retries with backoff, and per-host politeness (one request at a time with a
    pause) for catalog pages/APIs. Image downloads from CDNs are not throttled."""

    def __init__(self, delay_ms: int, timeout: float = 25.0):
        self.delay = max(0, delay_ms) / 1000
        self._locks: dict[str, asyncio.Lock] = {}
        self._last: dict[str, float] = {}
        self.http = httpx.AsyncClient(
            headers={"User-Agent": USER_AGENT, "Accept-Language": "en"},
            timeout=timeout,
            follow_redirects=True,
            limits=httpx.Limits(max_connections=8),
        )

    async def aclose(self) -> None:
        await self.http.aclose()

    async def _once(self, url: str, params: dict[str, str] | None, throttle: bool) -> httpx.Response:
        if not throttle:
            return await self.http.get(url, params=params)
        host = httpx.URL(url).host
        lock = self._locks.setdefault(host, asyncio.Lock())
        async with lock:
            wait = self._last.get(host, 0.0) + self.delay - time.monotonic()
            if wait > 0:
                await asyncio.sleep(wait)
            try:
                return await self.http.get(url, params=params)
            finally:
                self._last[host] = time.monotonic()

    async def get(self, url: str, params: dict[str, str] | None = None, *,
                  throttle: bool = True, attempts: int = 3) -> httpx.Response:
        """Response for any definitive status (2xx/3xx/4xx); TransientError otherwise."""
        err = ""
        for attempt in range(attempts):
            try:
                r = await self._once(url, params, throttle)
            except httpx.TransportError as e:
                err = f"{type(e).__name__}: {e}" if str(e) else type(e).__name__
            else:
                if r.status_code not in TRANSIENT_STATUS:
                    return r
                err = f"HTTP {r.status_code}"
            if attempt < attempts - 1:
                await asyncio.sleep(2 + attempt * 3)
        raise TransientError(err)


# ------------------------------------------------------------------ sources


@dataclass
class Hit:
    source: str
    quality: str              # found | close
    matched: str
    page_url: str | None
    images: list[str]         # source image URLs, best first
    limit: int | None = None  # store at most this many (web search: one photo, the rest are fallbacks)


RE_SEARCH_ITEM = re.compile(
    r'<a\s+href="(?P<url>[^"]+)"[^>]*>\s*'
    r'<div class="search-products-img">\s*<img\s+src="(?P<img>[^"]*)"\s*alt="(?P<alt>[^"]*)"',
    re.S,
)
RE_GALLERY = re.compile(r'class="swiper-slide">\s*<img\s+src="(?P<img>[^"]+)"', re.S)
RE_OG_IMAGE = re.compile(r'<meta\s+property="og:image"\s+content="([^"]+)"')


class DahuaSource:
    name = "dahuasecurity"

    def __init__(self, http: Http, base_url: str):
        self.http = http
        self.base = base_url.rstrip("/")
        self._search_cache: dict[str, list[SearchHit]] = {}
        self._gallery_cache: dict[str, list[str]] = {}

    async def search(self, keyword: str) -> list[SearchHit]:
        if keyword in self._search_cache:
            return self._search_cache[keyword]
        r = await self.http.get(f"{self.base}/search?keyword={quote(keyword)}")
        hits: list[SearchHit] = []
        if r.status_code == 200:
            text = r.text
            start = text.find('id="searchProducts"')
            if start >= 0:
                for m in RE_SEARCH_ITEM.finditer(text, start, start + 200_000):
                    hits.append(SearchHit(name=html.unescape(m["alt"]), url=html.unescape(m["url"]),
                                          thumb=html.unescape(m["img"]) or None))
        self._search_cache[keyword] = hits
        return hits

    async def gallery(self, page_url: str) -> list[str]:
        if page_url in self._gallery_cache:
            return self._gallery_cache[page_url]
        r = await self.http.get(page_url)
        urls: list[str] = []
        if r.status_code == 200:
            text = r.text
            for m in RE_GALLERY.finditer(text):
                u = urljoin(page_url, html.unescape(m["img"]))
                if u not in urls:
                    urls.append(u)
            if not urls:
                og = RE_OG_IMAGE.search(text)
                if og and "/cpq/" in og[1]:
                    urls.append(html.unescape(og[1]))
        self._gallery_cache[page_url] = urls
        return urls

    async def find(self, model: str, c: Candidates, allow_close: bool) -> Hit | None:
        match: Match | None = None
        for q in c.queries:
            match = pick_match(c, await self.search(q))
            if match and (match.quality == "found" or not allow_close):
                break
        if match is None or (match.quality == "close" and not allow_close):
            return None
        # the gallery is server-rendered only on the main site (not on transmission.* etc.)
        images = await self.gallery(match.hit.url) if "/products/" in match.hit.url else []
        if not images and match.hit.thumb:
            images = [match.hit.thumb]
        return Hit(source=self.name, quality=match.quality, matched=match.hit.name,
                   page_url=match.hit.url, images=images)


class IcecatSource:
    """Open Icecat JSON API: product by brand + part number (https://iceclog.com/open-icecat)."""

    name = "icecat"
    API = "https://live.icecat.biz/api"
    BRAND = "Dahua Technology"

    def __init__(self, http: Http, user: str, max_size: int):
        self.http = http
        self.user = user.strip() or "openIcecat-live"
        self.max_size = max_size
        self._cache: dict[str, dict[str, Any] | None] = {}

    @staticmethod
    def codes(model: str, c: Candidates, limit: int = 6) -> list[tuple[str, str]]:
        """(part number to query, expected quality), most likely first."""
        out: list[tuple[str, str]] = []
        seen: set[str] = set()

        def add(code: str, quality: str) -> None:
            if code not in seen:
                seen.add(code)
                out.append((code, quality))

        m = model.upper().strip()
        add(m, "found")
        # Icecat keeps Dahua part numbers with the DH- prefix; bare ones are a last resort
        for v in c.exact:
            add(v if RE_PREFIX.match(v) else f"DH-{v}", "found")
        for v in c.exact:
            add(RE_PREFIX.sub("", v), "found")
        for v in c.close:
            add(v if RE_PREFIX.match(v) else f"DH-{v}", "close")
        return out[:limit]

    async def lookup(self, code: str) -> dict[str, Any] | None:
        if code in self._cache:
            return self._cache[code]
        r = await self.http.get(self.API, {"UserName": self.user, "Language": "en",
                                           "Brand": self.BRAND, "ProductCode": code})
        data: dict[str, Any] | None = None
        if r.status_code == 200:
            try:
                data = (r.json() or {}).get("data") or None
            except ValueError:
                data = None
        elif r.status_code not in (400, 403, 404):
            log.warning("icecat %s: HTTP %s %s", code, r.status_code, r.text[:200])
        self._cache[code] = data
        return data

    def images(self, data: dict[str, Any]) -> list[str]:
        key = "Pic500x500" if self.max_size <= 500 else "Pic"
        gallery = sorted(data.get("Gallery") or [],
                         key=lambda g: (g.get("IsMain") != "Y", int(g.get("No") or 99)))
        urls: list[str] = []
        for g in gallery:
            u = g.get(key) or g.get("Pic") or g.get("Pic500x500")
            if u and u not in urls:
                urls.append(u)
        main = (data.get("Image") or {}).get("HighPic")
        if not urls and main:
            urls.append(main)
        return urls

    async def find(self, model: str, c: Candidates, allow_close: bool) -> Hit | None:
        for code, quality in self.codes(model, c):
            if quality == "close" and not allow_close:
                break
            data = await self.lookup(code)
            if not data:
                continue
            images = self.images(data)
            if not images:
                continue
            info = data.get("GeneralInfo") or {}
            part = str(info.get("BrandPartCode") or code)
            # Icecat maps alternative codes to a product - make sure it is really this model
            got = {norm(x) for x in candidates(part).exact}
            if quality == "found" and not got & {norm(x) for x in c.exact}:
                if not allow_close:
                    continue
                quality = "close"
            return Hit(source=self.name, quality=quality, matched=part, page_url=None, images=images)
        return None


RE_TORUS_CARD = re.compile(
    r'<div class="image product-image">\s*<a href="(?P<url>[^"]+)">\s*<img[^>]*?\ssrc="(?P<img>[^"]+)"'
    r'.{0,3000}?<span class="desktop">(?P<name>.*?)<br>(?P<brand>[^<]*)</span>',
    re.S,
)


class TorusSource:
    """tdtorus.ru - Russian distributor catalog (Dahua's CIS models under exact price-list names).

    Its search is fuzzy (returns neighbouring models too), so the result is picked like everywhere
    else: the same name > same model up to lens/revision/PAL (`found`) > without a soft suffix
    (`close`). The product page has the same single photo as the search card, so it is not opened."""

    name = "tdtorus"
    URL = "https://tdtorus.ru/search"

    def __init__(self, http: Http):
        self.http = http
        self._cache: dict[str, list[SearchHit]] = {}

    async def search(self, query: str) -> list[SearchHit]:
        if query not in self._cache:
            r = await self.http.get(self.URL, {"search": query})
            hits: list[SearchHit] = []
            if r.status_code == 200:
                for m in RE_TORUS_CARD.finditer(r.text):
                    if "dahua" not in m["brand"].lower():
                        continue
                    title = html.unescape(re.sub(r"<[^>]+>", " ", m["name"])).split()
                    if title:
                        hits.append(SearchHit(name=title[0], url=html.unescape(m["url"]),
                                              thumb=html.unescape(m["img"]).split("?")[0]))
            self._cache[query] = hits
        return self._cache[query]

    @staticmethod
    def pick(model: str, c: Candidates, hits: list[SearchHit]) -> tuple[SearchHit, str] | None:
        exact = {norm(x) for x in c.exact}
        close = {norm(x) for x in c.close}
        best: tuple[int, SearchHit, str] | None = None
        for h in hits:
            if norm(h.name) == norm(model):
                return h, "found"
            got = {norm(x) for x in candidates(h.name).exact}
            # a soft suffix ("-PRO", "-PROX", "(L)") may be on either side: same housing, for review
            got_base = got | {norm(x) for x in candidates(h.name).close}
            rank = 1 if got & exact else 2 if got_base & (exact | close) else 0
            if rank and (best is None or rank < best[0]):
                best = (rank, h, "found" if rank == 1 else "close")
        return (best[1], best[2]) if best else None

    async def find(self, model: str, c: Candidates, allow_close: bool) -> Hit | None:
        found: tuple[SearchHit, str] | None = None
        hits: list[SearchHit] = []
        for q in dict.fromkeys([model.strip(), c.queries[0]]):
            hits += await self.search(q)
            found = self.pick(model, c, hits)
            if found and found[1] == "found":
                break
        if found is None or (found[1] == "close" and not allow_close) or not found[0].thumb:
            return None
        h, quality = found
        return Hit(source=self.name, quality=quality, matched=h.name, page_url=h.url, images=[h.thumb])


RE_BING_ITEM = re.compile(r'class="iusc"[^>]*?\sm="([^"]+)"')


def flat(text: str) -> str:
    return re.sub(r"[^A-Z0-9]", "", text.upper())


class BingSource:
    """Bing Images: a web-wide search by model, the last resort for models no catalog has.

    A result is accepted only if its title / page URL / image URL contains the model: the full
    model up to lens/revision/PAL -> `found`; only the series + core model ("IPC-HDW1439T1") ->
    `close` (another variant of the same housing - marked for review)."""

    name = "bing"
    URL = "https://www.bing.com/images/search"

    def __init__(self, http: Http):
        self.http = http
        self._cache: dict[str, list[dict[str, str]]] = {}

    async def search(self, query: str) -> list[dict[str, str]]:
        if query not in self._cache:
            r = await self.http.get(self.URL, {"q": query, "form": "HDRSC2", "first": "1"})
            items: list[dict[str, str]] = []
            if r.status_code == 200:
                for m in RE_BING_ITEM.finditer(r.text):
                    try:
                        d = json.loads(html.unescape(m[1]))
                    except ValueError:
                        continue
                    if isinstance(d, dict) and d.get("murl"):
                        items.append({k: str(d.get(k) or "") for k in ("murl", "turl", "purl", "t", "desc")})
            self._cache[query] = items
        return self._cache[query]

    @staticmethod
    def keys(model: str, c: Candidates) -> tuple[set[str], set[str]]:
        """(strings meaning the exact model, strings meaning the same core model)."""
        exact = {flat(x) for x in c.exact} | {flat(RE_PREFIX.sub("", model.upper().strip()))}
        core: set[str] = set()
        for v in c.exact:
            segs = v.split("-")
            for i, seg in enumerate(segs):
                if re.search(r"\d", seg):
                    k = flat("-".join(segs[: i + 1]))
                    if len(k) >= 5:
                        core.add(k)
                    break
        return {k for k in exact if len(k) >= 5}, core

    @staticmethod
    def rate(model: str, c: Candidates, item: dict[str, str]) -> str | None:
        exact, core = BingSource.keys(model, c)
        text = flat(" ".join((item["t"], item["desc"], item["purl"], item["murl"])))
        # lens codes are written in many ways ("0280B", "0280-B", "2.8mm") - compare without them
        no_lens = re.sub(r"0\d{3}B?", "", text)
        if any(k in text or k in no_lens for k in exact):
            return "found"
        if any(k in text for k in core):
            return "close"
        return None

    async def find(self, model: str, c: Candidates, allow_close: bool) -> Hit | None:
        best: tuple[str, list[dict[str, str]]] | None = None
        for q in dict.fromkeys([model.strip(), f"Dahua {c.queries[0]}"]):
            rated: dict[str, list[dict[str, str]]] = {"found": [], "close": []}
            for it in await self.search(q):
                quality = self.rate(model, c, it)
                if quality:
                    rated[quality].append(it)
            if rated["found"]:
                best = ("found", rated["found"])
                break
            if rated["close"] and allow_close and best is None:
                best = ("close", rated["close"])
        if best is None:
            return None
        quality, items = best
        # full-size images from the sites first, Bing's own thumbnails as a fallback
        images = list(dict.fromkeys([it["murl"] for it in items[:6]] + [it["turl"] for it in items[:2] if it["turl"]]))
        top = items[0]
        return Hit(source=self.name, quality=quality, matched=(top["t"] or model)[:200],
                   page_url=top["purl"] or None, images=images, limit=1)


Source = DahuaSource | IcecatSource | TorusSource | BingSource


def build_sources(http: Http, s: dict[str, Any]) -> list[Source]:
    out: list[Source] = []
    for name in s.get("photos_sources") or SOURCES:
        name = name.strip().lower()
        if name in ("dahua", "dahuasecurity") and not any(isinstance(x, DahuaSource) for x in out):
            out.append(DahuaSource(http, s["photos_base_url"]))
        elif name == "icecat" and not any(isinstance(x, IcecatSource) for x in out):
            out.append(IcecatSource(http, str(s.get("photos_icecat_user") or ""), int(s["photos_max_size"])))
        elif name in ("tdtorus", "torus") and not any(isinstance(x, TorusSource) for x in out):
            out.append(TorusSource(http))
        elif name == "bing" and not any(isinstance(x, BingSource) for x in out):
            out.append(BingSource(http))
        else:
            log.warning("unknown photo source %r ignored", name)
    if not out:   # a mangled setting must not silently leave only one source
        log.warning("no valid photo sources in %r, using all", s.get("photos_sources"))
        return build_sources(http, {**s, "photos_sources": list(SOURCES)})
    return out


# ------------------------------------------------------------------ images


def store_image(data: bytes, source_url: str, max_size: int) -> str | None:
    """Convert to WebP (keeping transparency) and save; returns the public URL."""
    key = hashlib.sha1(source_url.encode()).hexdigest()[:20]
    rel = f"p/{key[:2]}/{key}.webp"
    path = media_dir() / rel
    if not path.exists():
        try:
            img = Image.open(io.BytesIO(data))
            img.load()
        except Exception:  # noqa: BLE001 - not an image (error page etc.)
            return None
        if img.width < 64 or img.height < 64:
            return None
        img = img.convert("RGBA") if img.mode in ("P", "LA", "RGBA", "PA") else img.convert("RGB")
        img.thumbnail((max_size, max_size), Image.Resampling.LANCZOS)
        path.parent.mkdir(parents=True, exist_ok=True)
        # unique temp name: two workers may store the same image at the same time
        tmp = path.with_name(f"{path.stem}.{uuid.uuid4().hex}.tmp")
        try:
            img.save(tmp, "WEBP", quality=88, method=5)
            tmp.replace(path)
        finally:
            tmp.unlink(missing_ok=True)
    return f"{MEDIA_URL}/{rel}"


async def download_images(http: Http, urls: list[str], max_images: int, max_size: int
                          ) -> tuple[list[str], str | None]:
    """Stored URLs and, if nothing could be stored because of the network, the transient error."""
    images: list[str] = []
    transient: str | None = None
    want = max(1, max_images)
    for src in urls[: want + 6]:              # extra URLs are fallbacks for failed downloads
        if len(images) >= want:
            break
        try:
            r = await http.get(src, throttle=False)
        except TransientError as e:
            transient = str(e)
            log.warning("photo download failed %s: %s", src, e)
            continue
        if r.status_code != 200:
            log.warning("photo download failed %s: HTTP %s", src, r.status_code)
            continue
        try:
            stored = await asyncio.to_thread(store_image, r.content, src, max_size)
        except OSError as e:
            log.warning("photo store failed %s: %s", src, e)
            continue
        if stored and stored not in images:
            images.append(stored)
    return images, (transient if not images else None)


# ------------------------------------------------------------------ single product


@dataclass
class FetchResult:
    status: str                       # found | close | not_found | error
    images: list[str] = field(default_factory=list)
    source: str | None = None
    matched: str | None = None
    page_url: str | None = None
    error: str | None = None
    transient: bool = False           # network failure: worth retrying soon
    tried: list[str] = field(default_factory=list)


async def fetch_for_model(http: Http, sources: list[Source], model: str, kind: str | None, *,
                          allow_close: bool, max_images: int, max_size: int) -> FetchResult:
    """Try sources in order; an exact match wins, a close one is kept while later sources are
    asked for an exact one."""
    c = candidates(model, kind)
    transient: list[str] = []
    best: FetchResult | None = None
    failed_download: Hit | None = None
    tried: list[str] = []
    for src in sources:
        tried.append(src.name)
        try:
            hit = await src.find(model, c, allow_close)
        except TransientError as e:
            transient.append(f"{src.name}: {e}")
            continue
        if hit is None or (hit.quality == "close" and best is not None):
            continue
        images, err = await download_images(http, hit.images, min(max_images, hit.limit or max_images), max_size)
        if not images:
            if err:
                transient.append(f"{src.name}: {err}")
            failed_download = failed_download or hit
            continue
        res = FetchResult(status=hit.quality, images=images, source=hit.source, matched=hit.matched,
                          page_url=hit.page_url, tried=list(tried))
        if hit.quality == "found":
            return res
        best = res
    if best is not None:
        return best
    if transient:
        return FetchResult(status="error", error="Нет связи с источником — " + "; ".join(transient)[:280],
                           transient=True, tried=tried)
    if failed_download is not None:
        return FetchResult(status="error", source=failed_download.source, matched=failed_download.matched,
                           page_url=failed_download.page_url, error="Не удалось скачать изображения",
                           tried=tried)
    return FetchResult(status="not_found", tried=tried)


def apply_result(p: Product, r: FetchResult) -> None:
    """Store the result. A failed lookup never removes photos a product already has."""
    if not r.images and p.image_url:
        if p.photo_meta and r.status != "error":   # checked by this version: don't re-queue it
            p.photo_meta = {**p.photo_meta, "v": MATCHER_VERSION, "checked_at": datetime.now(UTC).isoformat()}
        return
    meta: dict[str, Any] = {"status": r.status, "checked_at": datetime.now(UTC).isoformat(),
                            "v": MATCHER_VERSION}
    for k in ("source", "matched", "page_url", "error"):
        v = getattr(r, k)
        if v:
            meta[k] = v
    if r.tried:
        meta["tried"] = r.tried
    p.photo_meta = meta
    if r.images:
        p.images = r.images
        p.image_url = r.images[0]


# ------------------------------------------------------------------ background job


def _fetch_opts(s: dict[str, Any]) -> dict[str, Any]:
    return {"allow_close": bool(s["photos_allow_close"]), "max_images": int(s["photos_max_images"]),
            "max_size": int(s["photos_max_size"])}


def scope_filter(mode: str) -> Any:
    """Which products a job touches. Manually set photos are never overwritten."""
    status = Product.photo_meta["status"].astext
    not_manual = or_(status.is_(None), status != "manual")
    base = and_(Product.is_active.is_(True), not_manual)
    if mode == "all":
        return base
    if mode == "retry":       # everything without a photo, including previous misses
        return and_(base, Product.image_url.is_(None))
    # "missing": never checked (new products after an import), failed with an error last time,
    # or not found by an older matcher version (new sources / fixes since then)
    # ... plus photos from the web search (lowest quality) once a better matcher/source appears
    version = func.coalesce(Product.photo_meta["v"].astext.cast(Integer), 1)
    outdated = version < MATCHER_VERSION
    return and_(base, or_(
        and_(Product.image_url.is_(None), or_(status.is_(None), status == "error", outdated)),
        and_(Product.photo_meta["source"].astext == "bing", outdated),
    ))


def job_out(j: Job | None) -> dict[str, Any] | None:
    if j is None:
        return None
    return {
        "id": j.id, "status": j.status, "params": j.params, "total": j.total,
        "processed": j.processed, "stats": j.stats, "error": j.error,
        "started_at": j.started_at.isoformat(), "finished_at": j.finished_at.isoformat() if j.finished_at else None,
    }


_tasks: set[asyncio.Task[None]] = set()


async def active_job(session: Any, *, commit: bool = True) -> Job | None:
    j = (
        await session.execute(
            select(Job).where(Job.kind == JOB_KIND, Job.status.in_(("running", "cancelling")))
            .order_by(Job.id.desc()).limit(1)
        )
    ).scalar_one_or_none()
    if j is not None and datetime.now(UTC) - j.heartbeat_at > HEARTBEAT_STALE:
        j.status, j.finished_at = "interrupted", datetime.now(UTC)
        # inside start_job a commit would release the advisory lock too early
        await (session.commit() if commit else session.flush())
        return None
    return j


async def start_job(mode: str, user_id: int | None = None, *, quiet: bool = False) -> Job | None:
    """Create a job row and run it in the background of this worker.

    Returns None when there is nothing to do or another job is already running (quiet=True),
    raises RuntimeError("busy") otherwise."""
    async with SessionLocal() as session:
        # serialize job creation across API workers (held until the commit below)
        await session.execute(select(func.pg_advisory_xact_lock(778_001)))
        if await active_job(session, commit=False) is not None:
            await session.rollback()
            if quiet:
                return None
            raise RuntimeError("busy")
        total = (await session.execute(select(func.count()).select_from(Product).where(scope_filter(mode)))).scalar_one()
        if total == 0 and quiet:
            await session.commit()
            return None
        job = Job(kind=JOB_KIND, status="running", params={"mode": mode}, total=total, user_id=user_id,
                  stats={"found": 0, "close": 0, "not_found": 0, "error": 0})
        session.add(job)
        await session.commit()
        await session.refresh(job)
    task = asyncio.create_task(_run_job(job.id, mode))
    _tasks.add(task)
    task.add_done_callback(_tasks.discard)
    return job


async def cancel_job() -> Job | None:
    async with SessionLocal() as session:
        j = await active_job(session)
        if j is not None:
            j.status = "cancelling"
            await session.commit()
        return j


MAX_ATTEMPTS = 4              # per product, for network failures
OFFLINE_AFTER = 3             # consecutive network failures before the job pauses
BACKOFF = (15, 30, 60, 120, 300)


class NetGate:
    """Pauses all workers while the network (or every source) is down."""

    def __init__(self, cancelled: asyncio.Event):
        self.cancelled = cancelled
        self.open = asyncio.Event()
        self.open.set()
        self.failures = 0
        self.level = 0
        self._pause: asyncio.Task[None] | None = None

    def ok(self) -> None:
        self.failures = 0
        self.level = 0

    def fail(self) -> None:
        self.failures += 1
        if self.failures >= OFFLINE_AFTER and self.open.is_set():
            delay = BACKOFF[min(self.level, len(BACKOFF) - 1)]
            self.level += 1
            self.failures = 0
            log.warning("photo sources unreachable, pausing for %ss", delay)
            self.open.clear()
            self._pause = asyncio.create_task(self._reopen(delay))

    async def _reopen(self, delay: float) -> None:
        try:
            await asyncio.wait_for(self.cancelled.wait(), timeout=delay)
        except TimeoutError:
            pass
        self.open.set()

    @property
    def offline(self) -> bool:
        return not self.open.is_set()

    async def wait(self) -> None:
        await self.open.wait()


async def _run_job(job_id: int, mode: str) -> None:
    async with SessionLocal() as session:
        s = await load_settings(session, fresh=True)
        ids = list((await session.execute(
            select(Product.id).where(scope_filter(mode)).order_by(Product.kind, Product.model)
        )).scalars())
    http = Http(int(s["photos_request_delay_ms"]))
    sources = build_sources(http, s)
    opts = _fetch_opts(s)
    stats: dict[str, int] = {"found": 0, "close": 0, "not_found": 0, "error": 0}
    processed = 0
    final_status = "done"
    error: str | None = None
    queue: asyncio.Queue[tuple[int, int]] = asyncio.Queue()
    for i in ids:
        queue.put_nowait((i, 0))
    cancelled = asyncio.Event()
    gate = NetGate(cancelled)

    async def worker() -> None:
        nonlocal processed
        while not cancelled.is_set():
            await gate.wait()
            if cancelled.is_set():
                return
            try:
                pid, attempt = queue.get_nowait()
            except asyncio.QueueEmpty:
                return
            async with SessionLocal() as session:
                p = await session.get(Product, pid)
                if p is None:
                    continue
                try:
                    r = await fetch_for_model(http, sources, p.model, p.kind, **opts)
                except Exception as e:  # noqa: BLE001 - parsing etc.: record and go on
                    log.warning("photo fetch failed for %s: %s", p.model, e)
                    r = FetchResult(status="error", error=str(e)[:300])
                if r.transient:
                    gate.fail()
                    if attempt + 1 < MAX_ATTEMPTS and not cancelled.is_set():
                        queue.put_nowait((pid, attempt + 1))     # try again after the others
                        continue
                else:
                    gate.ok()
                apply_result(p, r)
                await session.commit()
                stats[r.status] = stats.get(r.status, 0) + 1
                processed += 1

    async def heartbeat() -> None:
        nonlocal final_status
        while True:
            await asyncio.sleep(2)
            async with SessionLocal() as session:
                j = await session.get(Job, job_id)
                if j is None or j.status == "cancelling":
                    cancelled.set()
                    gate.open.set()
                    final_status = "cancelled"
                    return
                j.processed, j.heartbeat_at = processed, datetime.now(UTC)
                j.stats = {**stats, "offline": int(gate.offline)}
                await session.commit()

    hb = asyncio.create_task(heartbeat())
    try:
        workers = max(1, min(8, int(s["photos_concurrency"])))
        await asyncio.gather(*(worker() for _ in range(workers)))
    except Exception as e:  # pragma: no cover
        log.exception("photo job %s failed", job_id)
        final_status, error = "failed", str(e)[:1000]
    finally:
        hb.cancel()
        await http.aclose()
        async with SessionLocal() as session:
            await session.execute(
                update(Job).where(Job.id == job_id).values(
                    status=final_status if not cancelled.is_set() else "cancelled",
                    processed=processed, stats=stats, error=error,
                    heartbeat_at=datetime.now(UTC), finished_at=datetime.now(UTC),
                )
            )
            await session.commit()
        log.info("photo job %s %s: %s", job_id, final_status, stats)


async def fetch_one(product_id: int) -> Product | None:
    """Synchronous single-product refresh from the admin product sheet."""
    async with SessionLocal() as session:
        s = await load_settings(session, fresh=True)
        p = await session.get(Product, product_id)
        if p is None:
            return None
        http = Http(0)
        try:
            r = await fetch_for_model(http, build_sources(http, s), p.model, p.kind,
                                      **{**_fetch_opts(s), "allow_close": True})
        except Exception as e:  # noqa: BLE001
            r = FetchResult(status="error", error=str(e)[:300])
        finally:
            await http.aclose()
        apply_result(p, r)
        await session.commit()
        await session.refresh(p)
        return p


async def autostart(delay: float = 25.0) -> None:
    """On API startup: fetch photos for new / previously failed products if enabled in settings."""
    await asyncio.sleep(delay)
    try:
        async with SessionLocal() as session:
            s = await load_settings(session, fresh=True)
        if s.get("photos_enabled") and s.get("photos_auto"):
            job = await start_job("missing", quiet=True)
            if job:
                log.info("auto photo job %s started for %s products", job.id, job.total)
    except Exception:  # pragma: no cover - never break startup
        log.exception("photo autostart failed")
