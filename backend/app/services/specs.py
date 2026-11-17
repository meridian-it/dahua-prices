"""Extraction of structured specs from free-text Dahua price-list descriptions.

Descriptions look like:
    "Уличная купольная IP-видеокамера с ИИ\n4Мп; 1/2.9” CMOS; объектив 2.8мм; ..."
The first line is a product title, the rest is a semicolon separated spec list.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

NUM = r"(\d+(?:[.,]\d+)?)"


def _f(v: str | None) -> float | None:
    if v is None:
        return None
    try:
        return float(v.replace(",", "."))
    except ValueError:
        return None


def _num(v: float | None) -> float | int | None:
    if v is None:
        return None
    return int(v) if float(v).is_integer() else round(v, 3)


# ---------------------------------------------------------------- kinds / forms

KIND_RULES: list[tuple[str, re.Pattern[str]]] = [
    (
        "accessory",
        re.compile(
            r"^(?:настенн\w+ |потолочн\w+ |угловой |)кронштейн|монтажн\w+ коробк|^крепление|^адаптер"
            r"|блок питания|карта памяти|memory card|^кабель|козыр|^разъ[её]м|соединитель",
            re.I,
        ),
    ),
    ("network", re.compile(r"роутер|маршрутизатор|\bSFP\b|медиаконвертер|точка доступа", re.I)),
    ("thermal", re.compile(r"тепловиз", re.I)),
    ("recorder", re.compile(r"видеорегистратор|\bNVR\b|\bXVR\b", re.I)),
    ("camera", re.compile(r"видеокамер|камер[аы]\b|камера распознавания", re.I)),
    ("switch", re.compile(r"коммутатор", re.I)),
    ("intercom", re.compile(r"домофон|вызывн|смарт-панел|панель управления", re.I)),
    ("monitor", re.compile(r"монитор", re.I)),
    ("alarm", re.compile(r"сигнализац|датчик|извещател|сирен", re.I)),
    ("access", re.compile(r"турникет|считывател|контроллер доступа|скуд|замок", re.I)),
]

KIND_LABELS = {
    "camera": "Камера",
    "thermal": "Тепловизор",
    "recorder": "Видеорегистратор",
    "switch": "Коммутатор",
    "intercom": "Домофония",
    "monitor": "Монитор",
    "alarm": "Сигнализация",
    "access": "СКУД",
    "accessory": "Аксессуар",
    "network": "Сетевое оборудование",
    "other": "Прочее",
}

FORM_RULES: list[tuple[str, re.Pattern[str]]] = [
    ("ptz", re.compile(r"\bPTZ\b", re.I)),
    ("pt", re.compile(r"\bPT\b|поворотн", re.I)),
    ("fisheye", re.compile(r"fisheye|рыбий глаз", re.I)),
    ("panoramic", re.compile(r"панорамн|multi-sensor|мультисенсор", re.I)),
    ("minidome", re.compile(r"мини-купольн", re.I)),
    ("dome", re.compile(r"купольн", re.I)),
    ("bullet", re.compile(r"цилиндрическ", re.I)),
    ("box", re.compile(r"корпусн", re.I)),
    ("cube", re.compile(r"кубическ|компактн", re.I)),
]

FORM_LABELS = {
    "bullet": "Цилиндрическая",
    "dome": "Купольная",
    "minidome": "Мини-купольная",
    "ptz": "PTZ",
    "pt": "PT (поворотная)",
    "fisheye": "Fisheye",
    "panoramic": "Панорамная",
    "box": "Корпусная",
    "cube": "Компактная",
}

TECH_LABELS = {"ip": "IP", "hdcvi": "HDCVI"}

# feature key -> (label, pattern)
FEATURES: dict[str, tuple[str, re.Pattern[str]]] = {
    "outdoor": ("Уличная", re.compile(r"уличн", re.I)),
    "ai": ("ИИ / WizSense", re.compile(r"\bИИ\b|искусственн|wizsense|wizmind|xinghan", re.I)),
    "poe": ("PoE", re.compile(r"\bE?PoE\+?\b", re.I)),
    "wifi": ("Wi-Fi", re.compile(r"wi-?fi", re.I)),
    "lte": ("4G / LTE", re.compile(r"\b[34]G\b|LTE", re.I)),
    "mic": ("Микрофон", re.compile(r"микрофон", re.I)),
    "speaker": ("Динамик", re.compile(r"динамик|громкоговор", re.I)),
    "two_way_audio": ("Двусторонняя связь", re.compile(r"двухсторонн|двусторонн", re.I)),
    "audio_io": ("Аудиовход/выход", re.compile(r"аудиовх", re.I)),
    "alarm_io": ("Тревожные вх/вых", re.compile(r"тревожн\w*\s+вх", re.I)),
    "sd": ("MicroSD", re.compile(r"micro\s?sd", re.I)),
    "full_color": ("Full-color", re.compile(r"full[- ]?colou?r|wizcolor|полноцветн", re.I)),
    "dual_light": ("Smart Dual Light", re.compile(r"smart dual light|двойн\w+ подсветк", re.I)),
    "starlight": ("Starlight", re.compile(r"starlight", re.I)),
    "active_deterrence": ("Активное сдерживание", re.compile(r"активн\w+ сдержив|\bPV\b|сирен|красно-син", re.I)),
    "motorized": ("Моторизованный объектив", re.compile(r"моториз|вариофокал", re.I)),
    "ir": ("ИК-подсветка", re.compile(r"ИК-подсветк|ИК подсветк", re.I)),
    "led": ("LED-подсветка", re.compile(r"LED-подсветк|LED подсветк", re.I)),
    "wdr": ("WDR", re.compile(r"\bWDR\b", re.I)),
    "ik10": ("Антивандальная IK10", re.compile(r"\bIK10\b", re.I)),
    "face": ("Распознавание лиц", re.compile(r"\bлиц\b|лиц[аом]|face", re.I)),
    "anpr": ("Распознавание номеров", re.compile(r"номер(ов|а)\b|ANPR|LPR", re.I)),
    "people_counting": ("Подсчёт людей", re.compile(r"подсч[её]т", re.I)),
    "perimeter": ("Охрана периметра", re.compile(r"периметр|пересечени\w+ лини", re.I)),
    "smd": ("SMD (умная детекция)", re.compile(r"\bSMD\b", re.I)),
    "autotracking": ("Автослежение", re.compile(r"автоматическ\w+ слежени|автослежени", re.I)),
    "hdd": ("HDD", re.compile(r"\bHDD\b|SATA", re.I)),
    "cloud": ("Облачное управление", re.compile(r"облачн", re.I)),
}

SPEC_LABELS: dict[str, str] = {
    "kind": "Тип устройства",
    "technology": "Технология",
    "form_factor": "Форм-фактор",
    "megapixels": "Разрешение, Мп",
    "sensor": "Матрица",
    "lens": "Объектив",
    "zoom": "Оптический зум",
    "ir_range": "ИК-подсветка, м",
    "led_range": "LED-подсветка, м",
    "wdr": "WDR, дБ",
    "sensitivity": "Чувствительность, лк",
    "compression": "Сжатие",
    "streams": "Потоки",
    "sd_max": "MicroSD, до Гб",
    "audio": "Аудио вх/вых",
    "alarm": "Тревожные вх/вых",
    "protection": "Защита",
    "power": "Питание",
    "housing": "Корпус",
    "temperature": "Рабочая температура",
    "channels": "Каналы",
    "max_resolution": "Макс. разрешение записи",
    "ports": "Порты",
    "poe_budget": "PoE бюджет, Вт",
    "hdd_bays": "HDD",
    "screen": "Диагональ",
}

# order of spec keys for compare tables
SPEC_ORDER = list(SPEC_LABELS.keys())


@dataclass
class Extracted:
    title: str = ""
    kind: str = "other"
    technology: str | None = None
    form_factor: str | None = None
    megapixels: float | None = None
    lens_min: float | None = None
    lens_max: float | None = None
    ir_range: int | None = None
    channels: int | None = None
    features: list[str] = field(default_factory=list)
    specs: dict[str, Any] = field(default_factory=dict)


RE_MP_ANY = re.compile(NUM + r"\s*[MМ][PП](?![a-zа-я])", re.I)
RE_4K = re.compile(r"\b4K\b", re.I)
RE_SENSOR = re.compile(r"(1/\d+(?:[.,]\d+)?)\s*[\"”″'']")
RE_LENS_RANGE = re.compile(NUM + r"\s*(?:мм)?\s*[~\-–—]\s*" + NUM + r"\s*мм", re.I)
RE_LENS_FIXED = re.compile(r"объектив\w*\s+(?:с фокусным расстоянием\s+)?" + NUM + r"\s*мм", re.I)
RE_LENS_ANY = re.compile(NUM + r"\s*мм", re.I)
RE_ZOOM = re.compile(r"(\d+)\s*[xх]\s*(?:оптическ|объектив|зум|моториз|\b)", re.I)
RE_IR = re.compile(r"ИК[- ]подсветк\w*\s*(?:до\s*)?(\d+)\s*м", re.I)
RE_IR2 = re.compile(r"дальность ИК[- ]подсветки\s*(\d+)\s*м", re.I)
RE_LED = re.compile(r"LED[- ]подсветк\w*\s*(?:до\s*)?(\d+)\s*м", re.I)
RE_WDR = re.compile(r"WDR\s*\(?\s*(\d+)\s*дБ", re.I)
RE_SENS = re.compile(r"(\d+[.,]\d+)\s*лк", re.I)
RE_SD = re.compile(r"micro\s?SD\s*(?:до\s*)?(\d+)\s*(Гб|ГБ|Гбайт|Тб|ТБ|GB|TB)", re.I)
RE_AUDIO = re.compile(r"аудиовх\w*\.?/?\s*вых\w*\.?:?\s*(\d+\s*/\s*\d+)", re.I)
RE_ALARM = re.compile(r"тревожн\w*\s+вх\w*\.?/?\s*вых\w*\.?:?\s*(\d+\s*/\s*\d+)", re.I)
RE_IP = re.compile(r"\bIP6\d\b|\bIK\d\d\b", re.I)
RE_POWER = re.compile(r"питание:?\s*([^;]+?)(?=;|\.\s|\.$|,\s*[А-Я][а-я]|$)", re.I)
RE_HOUSING = re.compile(r"(?:корпус|материал корпуса):\s*([^;.]+?)(?=[;.]|,\s*[А-Я][а-я]|\s+[-–]\d|$)", re.I)
RE_TEMP = re.compile(r"([-–−]\s*\d+)\s*°?\s*C?\s*[~\-–]\s*\+?\s*(\d+)\s*°?\s*C", re.I)
RE_CHANNELS = re.compile(r"(\d+)[- ]?(?:ти|х|ми)?[- ]?канальн", re.I)
RE_PORTS = re.compile(r"(\d+)[- ]?портов", re.I)
RE_POE_BUDGET = re.compile(r"(?:бюджет|мощност)\w*\s*(?:PoE)?\s*:?\s*(?:до\s*)?(\d+)\s*Вт", re.I)
RE_HDD = re.compile(r"(\d+)\s*(?:x\s*)?(?:HDD|SATA)", re.I)
RE_SCREEN = re.compile(r"(\d+(?:[.,]\d+)?)\s*(?:\"|”|дюйм)", re.I)
RE_COMPRESSION = re.compile(r"(H\.26[45]\+?|MJPEG)", re.I)
RE_STREAMS = re.compile(r"(\d)\s*поток", re.I)


def _first(pattern: re.Pattern[str], text: str, group: int = 1) -> str | None:
    m = pattern.search(text)
    return m.group(group) if m else None


def extract(description: str | None, model: str = "", category: str = "") -> Extracted:
    text = (description or "").replace("\xa0", " ").strip()
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    title = re.sub(r"\s{2,}", " ", lines[0]) if lines else ""
    body = " ".join(lines[1:]) if len(lines) > 1 else ""
    if len(title) > 110:
        # single-line description: title is the first clause, rest is the body
        m = re.match(r"(.{20,110}?)(?:[;.]\s|\s(?=\d+/\d|\d+(?:[.,]\d+)?\s*[MМ][PП]))", title, re.I)
        cut = m.group(1) if m else title[:110].rsplit(" ", 1)[0]
        body = (title[len(cut):].lstrip(" ;.,") + " " + body).strip()
        title = cut.rstrip(" ,;")
    full = f"{title} {body}"
    ctx = f"{category} {title}"

    ex = Extracted(title=title)
    mp_rec: float | None = None

    # kind
    for key, rx in KIND_RULES:
        if rx.search(title):
            ex.kind = key
            break
    else:
        for key, rx in KIND_RULES:
            if rx.search(category):
                ex.kind = key
                break
    m_up = model.upper()
    if ex.kind == "other" and re.search(r"NVR|XVR", m_up):
        ex.kind = "recorder"

    is_video = ex.kind in ("camera", "thermal", "recorder")

    # technology
    if re.search(r"HDCVI|HD-CVI|\bCVI\b", ctx, re.I) or "-HAC-" in m_up or "XVR" in m_up:
        ex.technology = "hdcvi"
    elif re.search(r"\bIP\b|IP-", title) and is_video:
        ex.technology = "ip"
    elif is_video and re.search(r"IPC|NVR|SD\d|TPC|ITC", m_up):
        ex.technology = "ip"

    # form factor (cameras only)
    if ex.kind in ("camera", "thermal"):
        for key, rx in FORM_RULES:
            if rx.search(title):
                ex.form_factor = key
                break
        if ex.form_factor is None:
            if re.search(r"-SD\d", "-" + m_up):
                ex.form_factor = "ptz"
            elif re.search(r"HFW|B\dA|BF\d|-B\d", m_up):
                ex.form_factor = "bullet"
            elif re.search(r"HDW|HDBW|T\dA|D\dE|DF\d", m_up):
                ex.form_factor = "dome"

    # megapixels
    mp = _f(_first(RE_MP_ANY, full)) if (is_video or ex.kind == "intercom") else None
    if mp is not None and not 0 < mp <= 64:
        mp = None
    if ex.kind == "recorder":
        mp_rec = mp
        mp = None
    elif mp is None and ex.kind == "camera" and RE_4K.search(body):
        mp = 8.0
    ex.megapixels = mp

    specs: dict[str, Any] = {}
    specs["kind"] = KIND_LABELS.get(ex.kind, ex.kind)
    if ex.technology:
        specs["technology"] = TECH_LABELS[ex.technology]
    if ex.form_factor:
        specs["form_factor"] = FORM_LABELS[ex.form_factor]
    if ex.megapixels is not None:
        specs["megapixels"] = _num(ex.megapixels)
    if ex.kind == "recorder" and mp_rec:
        specs["max_resolution"] = f"до {_num(mp_rec)} Мп"

    if ex.kind in ("camera", "thermal", "intercom"):
        if s := _first(RE_SENSOR, body):
            specs["sensor"] = f'{s}" CMOS'

        lens_text = body
        m = RE_LENS_RANGE.search(lens_text)
        if m:
            ex.lens_min, ex.lens_max = _f(m.group(1)), _f(m.group(2))
            specs["lens"] = f"{_num(ex.lens_min)}–{_num(ex.lens_max)} мм"
        else:
            v = _f(_first(RE_LENS_FIXED, lens_text))
            if v is None and ex.kind in ("camera", "thermal"):
                v = _f(_first(RE_LENS_ANY, lens_text))
            if v and v < 100:
                ex.lens_min = ex.lens_max = v
                specs["lens"] = f"{_num(v)} мм"
        if z := _first(RE_ZOOM, body):
            if 1 < int(z) <= 60:
                specs["zoom"] = f"{z}x"

        ir = _first(RE_IR, full) or _first(RE_IR2, full)
        if ir:
            ex.ir_range = int(ir)
            specs["ir_range"] = int(ir)
        if led := _first(RE_LED, full):
            specs["led_range"] = int(led)
        if w := _first(RE_WDR, body):
            specs["wdr"] = int(w)
        if sens := _first(RE_SENS, body):
            specs["sensitivity"] = sens.replace(",", ".")
        comps = []
        for c in RE_COMPRESSION.findall(body):
            c = c.upper()
            if c not in comps:
                comps.append(c)
        if comps:
            specs["compression"] = ", ".join(comps)
        if st := _first(RE_STREAMS, body):
            specs["streams"] = int(st)

    if m := RE_SD.search(body):
        size = int(m.group(1))
        if m.group(2).lower().startswith(("т", "t")):
            size *= 1024
        specs["sd_max"] = size
    if a := _first(RE_AUDIO, body):
        specs["audio"] = a.replace(" ", "")
    if a := _first(RE_ALARM, body):
        specs["alarm"] = a.replace(" ", "")
    prot = []
    for p in RE_IP.findall(body):
        p = p.upper()
        if p not in prot:
            prot.append(p)
    if prot:
        specs["protection"] = ", ".join(prot)
    if p := _first(RE_POWER, body):
        specs["power"] = p.strip()[:80]
    if h := _first(RE_HOUSING, body):
        specs["housing"] = h.strip()[:60]
    if m := RE_TEMP.search(body):
        lo = m.group(1).replace(" ", "").replace("–", "-").replace("−", "-")
        specs["temperature"] = f"{lo}…+{m.group(2)} °C"

    if ex.kind in ("recorder", "switch") or RE_CHANNELS.search(title):
        if ch := _first(RE_CHANNELS, title) or _first(RE_CHANNELS, body):
            ex.channels = int(ch)
            specs["channels"] = int(ch)
    if ex.kind == "switch":
        if p := _first(RE_PORTS, title):
            specs["ports"] = int(p)
        if b := _first(RE_POE_BUDGET, body):
            specs["poe_budget"] = int(b)
    if ex.kind == "recorder":
        if h := _first(RE_HDD, body):
            specs["hdd_bays"] = int(h)
    if ex.kind in ("monitor", "intercom"):
        if sc := _first(RE_SCREEN, title):
            v = _f(sc)
            if v and 3 <= v <= 100:
                specs["screen"] = f'{_num(v)}"'

    feats: list[str] = []
    for key, (_, rx) in FEATURES.items():
        target = full
        if key == "outdoor":
            target = title
        if key == "active_deterrence":
            target = f"{full} {model}"
        if rx.search(target):
            feats.append(key)
    if "motorized" not in feats and ex.lens_min and ex.lens_max and ex.lens_min != ex.lens_max:
        feats.append("motorized")
    if ex.form_factor in ("ptz", "pt"):
        feats.append(ex.form_factor)
    ex.features = sorted(set(feats))
    ex.specs = specs
    return ex


FEATURE_LABELS = {k: v[0] for k, v in FEATURES.items()} | {"ptz": "PTZ", "pt": "PT"}
