"""Parsing of the Dahua channel price-list workbook.

Layout (per sheet = category):
    row 1: "Содержание" back-link
    row 2: header  — Примечание | Наименование | Изображение | Описание | РРЦ | Гарантия | MPQ
    then group header rows (merged A:G, text only in the first column) and product rows.
Header names, skipped sheets etc. come from runtime settings, so the parser tolerates
column re-ordering and renamed headers.
"""

from __future__ import annotations

import io
import re
from dataclasses import dataclass, field
from typing import Any

import warnings

import openpyxl
from openpyxl.worksheet.worksheet import Worksheet

DEFAULT_HEADER_ALIASES: dict[str, list[str]] = {
    "model": ["Наименование", "Новое наименование", "Модель", "Артикул", "Model"],
    "description": ["Описание", "Description"],
    "price": ["РРЦ", "Цена", "MSRP", "Price"],
    "warranty": ["Гарантия", "Warranty"],
    "mpq": ["MPQ", "Кратность", "Упаковка"],
    "note": ["Примечание", "Note", "Комментарий"],
}


@dataclass
class ParsedRow:
    model: str
    description: str
    price: float | None
    price_raw: str | None
    warranty_months: int | None
    warranty_raw: str | None
    mpq: int | None
    mpq_raw: str | None
    note: str | None
    category: str
    group: str | None
    sheet_row: int


@dataclass
class ParseResult:
    rows: list[ParsedRow] = field(default_factory=list)
    categories: list[str] = field(default_factory=list)
    skipped_sheets: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    duplicates: int = 0


def _norm_header(v: Any) -> str:
    return re.sub(r"\s+", " ", str(v or "")).strip().lower()


def _clean(v: Any) -> str | None:
    if v is None:
        return None
    s = str(v).replace("\xa0", " ").strip()
    return s or None


def _to_int(v: Any) -> int | None:
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return int(v)
    m = re.search(r"\d+", str(v))
    return int(m.group()) if m else None


def _to_price(v: Any) -> float | None:
    if v is None or isinstance(v, bool):
        return None
    if isinstance(v, (int, float)):
        return float(v) if v > 0 else None
    s = re.sub(r"[\s\xa0₽руб.]", "", str(v)).replace(",", ".")
    try:
        f = float(s)
        return f if f > 0 else None
    except ValueError:
        return None


warnings.filterwarnings("ignore", module="openpyxl")

MODEL_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9\-_/().+#\s]{2,}$")


def _merged_lookup(ws: Worksheet) -> dict[tuple[int, int], Any]:
    """Map every cell inside a merged range to the value of its top-left cell."""
    out: dict[tuple[int, int], Any] = {}
    for rng in ws.merged_cells.ranges:
        tl = ws.cell(rng.min_row, rng.min_col).value
        if tl is None:
            continue
        for r in range(rng.min_row, rng.max_row + 1):
            for c in range(rng.min_col, rng.max_col + 1):
                if (r, c) != (rng.min_row, rng.min_col):
                    out[(r, c)] = tl
    return out


def _find_header(
    ws: Worksheet, aliases: dict[str, list[str]], scan_rows: int
) -> tuple[int, dict[str, int]] | None:
    alias_map = {k: {_norm_header(a) for a in v} for k, v in aliases.items()}
    for r_idx, row in enumerate(
        ws.iter_rows(min_row=1, max_row=scan_rows, values_only=True), start=1
    ):
        cols: dict[str, int] = {}
        for c_idx, val in enumerate(row, start=1):
            h = _norm_header(val)
            if not h:
                continue
            for key, names in alias_map.items():
                if key not in cols and h in names:
                    cols[key] = c_idx
        if "model" in cols and ("price" in cols or "description" in cols):
            return r_idx, cols
    return None


