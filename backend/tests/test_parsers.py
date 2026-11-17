from app.services.app_settings import DEFAULT_SYNONYMS
from app.services.query_parser import parse_query, parse_synonyms
from app.services.specs import extract

SYN = parse_synonyms(DEFAULT_SYNONYMS)


def q(text):
    return parse_query(text, SYN)


def test_natural_query():
    p = q("уличная 4мп купольная poe до 15 тыс")
    assert p.filters["mp"] == [4.0]
    assert p.filters["price_max"] == 15000
    assert p.filters["form"] == ["dome"]
    assert set(p.filters["features"]) == {"outdoor", "poe"}
    assert not p.model_tokens and not p.text_tokens


def test_model_fragment_and_layout_fix():
    assert q("hfw2449").model_tokens == ["HFW2449"]
    p = q("рац2449")
    assert p.layout_fixed == "HFW2449" and p.model_tokens == ["HFW2449"]
    assert q("ekbxyfz").filters["features"] == ["outdoor"]


def test_units_are_not_layout_fixed():
    p = q("4мп 2.8мм ик 50м")
    assert p.filters["mp"] == [4.0] and p.filters["lens"] == 2.8 and p.filters["ir_min"] == 50
    assert p.layout_fixed is None


def test_recorders_and_switches():
    p = q("nvr 16")
    assert p.filters["kind"] == "recorder" and p.filters["tech"] == "ip" and p.filters["channels"] == 16
    p = q("коммутатор 8 портов poe")
    assert p.filters["kind"] == "switch" and p.filters["ports"] == 8


def test_price_range_and_zoom():
    p = q("ptz 25x 10-20 тыс")
    assert p.filters["zoom_min"] == 25 and p.filters["form"] == ["ptz"]
    assert (p.filters["price_min"], p.filters["price_max"]) == (10000, 20000)


def test_extract_camera_specs():
    desc = (
        "Уличная мини-купольная IP-видеокамера с ИИ\n"
        "4Мп; 1/2.9” CMOS; объектив 2.8мм; WDR(120дБ); чувствительность 0.006лк@F1.6 сжатие: H.265+, H.264; "
        "ИК-подсветка до 30м, LED-подсветка до 30м; MicroSD до 256Гбайт; защита: IP67, IK10; "
        "питание: 12В(DC), PoE; корпус: металл. Рабочая температура -40°C ~ +60°C."
    )
    e = extract(desc, "DH-IPC-HDBW2449FP-AS-IL-0280B", "IPC 2 серии")
    assert (e.kind, e.technology, e.form_factor, e.megapixels) == ("camera", "ip", "minidome", 4.0)
    assert e.lens_min == e.lens_max == 2.8 and e.ir_range == 30
    assert {"outdoor", "ai", "poe", "ik10", "sd"} <= set(e.features)
    assert e.specs["power"] == "12В(DC), PoE" and e.specs["housing"] == "металл"
    assert e.specs["temperature"] == "-40…+60 °C"


def test_extract_recorder():
    e = extract("8-канальный IP-видеорегистратор c PoE, 4K, H.265+ и ИИ\nВходящий поток до 16Мп", "DHI-NVR4208-8P-EI")
    assert e.kind == "recorder" and e.channels == 8 and e.megapixels is None
    assert e.specs["max_resolution"] == "до 16 Мп"
