from app.services.photos import SearchHit, candidates, pick_match, result_names


def hit(name: str) -> SearchHit:
    return SearchHit(name=name, url=f"https://x/products/{name.lower()}", thumb=None)


def test_lens_pal_revision_are_equivalent():
    c = candidates("DH-IPC-HFW2449TLP-S-PV-0360B-S2", "camera")
    assert "IPC-HFW2449TL-S-PV" in c.exact
    m = pick_match(c, [hit("IPC-HFW2449TL-S-PV"), hit("IPC-HFW2449TL-S-PV-ATC")])
    assert m and m.quality == "found" and m.hit.name == "IPC-HFW2449TL-S-PV"


def test_feature_suffix_is_never_dropped():
    c = candidates("DH-IPC-HFW5259TP-ASE-IL-0280B", "camera")
    assert c.close == []
    assert pick_match(c, [hit("IPC-HFW5259T-ASE")]) is None


def test_soft_suffix_gives_close_match():
    c = candidates("DH-XVR5216AN-4KL-I3/T(L)", "recorder")
    m = pick_match(c, [hit("XVR5216AN-4KL-I3"), hit("XVR5216AN-4KL-I3/T")])
    assert m and m.quality == "close" and m.hit.name == "XVR5216AN-4KL-I3/T"


def test_non_camera_digits_are_not_a_lens():
    assert candidates("QSFP-1310-10-SMF", "network").exact[0] == "QSFP-1310-10-SMF"


def test_result_name_variants():
    assert "VTH2421FW" in result_names("VTH2421FB/VTH2421FW")
    assert result_names("XVR5832S-I3/T") == ["XVR5832S-I3/T"]
    assert "P3D" in result_names("Picoo P3D")


# ------------------------------------------------------------------ sources / reliability

import asyncio

import httpx

from app.services import photos as ph


def test_icecat_codes_prefixed_and_exact_first():
    c = candidates("DH-IPC-HFW1239TL1P-A-IL-0360B-S7", "camera")
    codes = ph.IcecatSource.codes("DH-IPC-HFW1239TL1P-A-IL-0360B-S7", c)
    assert codes[0] == ("DH-IPC-HFW1239TL1P-A-IL-0360B-S7", "found")
    assert ("DH-IPC-HFW1239TL1-A-IL", "found") in codes
    assert all(q == "found" for _, q in codes)


class FakeSource:
    def __init__(self, name, result=None, exc=None):
        self.name, self.result, self.exc, self.calls = name, result, exc, 0

    async def find(self, model, c, allow_close):
        self.calls += 1
        if self.exc:
            raise self.exc
        return self.result


def run(sources, monkeypatch, stored=("/api/media/p/x.webp",)):
    async def fake_dl(http, urls, max_images, max_size):
        return (list(stored), None) if urls and stored else ([], None)

    monkeypatch.setattr(ph, "download_images", fake_dl)
    return asyncio.run(ph.fetch_for_model(None, sources, "DH-PFS3005-5ET", "switch",
                                          allow_close=True, max_images=3, max_size=800))


def hit_of(src, quality="found"):
    return ph.Hit(source=src, quality=quality, matched="PFS3005-5ET", page_url=None, images=["u"])


def test_falls_back_to_next_source(monkeypatch):
    a, b = FakeSource("dahuasecurity"), FakeSource("icecat", hit_of("icecat"))
    r = run([a, b], monkeypatch)
    assert r.status == "found" and r.source == "icecat" and r.tried == ["dahuasecurity", "icecat"]


def test_exact_in_later_source_beats_close(monkeypatch):
    a = FakeSource("dahuasecurity", hit_of("dahuasecurity", "close"))
    b = FakeSource("icecat", hit_of("icecat"))
    r = run([a, b], monkeypatch)
    assert r.status == "found" and r.source == "icecat"


def test_network_failure_is_transient_not_not_found(monkeypatch):
    a = FakeSource("dahuasecurity", exc=ph.TransientError("ConnectError: [Errno -3]"))
    b = FakeSource("icecat")
    r = run([a, b], monkeypatch)
    assert r.status == "error" and r.transient


def test_found_despite_other_source_down(monkeypatch):
    a = FakeSource("dahuasecurity", exc=ph.TransientError("timeout"))
    b = FakeSource("icecat", hit_of("icecat"))
    assert run([a, b], monkeypatch).status == "found"


