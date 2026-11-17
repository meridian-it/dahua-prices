"""Runtime settings: defaults live in code, overrides in the `settings` table.

The schema drives the admin settings form, so adding a new setting is a one-liner here.
"""

from __future__ import annotations

import time
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Setting
from app.services.excel import DEFAULT_HEADER_ALIASES

DEFAULT_SYNONYMS = """\
# Синонимы для умного поиска: «варианты через запятую => как понимать».
# Строки, начинающиеся с #, игнорируются.
буллет, bullet, цилиндр, цилиндрическую, цилиндрические => цилиндрическая
купол, купольную, купольные, dome, турель, турельная, turret, eyeball => купольная
мини купол, мини-купол, minidome, mini dome => мини-купольная
птз, ptz, скоростная поворотная, скоростные => ptz
пт, поворотная, поворотную, поворотные => pt
фишай, рыбий глаз, fish eye, fisheye => fisheye
вайфай, вай-фай, вай фай, wifi, wi fi, беспроводная => wi-fi
4г, 4джи, lte, 3g, сим, sim, симкарта => 4g
ai, нейросеть, нейросетью, wizsense, wizmind, аналитика, аналитикой => ии
фулколор, фуллколор, full color, fullcolor, wizcolor, цветная ночью, цветное ночью => full-color
пое, poe+, epoe => poe
звук, аудио, микрофоном => микрофон
улица, улицы, наружная, наружные, outdoor, уличную, уличные => уличная
внутренняя, внутренние, помещение, помещения, indoor => внутренняя
нвр, nvr, ip регистратор, ip-регистратор => nvr
xvr, хвр, dvr, двр, гибридный регистратор => xvr
регистраторы, видеорегистратор, видеорегистраторы, рег => регистратор
свитч, свич, switch, коммутаторы => коммутатор
аналоговая, аналог, аналоговые, cvi, hd-cvi, hdcvi, тви, tvi, ahd => hdcvi
айпи, ип, сетевая, сетевые => ip
домофоны, вызывная панель, вызывная, видеодомофон => домофон
тепловизоры, тепловизионная, thermal, термо => тепловизор
лицо, лиц, распознавание лиц, face => лица
номеров, номер, anpr, lpr, распознавание номеров => номера
вариофокальная, варифокал, варифокальная, мотор, моторизованная, моторизированная, zoom, зум, трансфокатор => моториз
сирена, сдерживание, отпугивание, стробоскоп, active deterrence => сдерживание
антивандальная, антивандальный, вандалозащищенная => ik10
двойная подсветка, smart dual light, dual light, смарт подсветка => dual-light
ночного видения, starlight, старлайт => starlight
автотрекинг, автослежение, слежение, автоматическое слежение => автослежение
подсчет, подсчёт, подсчет людей, счетчик посетителей => подсчет
динамиком, громкоговоритель, двусторонняя связь, двусторонним аудио => динамик
"""