def parse_workbook(
    data: bytes,
    *,
    skip_sheets: list[str] | None = None,
    header_aliases: dict[str, list[str]] | None = None,
    header_scan_rows: int = 10,
) -> ParseResult:
    aliases = {**DEFAULT_HEADER_ALIASES, **(header_aliases or {})}
    skip = {s.strip().lower() for s in (skip_sheets or [])}
    wb = openpyxl.load_workbook(io.BytesIO(data), data_only=True)
    res = ParseResult()
    seen: set[str] = set()

    for ws in wb.worksheets:
        title = ws.title.strip()
        if title.lower() in skip or ws.sheet_state != "visible":
            res.skipped_sheets.append(title)
            continue
        hdr = _find_header(ws, aliases, header_scan_rows)
        if hdr is None:
            res.skipped_sheets.append(title)
            res.warnings.append(f"Лист «{title}»: не найден заголовок таблицы — пропущен")
            continue
        header_row, cols = hdr
        merged = _merged_lookup(ws)
        group_stack: list[str] = []
        last_was_group = False
        added_here = 0
        max_col = max(cols.values())

        for r_idx, row in enumerate(
            ws.iter_rows(min_row=header_row + 1, max_col=max(max_col, 8), values_only=True),
            start=header_row + 1,
        ):

            def cell(key: str) -> Any:
                c = cols.get(key)
                if c is None:
                    return None
                v = row[c - 1] if c - 1 < len(row) else None
                if v is None:
                    v = merged.get((r_idx, c))
                return v

            raw_values = [_clean(v) for v in row]
            non_empty = [v for v in raw_values if v]
            if not non_empty:
                continue
            raw_model_col = raw_values[cols["model"] - 1] if cols["model"] - 1 < len(row) else None
            model = _clean(cell("model"))

            # Group header: a single text value (usually merged across the row), no model/price.
            is_group = len(non_empty) == 1 and raw_model_col is None
            if is_group or not model or not MODEL_RE.match(model.split("\n")[0]):
                if is_group:
                    text = re.sub(r"\s+", " ", non_empty[0])
                    if text.lower() in ("содержание",):
                        continue
                    if last_was_group:
                        group_stack.append(text)
                        group_stack = group_stack[-2:]
                    else:
                        group_stack = [text]
                    last_was_group = True
                continue

            last_was_group = False
            model = re.sub(r"\s+", "", model.split("\n")[0])
            key = model.upper()
            if key in seen:
                res.duplicates += 1
                continue
            seen.add(key)

            price_v = cell("price")
            warranty_v = cell("warranty")
            mpq_v = cell("mpq")
            note = _clean(cell("note"))
            if note and note.strip(" \n.") == "":
                note = None

            res.rows.append(
                ParsedRow(
                    model=model,
                    description=_clean(cell("description")) or "",
                    price=_to_price(price_v),
                    price_raw=_clean(price_v),
                    warranty_months=_to_int(warranty_v),
                    warranty_raw=_clean(warranty_v),
                    mpq=_to_int(mpq_v),
                    mpq_raw=_clean(mpq_v),
                    note=re.sub(r"\s+", " ", note).strip() if note else None,
                    category=title,
                    group=" · ".join(group_stack) if group_stack else None,
                    sheet_row=r_idx,
                )
            )
            added_here += 1

        if added_here:
            res.categories.append(title)
        else:
            res.warnings.append(f"Лист «{title}»: товары не найдены")

    return res


RE_EOL_REPLACEMENT = re.compile(r"замен\w*\s+(?:на\s+)?([A-Z0-9][A-Z0-9\-/().+]{4,})", re.I)


def parse_note(note: str | None, new_markers: list[str], eol_markers: list[str]) -> dict[str, Any]:
    out: dict[str, Any] = {"is_new": False, "is_eol": False, "replacement": None}
    if not note:
        return out
    low = note.lower()
    out["is_new"] = any(m.lower() in low for m in new_markers if m)
    out["is_eol"] = any(m.lower() in low for m in eol_markers if m)
    if m := RE_EOL_REPLACEMENT.search(note):
        out["replacement"] = m.group(1).upper()
    return out