def test_http_retries_then_transient(monkeypatch):
    calls = 0

    def handler(request):
        nonlocal calls
        calls += 1
        raise httpx.ConnectError("[Errno -3] Temporary failure in name resolution")

    async def go():
        http = ph.Http(0)
        http.http = httpx.AsyncClient(transport=httpx.MockTransport(handler))
        real_sleep = asyncio.sleep
        monkeypatch.setattr(ph.asyncio, "sleep", lambda *_: real_sleep(0))
        try:
            await http.get("https://x/a")
        finally:
            await http.aclose()

    try:
        asyncio.run(go())
        raise AssertionError("expected TransientError")
    except ph.TransientError:
        pass
    assert calls == 3


def test_store_image_concurrent_same_url(tmp_path, monkeypatch):
    import io as _io
    from concurrent.futures import ThreadPoolExecutor

    from PIL import Image

    monkeypatch.setattr(ph, "media_dir", lambda: tmp_path)
    buf = _io.BytesIO()
    Image.new("RGB", (200, 200), "red").save(buf, "PNG")
    with ThreadPoolExecutor(8) as ex:
        res = list(ex.map(lambda _: ph.store_image(buf.getvalue(), "https://x/same.png", 100), range(16)))
    assert len(set(res)) == 1 and res[0].startswith("/api/media/p/")
    assert not list(tmp_path.rglob("*.tmp"))


def test_netgate_pauses_after_consecutive_failures():
    async def go():
        g = ph.NetGate(asyncio.Event())
        g.fail(); g.fail()
        assert not g.offline
        g.fail()
        assert g.offline
        g.cancelled.set()
        await asyncio.wait_for(g.wait(), 1)
    asyncio.run(go())


def test_dahua_search_parses_transmission_hits():
    page = ('<div id="searchProducts"><ul><li>'
            '<a href="https://transmission.dahuasecurity.com/en/product-list/home/sohoswitches/plasticswitch/pfs3008-8gt-l" target="_blank">'
            '<div class="search-products-img"><img src="https://material.dahuasecurity.com/x/PFS3008-8GT-L_1_thumb.png" '
            'alt="PFS3008-8GT-L"></div></a></li></ul></div>')

    async def go():
        http = ph.Http(0)
        http.http = httpx.AsyncClient(transport=httpx.MockTransport(lambda r: httpx.Response(200, text=page)))
        try:
            return await ph.DahuaSource(http, "https://www.dahuasecurity.com").find(
                "DH-PFS3008-8GT-L", candidates("DH-PFS3008-8GT-L"), True)
        finally:
            await http.aclose()

    hit = asyncio.run(go())
    assert hit is not None and hit.quality == "found"
    # no gallery request for the JS-only transmission site: the search thumbnail is used
    assert hit.images == ["https://material.dahuasecurity.com/x/PFS3008-8GT-L_1_thumb.png"]


def _bing(title, murl="https://shop.example/img.jpg", purl="https://shop.example/p"):
    return {"t": title, "desc": "", "murl": murl, "turl": "https://tse.mm.bing.net/th?id=1", "purl": purl}


def test_bing_rate_exact_lens_variant_close_and_unrelated():
    m = "DH-IPC-HDW1439T1P-A-LED-0280B-PRO"
    c = candidates(m)
    rate = ph.BingSource.rate
    # lens written differently in a shop URL - still the exact model
    assert rate(m, c, _bing("x", purl="https://bittel.bg/ipc-hdw1439-t1-a-led-0280-b-pro")) == "found"
    assert rate(m, c, _bing("Dahua DH-IPC-HDW1439T1P-A-LED-0360B-PRO 4MP")) == "found"
    # same housing, other feature set
    assert rate(m, c, _bing("x", murl="https://a.pro/DH-IPC-HDW1439T1P-A-IL-0280B-S6.jpg")) == "close"
    assert rate(m, c, _bing("Dahua IPC-HDW2449T-S-IL 4MP")) is None