SETTINGS_SCHEMA: list[dict[str, Any]] = [
    # --- Brand
    {"key": "site_name", "group": "Бренд", "label": "Название сайта", "type": "string",
     "default": "IT-Trade", "public": True},
    {"key": "site_tagline", "group": "Бренд", "label": "Слоган", "type": "string",
     "default": "Прайс-лист и подбор оборудования Dahua", "public": True},
    {"key": "brand_vendor", "group": "Бренд", "label": "Производитель в каталоге", "type": "string",
     "default": "Dahua", "public": True},
    {"key": "accent_color", "group": "Бренд", "label": "Акцентный цвет", "type": "color",
     "default": "#2563eb", "public": True},
    {"key": "meta_description", "group": "Бренд", "label": "SEO описание", "type": "text",
     "default": "Актуальные цены на оборудование Dahua: IP и HDCVI камеры, регистраторы, "
                "домофония, СКУД. Удобный поиск и сравнение.", "public": True},
    # --- Contacts
    {"key": "contact_phone", "group": "Контакты", "label": "Телефон", "type": "string",
     "default": "", "public": True},
    {"key": "contact_email", "group": "Контакты", "label": "E-mail", "type": "string",
     "default": "", "public": True},
    {"key": "contact_telegram", "group": "Контакты", "label": "Telegram (ссылка или @ник)",
     "type": "string", "default": "", "public": True},
    {"key": "contact_address", "group": "Контакты", "label": "Адрес", "type": "string",
     "default": "", "public": True},
    {"key": "work_hours", "group": "Контакты", "label": "Часы работы", "type": "string",
     "default": "", "public": True},
    {"key": "website_url", "group": "Контакты", "label": "Основной сайт", "type": "string",
     "default": "", "public": True},
    {"key": "footer_note", "group": "Контакты", "label": "Текст в подвале", "type": "text",
     "default": "Цены носят информационный характер и не являются публичной офертой.",
     "public": True},
    # --- Catalog
    {"key": "show_prices", "group": "Каталог", "label": "Показывать цены", "type": "bool",
     "default": True, "public": True},
    {"key": "price_label", "group": "Каталог", "label": "Подпись цены", "type": "string",
     "default": "РРЦ", "public": True},
    {"key": "currency_symbol", "group": "Каталог", "label": "Символ валюты", "type": "string",
     "default": "₽", "public": True},
    {"key": "price_adjust_percent", "group": "Каталог",
     "label": "Корректировка цен, % (наценка «+», скидка «−»)", "type": "number",
     "default": 0, "public": False},
    {"key": "price_round", "group": "Каталог", "label": "Округлять цену до", "type": "number",
     "default": 10, "public": False},
    {"key": "price_on_request_text", "group": "Каталог", "label": "Текст «цена по запросу»",
     "type": "string", "default": "По запросу", "public": True},
    {"key": "page_size", "group": "Каталог", "label": "Товаров на странице", "type": "number",
     "default": 30, "public": True},
    {"key": "compare_max", "group": "Каталог", "label": "Максимум товаров в сравнении",
     "type": "number", "default": 6, "public": True},
    {"key": "default_view", "group": "Каталог", "label": "Вид каталога по умолчанию",
     "type": "select", "options": ["grid", "table"], "default": "grid", "public": True},
    {"key": "hide_eol", "group": "Каталог", "label": "Скрывать снятые с производства (EOL)",
     "type": "bool", "default": False, "public": True},
    {"key": "show_price_changes", "group": "Каталог", "label": "Показывать изменение цены",
     "type": "bool", "default": True, "public": True},
    {"key": "similar_limit", "group": "Каталог", "label": "Похожих товаров на карточке",
     "type": "number", "default": 8, "public": False},
    # --- Search
    {"key": "search_synonyms", "group": "Поиск", "label": "Синонимы", "type": "text",
     "default": DEFAULT_SYNONYMS, "public": False, "rows": 18},
    {"key": "search_layout_fix", "group": "Поиск",
     "label": "Исправлять раскладку (рш2449 → hf2449)", "type": "bool", "default": True,
     "public": False},
    {"key": "search_fuzzy_threshold", "group": "Поиск",
     "label": "Порог нечёткого поиска (0..1)", "type": "number", "default": 0.3, "public": False},
    {"key": "search_suggest_limit", "group": "Поиск", "label": "Подсказок в автодополнении",
     "type": "number", "default": 8, "public": False},
    {"key": "search_examples", "group": "Поиск", "label": "Примеры запросов (по одному в строке)",
     "type": "text", "public": True,
     "default": "4мп купольная poe микрофон\nуличная 8мп ик 50м\nptz 25x\nnvr 16 каналов\n"
                "full-color до 10000\nHFW2449"},
    # --- Photos
    {"key": "photos_enabled", "group": "Фото", "label": "Подбирать фото автоматически",
     "type": "bool", "default": True, "public": False},
    {"key": "photos_sources", "group": "Фото",
     "label": "Источники по порядку (dahuasecurity, icecat, tdtorus, bing) — следующий пробуется, "
              "если в предыдущем модели нет",
     "type": "list", "default": ["dahuasecurity", "icecat", "tdtorus", "bing"], "public": False,
     "allowed": ["dahuasecurity", "icecat", "tdtorus", "bing"]},
    {"key": "photos_icecat_user", "group": "Фото",
     "label": "Пользователь Icecat (openIcecat-live — открытый каталог без регистрации)",
     "type": "string", "default": "openIcecat-live", "public": False},
    {"key": "photos_auto", "group": "Фото",
     "label": "Автоматически для новых товаров (после импорта и при запуске)", "type": "bool",
     "default": True, "public": False},
    {"key": "photos_allow_close", "group": "Фото",
     "label": "Принимать близкие совпадения (без суффикса -PRO, (L)…), помечаются для проверки",
     "type": "bool", "default": True, "public": False},
    {"key": "photos_base_url", "group": "Фото", "label": "Сайт производителя", "type": "string",
     "default": "https://www.dahuasecurity.com", "public": False},
    {"key": "photos_max_images", "group": "Фото", "label": "Фото на товар (галерея)", "type": "number",
     "default": 6, "public": False},
    {"key": "photos_max_size", "group": "Фото", "label": "Максимальный размер фото, px",
     "type": "number", "default": 800, "public": False},
    {"key": "photos_request_delay_ms", "group": "Фото",
     "label": "Пауза между запросами к источнику, мс", "type": "number", "default": 400, "public": False},
    {"key": "photos_concurrency", "group": "Фото", "label": "Параллельных загрузок", "type": "number",
     "default": 3, "public": False},
    # --- Import
    {"key": "import_skip_sheets", "group": "Импорт", "label": "Пропускать листы", "type": "list",
     "default": ["Содержание", "Замены и Новинки"], "public": False},
    {"key": "import_header_aliases", "group": "Импорт",
     "label": "Названия колонок (JSON: поле → варианты заголовков)", "type": "json",
     "default": DEFAULT_HEADER_ALIASES, "public": False},
    {"key": "import_header_scan_rows", "group": "Импорт",
     "label": "Искать заголовок в первых N строках листа", "type": "number", "default": 10,
     "public": False},
    {"key": "import_new_markers", "group": "Импорт", "label": "Метки новинок в «Примечании»",
     "type": "list", "default": ["Новинка", "New"], "public": False},
    {"key": "import_eol_markers", "group": "Импорт", "label": "Метки EOL в «Примечании»",
     "type": "list", "default": ["EOL", "Снят с производства"], "public": False},
    {"key": "import_deactivate_missing", "group": "Импорт",
     "label": "Скрывать товары, которых нет в новом файле", "type": "bool", "default": True,
     "public": False},
    {"key": "import_new_categories_visible", "group": "Импорт",
     "label": "Новые категории сразу видимы", "type": "bool", "default": True, "public": False},
]

