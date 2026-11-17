"""Natural-language query understanding for the catalog search.

    "уличная 4мп купольная poe до 15 тыс hfw2449"
    -> filters: outdoor, megapixels=4, form=dome, features=[poe], price_max=15000
       model tokens: ["HFW2449"], text tokens: []

Pure functions only — easy to unit-test, no DB access.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

from app.services.specs import FEATURE_LABELS, FORM_LABELS, KIND_LABELS, TECH_LABELS

RU = "йцукенгшщзхъфывапролджэячсмитьбю.ё"
EN = "qwertyuiop[]asdfghjkl;'zxcvbnm,./`"
RU_TO_EN = str.maketrans(RU + RU.upper(), EN + EN.upper())
EN_TO_RU = str.maketrans(EN + EN.upper(), RU + RU.upper())

# Latin fragments that are typical for Dahua model names — used for layout fix.
MODEL_FRAGMENTS = {
    "dh", "dhi", "ipc", "hfw", "hdw", "hdbw", "hdpw", "nvr", "xvr", "hac", "sd", "ptz", "vto",
    "vth", "asi", "asr", "arc", "pfs", "cs", "tpc", "itc", "lm", "pfa", "pfb", "nkb", "ex",
}

# canonical word -> filter it produces (after synonyms are applied)
CANONICAL: dict[str, dict[str, Any]] = {
    "цилиндрическая": {"form": "bullet"},
    "купольная": {"form": "dome"},
    "мини-купольная": {"form": "minidome"},
    "ptz": {"form": "ptz"},
    "pt": {"form": "pt"},
    "fisheye": {"form": "fisheye"},
    "панорамная": {"form": "panoramic"},
    "уличная": {"feature": "outdoor"},
    "внутренняя": {"indoor": True},
    "wi-fi": {"feature": "wifi"},
    "4g": {"feature": "lte"},
    "ии": {"feature": "ai"},
    "full-color": {"feature": "full_color"},
    "poe": {"feature": "poe"},
    "микрофон": {"feature": "mic"},
    "динамик": {"feature": "speaker"},
    "лица": {"feature": "face"},
    "номера": {"feature": "anpr"},
    "моториз": {"feature": "motorized"},
    "сдерживание": {"feature": "active_deterrence"},
    "ik10": {"feature": "ik10"},
    "dual-light": {"feature": "dual_light"},
    "starlight": {"feature": "starlight"},
    "автослежение": {"feature": "autotracking"},
    "подсчет": {"feature": "people_counting"},
    "ip": {"tech": "ip"},
    "hdcvi": {"tech": "hdcvi"},
    "nvr": {"kind": "recorder", "tech": "ip"},
    "xvr": {"kind": "recorder", "tech": "hdcvi"},
    "регистратор": {"kind": "recorder"},
    "коммутатор": {"kind": "switch"},
    "домофон": {"kind": "intercom"},
    "тепловизор": {"kind": "thermal"},
    "монитор": {"kind": "monitor"},
    "камера": {"kind": "camera"},
    "камеры": {"kind": "camera"},
    "видеокамера": {"kind": "camera"},
    "видеокамеры": {"kind": "camera"},
}

STOPWORDS = {
    "с", "со", "и", "или", "для", "на", "в", "во", "по", "под", "без", "мне", "нужна", "нужен",
    "нужно", "нужны", "хочу", "какая", "какой", "есть", "the", "with", "for", "and", "a", "c",
    "руб", "рублей", "от", "до", "ик", "р", "₽", "шт", "лучшая", "лучший", "хорошая", "недорогая", "недорого",
}

NUMBER = r"(\d+(?:[.,]\d+)?)"


def _num(s: str) -> float:
    return float(s.replace(",", ".").replace(" ", ""))


def _money(value: str, suffix: str | None) -> float:
    v = _num(value)
    if suffix and suffix.lower()[0] in ("к", "k", "т"):
        v *= 1000
    return v


@dataclass
class ParsedQuery:
    raw: str
    normalized: str = ""
    model_tokens: list[str] = field(default_factory=list)
    text_tokens: list[str] = field(default_factory=list)
    filters: dict[str, Any] = field(default_factory=dict)
    chips: list[dict[str, str]] = field(default_factory=list)
    layout_fixed: str | None = None

    @property
    def has_text(self) -> bool:
        return bool(self.model_tokens or self.text_tokens)


def parse_synonyms(text: str) -> list[tuple[re.Pattern[str], str]]:
    rules: list[tuple[str, str]] = []
    for line in (text or "").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=>" not in line:
            continue
        left, right = line.split("=>", 1)
        target = right.strip().lower()
        for alias in left.split(","):
            alias = alias.strip().lower()
            if alias and alias != target:
                rules.append((alias, target))
    # longest aliases first so "мини купол" beats "купол"
    rules.sort(key=lambda r: -len(r[0]))
    return [
        (re.compile(r"(?<![\w-])" + re.escape(a) + r"(?![\w-])", re.I), t) for a, t in rules
    ]


def normalize_model(s: str) -> str:
    return re.sub(r"[^A-Z0-9]", "", s.upper())


def is_model_like(tok: str) -> bool:
    t = tok.lower()
    if re.fullmatch(r"[a-z0-9\-/().+_]+", t) is None:
        return False
    if re.search(r"[a-z]", t) and re.search(r"\d", t):
        return True
    if t.strip("-") in MODEL_FRAGMENTS:
        return True
    return bool(re.fullmatch(r"\d{3,}", t))


def _vocab(synonyms: list[tuple[re.Pattern[str], str]]) -> set[str]:
    words = set(CANONICAL) | {t for _, t in synonyms}
    for rx, _ in synonyms:
        words.add(rx.pattern.replace("(?<![\\w-])", "").replace("(?![\\w-])", "").replace("\\", ""))
    return {w.lower() for w in words}


def fix_layout(query: str, vocab: set[str]) -> str:
    out = []
    for tok in query.split():
        if (
            re.search(r"[а-яё]", tok, re.I)
            and not re.search(r"[a-z]", tok, re.I)
            and re.match(r"[а-яё\[\];',.`]{2}", tok, re.I)  # "4мп", "2.8мм" are units, not models
        ):
            alt = tok.translate(RU_TO_EN)
            if tok.lower() not in vocab and (is_model_like(alt) or alt.lower() in MODEL_FRAGMENTS):
                out.append(alt.upper())
                continue
        elif re.fullmatch(r"[a-z\[\];',.`]+", tok, re.I) and not is_model_like(tok):
            alt = tok.translate(EN_TO_RU).lower()
            if alt in vocab and tok.lower() not in vocab:
                out.append(alt)
                continue
        out.append(tok)
    return " ".join(out)


def parse_query(
    raw: str,
    synonyms: list[tuple[re.Pattern[str], str]] | None = None,
    *,
    layout_fix: bool = True,
) -> ParsedQuery:
    synonyms = synonyms or []
    pq = ParsedQuery(raw=raw)
    q = re.sub(r"\s+", " ", (raw or "").strip())
    if not q:
        return pq

    if layout_fix:
        fixed = fix_layout(q, _vocab(synonyms))
        if fixed != q:
            pq.layout_fixed = fixed
            q = fixed

    s = q.lower().replace("ё", "е")
    s = re.sub(r"([a-z0-9+])-(?=[а-я])", r"\1 ", s)  # "ip-камера" -> "ip камера"
    for rx, target in synonyms:
        s = rx.sub(target, s)
    pq.normalized = s
    f: dict[str, Any] = {}

    def chip(kind: str, label: str) -> None:
        pq.chips.append({"type": kind, "label": label})

    def take(rx: str, handler) -> None:  # noqa: ANN001
        nonlocal s
        for m in list(re.finditer(rx, s, re.I)):
            if handler(m) is not False:
                s = s.replace(m.group(0), " ", 1)

    # ---- megapixels: "4мп", "4 mp", "от 4мп", "4+ мп", "4k"
    def h_mp(m: re.Match[str]):
        v = _num(m.group(2))
        if not 0.5 <= v <= 64:
            return False
        if m.group(1) or m.group(3):
            f["mp_min"] = v
            chip("mp", f"от {v:g} Мп")
        else:
            f.setdefault("mp", []).append(v)
            chip("mp", f"{v:g} Мп")
        return None

    take(r"(от\s*)?" + NUMBER + r"\s*(\+)?\s*(?:мп|mp|мегапиксел\w*|мпикс\w*|mpx)(?![a-zа-я])", h_mp)

    def h_4k(m: re.Match[str]):
        f.setdefault("mp", []).append(8.0)
        chip("mp", "4K (8 Мп)")

    take(r"(?<![\w-])4k(?![\w-])", h_4k)

    # ---- lens: "2.8мм", "2,8 мм", "объектив 3.6"
    def h_lens(m: re.Match[str]):
        v = _num(m.group(1) or m.group(2))
        if not 1 <= v <= 300:
            return False
        f["lens"] = v
        chip("lens", f"объектив {v:g} мм")
        return None

    take(r"(?:(?<![\d.,])" + NUMBER + r"\s*мм)|(?:объектив\w*\s+" + NUMBER + r")", h_lens)

    # ---- zoom: "25x", "32х"
    def h_zoom(m: re.Match[str]):
        v = int(m.group(1))
        if not 2 <= v <= 60:
            return False
        f["zoom_min"] = v
        chip("zoom", f"зум от {v}x")
        return None

    take(r"(?<![\w.])(\d{1,2})\s*[xх](?![a-zа-я0-9])", h_zoom)

    # ---- IR range: "ик 50", "ик-подсветка 50м", "ик до 80 м", "50м"
    def h_ir(m: re.Match[str]):
        v = int(m.group(1) or m.group(2))
        if not 5 <= v <= 500:
            return False
        f["ir_min"] = v
        chip("ir", f"ИК от {v} м")
        return None

    take(
        r"(?:(?:ик|ir)[\s-]*(?:подсветк\w*)?\s*(?:до|от)?\s*(\d{1,3})\s*(?:м|m)?(?![\w]))"
        r"|(?:(?<![\w.,])(\d{1,3})\s*(?:м|m|метр\w*)(?![\wа-я]))",
        h_ir,
    )

    # ---- channels: "16 каналов", "8ch", "nvr 32"
    def h_ch(m: re.Match[str]):
        v = int(m.group(1))
        if not 1 <= v <= 256:
            return False
        f["channels"] = v
        chip("channels", f"{v} каналов")
        return None

    take(r"(?<![\d.,])(\d{1,3})\s*[-\s]?(?:канал\w*|кан|ch|кнл|х?-?канальн\w*)(?![a-zа-я])", h_ch)

    # ---- switch ports: "8 портов", "24 port"
    def h_ports(m: re.Match[str]):
        f["ports"] = int(m.group(1))
        chip("ports", f"{m.group(1)} портов")

    take(r"(?<![\d.,])(\d{1,2})\s*-?\s*(?:порт\w*|port\w*)", h_ports)

    # ---- price: "до 15000", "до 15к", "дешевле 10 тыс", "от 5000", "10-20 тыс", "< 9000"
    def h_price_range(m: re.Match[str]):
        lo = _money(m.group(1), m.group(3) or m.group(2))
        hi = _money(m.group(2), m.group(3))
        if hi < 300 or lo >= hi:
            return False
        f["price_min"], f["price_max"] = lo, hi
        chip("price", f"{lo:,.0f} – {hi:,.0f}".replace(",", " "))
        return None

    take(
        r"(\d[\d\s]{0,8}?)\s*(?:-|–|—|до)\s*(\d[\d\s]{0,8}?)\s*(к|k|тыс\w*|т\.р\.?|₽|руб\w*|р\.?)(?![a-zа-я])",
        h_price_range,
    )

    def h_price(m: re.Match[str]):
        op, value, suffix = m.group(1).lower(), m.group(2), m.group(3)
        v = _money(value, suffix)
        if v < 300 and not suffix:
            return False
        if op in ("от", ">", ">=", "дороже"):
            f["price_min"] = v
            chip("price", f"от {v:,.0f}".replace(",", " "))
        else:
            f["price_max"] = v
            chip("price", f"до {v:,.0f}".replace(",", " "))
        return None

    take(
        r"(до|<=|<|дешевле|не дороже|максимум|от|>=|>|дороже)\s*(\d[\d\s]{0,8}\d|\d)\s*"
        r"(к|k|тыс\w*|т\.р\.?|₽|руб\w*|р\.)?(?![a-zа-я0-9])",
        h_price,
    )

    # ---- canonical words (after synonym normalization)
    for word in sorted(CANONICAL, key=len, reverse=True):
        rx = re.compile(r"(?<![\w-])" + re.escape(word) + r"(?![\w-])", re.I)
        if not rx.search(s):
            continue
        rule = CANONICAL[word]
        if "form" in rule:
            f.setdefault("form", [])
            if rule["form"] not in f["form"]:
                f["form"].append(rule["form"])
                chip("form", FORM_LABELS.get(rule["form"], rule["form"]))
        if "feature" in rule:
            f.setdefault("features", [])
            if rule["feature"] not in f["features"]:
                f["features"].append(rule["feature"])
                chip("feature", FEATURE_LABELS.get(rule["feature"], rule["feature"]))
        if rule.get("indoor"):
            f["indoor"] = True
            chip("feature", "Для помещений")
        if "tech" in rule and "tech" not in f:
            f["tech"] = rule["tech"]
            chip("tech", TECH_LABELS.get(rule["tech"], rule["tech"]))
        if "kind" in rule and "kind" not in f:
            f["kind"] = rule["kind"]
            chip("kind", KIND_LABELS.get(rule["kind"], rule["kind"]))
        s = rx.sub(" ", s)

    # ---- bare numbers next to recorders/switches: "nvr 16" -> 16 channels, "коммутатор 8" -> 8 ports
    if f.get("kind") in ("recorder", "switch"):
        key = "channels" if f["kind"] == "recorder" else "ports"
        if key not in f:
            m = re.search(r"(?<![\w.,])(4|5|8|9|10|16|24|26|28|32|48|64|128|256)(?![\w.,])", s)
            if m:
                f[key] = int(m.group(1))
                chip(key, f"{m.group(1)} {'каналов' if key == 'channels' else 'портов'}")
                s = s[: m.start()] + " " + s[m.end():]

    # ---- leftovers: model fragments and free text
    for tok in re.split(r"[\s,;]+", s):
        tok = tok.strip(" .:!?\"'()[]")
        if not tok or tok in STOPWORDS:
            continue
        if is_model_like(tok):
            norm = normalize_model(tok)
            if norm and norm not in pq.model_tokens:
                pq.model_tokens.append(norm)
        elif len(tok) >= 2 and not tok.isdigit():
            pq.text_tokens.append(tok)

    pq.filters = f
    return pq