def test_bing_find_parses_results_and_prefers_exact():
    import html as h
    import json as j
    items = [_bing("Dahua IPC-HDW1439T1-A-IL", murl="https://a/close.jpg"),
             _bing("Dahua DH-IPC-HDW1439T1P-A-LED-0280B-PRO", murl="https://b/exact.jpg"),
             _bing("Hikvision DS-2CD1343", murl="https://c/other.jpg")]
    page = "".join(f'<a class="iusc" style="x" m="{h.escape(j.dumps(it))}" href="#">' for it in items)

    async def go():
        http = ph.Http(0)
        http.http = httpx.AsyncClient(transport=httpx.MockTransport(lambda r: httpx.Response(200, text=page)))
        try:
            m = "DH-IPC-HDW1439T1P-A-LED-0280B-PRO"
            return await ph.BingSource(http).find(m, candidates(m, "camera"), True)
        finally:
            await http.aclose()

    hit = asyncio.run(go())
    assert hit is not None and hit.quality == "found" and hit.limit == 1
    assert hit.images[0] == "https://b/exact.jpg" and "https://c/other.jpg" not in hit.images


def test_mangled_sources_setting_uses_all_sources():
    http = ph.Http(0)
    s = {"photos_sources": ["onliner", "daicecat", "huasecurity"], "photos_base_url": "https://x",
         "photos_icecat_user": "", "photos_max_size": 800}
    assert [x.name for x in ph.build_sources(http, s)] == list(ph.SOURCES)


def test_sources_setting_rejects_unknown_names():
    import pytest
    from app.services.app_settings import SETTINGS_SCHEMA, _coerce
    item = next(i for i in SETTINGS_SCHEMA if i["key"] == "photos_sources")
    assert _coerce(item, "Bing\nicecat") == ["bing", "icecat"]
    with pytest.raises(ValueError):
        _coerce(item, "daicecat")


def _torus_card(name, pid=1, brand="Dahua"):
    url = f"https://tdtorus.ru/cat/product-{name.lower()}"
    return (f'<div class="image product-image">\n  <a href="{url}">\n    <img data-responsive="true" '
            f'src="https://tdtorus.ru/uploads/product/{pid}/{name}.png" srcset="x?w=100 100w">\n  </div>'
            f'<a href="{url}" class="product-card-title">'
            f'<span class="desktop">{name} IP-камера 4Мп<br>{brand}</span></a>')


def test_torus_search_and_pick():
    page = (_torus_card("DH-IPC-HDW1439TP-A-LED-0280B-S4", 1) + _torus_card("DH-IPC-HDW1439T1P-A-LED-0280B-S6", 2)
            + _torus_card("DH-IPC-HDW1439T1P-A-LED-0280B-PRO", 3, "Imou"))

    async def go(model):
        http = ph.Http(0)
        http.http = httpx.AsyncClient(transport=httpx.MockTransport(lambda r: httpx.Response(200, text=page)))
        try:
            return await ph.TorusSource(http).find(model, candidates(model, "camera"), True)
        finally:
            await http.aclose()

    # lens/revision variant of the same camera; other brands are ignored
    hit = asyncio.run(go("DH-IPC-HDW1439T1P-A-LED-0360B-S6"))
    assert hit.quality == "found" and hit.images == ["https://tdtorus.ru/uploads/product/2/DH-IPC-HDW1439T1P-A-LED-0280B-S6.png"]
    # "-PRO" only in our name: same housing, marked for review
    hit = asyncio.run(go("DH-IPC-HDW1439T1P-A-LED-0280B-PRO"))
    assert hit.quality == "close" and hit.matched == "DH-IPC-HDW1439T1P-A-LED-0280B-S6"
    assert asyncio.run(go("DH-IPC-HFW2449S-S-IL-0280B")) is None


def test_prox_is_a_soft_suffix():
    c = candidates("DH-IPC-HFW2449TLP-S-LED-0280B-PROX", "camera")
    assert "IPC-HFW2449TLP-S-LED" in c.close
    hits = [ph.SearchHit(name="DH-IPC-HFW2449TLP-S-LED-0280B-PRO", url="u", thumb="t"),
            ph.SearchHit(name="DH-IPC-HFW2449TLP-S-PV-0280B", url="u2", thumb="t2")]
    h, q = ph.TorusSource.pick("DH-IPC-HFW2449TLP-S-LED-0280B-PROX", c, hits)
    assert h.url == "u" and q == "close"