SCHEMA_BY_KEY = {s["key"]: s for s in SETTINGS_SCHEMA}

_cache: dict[str, Any] | None = None
_cache_at = 0.0
CACHE_TTL = 3.0


def _coerce(item: dict[str, Any], value: Any) -> Any:
    t = item["type"]
    if value is None:
        return item["default"]
    if t == "bool":
        if isinstance(value, str):
            return value.strip().lower() in ("1", "true", "yes", "on", "да")
        return bool(value)
    if t == "number":
        try:
            f = float(value)
        except (TypeError, ValueError) as e:
            raise ValueError(f"«{item['label']}»: нужно число") from e
        return int(f) if f.is_integer() else f
    if t == "list":
        if isinstance(value, str):
            value = [v.strip() for v in value.replace("\n", ",").split(",")]
        if not isinstance(value, list):
            raise ValueError(f"«{item['label']}»: нужен список")
        out = [str(v).strip() for v in value if str(v).strip()]
        if allowed := item.get("allowed"):
            out = [v.lower() for v in out]
            bad = [v for v in out if v not in allowed]
            if bad:
                raise ValueError(f"«{item['label']}»: неизвестно {', '.join(bad)}; допустимо {', '.join(allowed)}")
        return out
    if t == "json":
        if isinstance(value, str):
            import json

            try:
                value = json.loads(value)
            except json.JSONDecodeError as e:
                raise ValueError(f"«{item['label']}»: некорректный JSON ({e.msg})") from e
        return value
    if t == "select":
        if value not in item["options"]:
            raise ValueError(f"«{item['label']}»: допустимо {', '.join(item['options'])}")
        return value
    return str(value)


async def load_settings(session: AsyncSession, *, fresh: bool = False) -> dict[str, Any]:
    global _cache, _cache_at
    if not fresh and _cache is not None and time.monotonic() - _cache_at < CACHE_TTL:
        return _cache
    rows = (await session.execute(select(Setting))).scalars().all()
    stored = {r.key: r.value for r in rows}
    values: dict[str, Any] = {}
    for item in SETTINGS_SCHEMA:
        if item["key"] in stored:
            try:
                values[item["key"]] = _coerce(item, stored[item["key"]])
            except ValueError:
                values[item["key"]] = item["default"]
        else:
            values[item["key"]] = item["default"]
    _cache, _cache_at = values, time.monotonic()
    return values


def invalidate_cache() -> None:
    global _cache
    _cache = None


async def save_settings(session: AsyncSession, values: dict[str, Any]) -> dict[str, Any]:
    errors: dict[str, str] = {}
    clean: dict[str, Any] = {}
    for key, value in values.items():
        item = SCHEMA_BY_KEY.get(key)
        if item is None:
            continue
        try:
            clean[key] = _coerce(item, value)
        except ValueError as e:
            errors[key] = str(e)
    if errors:
        raise SettingsValidationError(errors)
    for key, value in clean.items():
        row = await session.get(Setting, key)
        if value == SCHEMA_BY_KEY[key]["default"]:
            if row is not None:
                await session.delete(row)
            continue
        if row is None:
            session.add(Setting(key=key, value=value))
        else:
            row.value = value
    await session.commit()
    invalidate_cache()
    return await load_settings(session, fresh=True)


class SettingsValidationError(Exception):
    def __init__(self, errors: dict[str, str]):
        super().__init__("invalid settings")
        self.errors = errors


def public_settings(values: dict[str, Any]) -> dict[str, Any]:
    return {k: v for k, v in values.items() if SCHEMA_BY_KEY[k].get("public")}
