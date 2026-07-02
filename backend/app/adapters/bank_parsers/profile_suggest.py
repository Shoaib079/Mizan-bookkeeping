"""Heuristic column mapping for Turkish and generic bank statement grids."""

from __future__ import annotations

import re
import unicodedata

from app.adapters.bank_parsers.profile_mapper import (
    BankImportProfileConfig,
    DateFormat,
    normalize_transaction_date_cell,
)
from app.adapters.bank_parsers.row_parse import cell_to_str

_MAX_SCAN_ROWS = 40
_MIN_HEADER_SCORE = 4.0

_ROLE_PATTERNS: dict[str, tuple[tuple[str, ...], float]] = {
    "date": (
        (
            "tarih",
            "islem tarihi",
            "valor tarihi",
            "value date",
            "transaction date",
            "date",
        ),
        3.0,
    ),
    "description": (
        ("aciklama", "islem aciklamasi", "description", "detay", "hareket"),
        2.0,
    ),
    "reference": (
        ("referans", "dekont", "fis no", "islem no", "reference", "ref"),
        1.0,
    ),
    "debit": (("borc", "debit", "cikis", "odeme"), 2.0),
    "credit": (("alacak", "credit", "giris", "tahsilat"), 2.0),
    "amount": (("tutar", "miktar", "amount", "islem tutari"), 2.0),
}

_EXCLUDE_PATTERNS = ("bakiye", "balance", "doviz", "kur ", " sube", "branch")


def _norm_header(text: object) -> str:
    raw = cell_to_str(text).strip().lower()
    decomposed = unicodedata.normalize("NFKD", raw)
    asciiish = "".join(c for c in decomposed if not unicodedata.combining(c))
    return re.sub(r"\s+", " ", asciiish).strip()


def _matches_role(norm_cell: str, keywords: tuple[str, ...]) -> bool:
    if not norm_cell:
        return False
    if any(ex in norm_cell for ex in _EXCLUDE_PATTERNS):
        return False
    return any(kw in norm_cell or norm_cell == kw for kw in keywords)


def _score_header_row(row: list[object]) -> tuple[float, dict[str, int]]:
    roles: dict[str, int] = {}
    score = 0.0
    for col_idx, cell in enumerate(row):
        norm = _norm_header(cell)
        if not norm:
            continue
        for role, (keywords, weight) in _ROLE_PATTERNS.items():
            if role in roles:
                continue
            if _matches_role(norm, keywords):
                roles[role] = col_idx
                score += weight
    return score, roles


def _cell(row: list[object], col: int) -> object:
    if col < 0 or col >= len(row):
        return ""
    return row[col]


def _detect_date_format(
    grid: list[list[object]],
    data_row: int,
    date_col: int,
) -> DateFormat:
    if data_row < 1 or data_row > len(grid):
        return "DD.MM.YYYY"
    val = normalize_transaction_date_cell(cell_to_str(_cell(grid[data_row - 1], date_col)))
    if re.match(r"^\d{2}\.\d{2}\.\d{4}$", val):
        return "DD.MM.YYYY"
    if re.match(r"^\d{2}/\d{2}/\d{4}$", val):
        return "DD/MM/YYYY"
    if re.match(r"^\d{4}-\d{2}-\d{2}$", val):
        return "YYYY-MM-DD"
    return "DD.MM.YYYY"


def _pick_description_columns(
    roles: dict[str, int],
    date_col: int,
    header_row: list[object],
) -> tuple[int | None, list[int]]:
    """Primary description column + any additional description-like columns."""
    primary: int | None = roles.get("description")
    extras: list[int] = []
    used = set(roles.values())

    if primary is None:
        for candidate in (date_col + 1, date_col + 2, date_col - 1):
            if candidate >= 0 and candidate not in used:
                primary = candidate
                break
    if primary is None:
        return None, []

    for idx, cell in enumerate(header_row):
        if idx == primary or idx in used:
            continue
        norm = _norm_header(cell)
        if _matches_role(norm, _ROLE_PATTERNS["description"][0]):
            extras.append(idx)

    return primary, extras


def _pick_description_col(roles: dict[str, int], date_col: int) -> int | None:
    if "description" in roles:
        return roles["description"]
    used = set(roles.values())
    for candidate in (date_col + 1, date_col + 2, date_col - 1):
        if candidate >= 0 and candidate not in used:
            return candidate
    return None


def suggest_import_profile(
    grid: list[list[object]],
) -> BankImportProfileConfig | None:
    """Scan the grid for a header row with date/amount columns (TR + EN keywords)."""
    if not grid:
        return None

    best_row = 1
    best_score = 0.0
    best_roles: dict[str, int] = {}

    limit = min(len(grid), _MAX_SCAN_ROWS)
    for row_idx in range(limit):
        score, roles = _score_header_row(grid[row_idx])
        if score <= best_score or "date" not in roles:
            continue
        has_amount_mode = (
            "amount" in roles
            or "debit" in roles
            or "credit" in roles
        )
        desc_col = _pick_description_col(roles, roles["date"])
        if desc_col is None and not has_amount_mode:
            continue
        if score >= _MIN_HEADER_SCORE:
            best_score = score
            best_row = row_idx + 1
            best_roles = roles

    if best_score < _MIN_HEADER_SCORE or "date" not in best_roles:
        return None

    date_col = best_roles["date"]
    header_row = grid[best_row - 1]
    desc_col, desc_extras = _pick_description_columns(best_roles, date_col, header_row)
    if desc_col is None:
        return None

    ref_col = best_roles.get("reference")

    if "debit" in best_roles and "credit" in best_roles:
        amount_col = None
        debit_col = best_roles["debit"]
        credit_col = best_roles["credit"]
    elif "amount" in best_roles:
        amount_col = best_roles["amount"]
        debit_col = None
        credit_col = None
    elif "debit" in best_roles:
        amount_col = best_roles["debit"]
        debit_col = None
        credit_col = None
    elif "credit" in best_roles:
        amount_col = best_roles["credit"]
        debit_col = None
        credit_col = None
    else:
        return None

    data_start = best_row + 1
    date_format = _detect_date_format(grid, data_start, date_col)

    return BankImportProfileConfig(
        header_row=best_row,
        data_start_row=data_start,
        date_col=date_col,
        description_col=desc_col,
        description_extra_cols=desc_extras,
        reference_col=ref_col,
        amount_col=amount_col,
        debit_col=debit_col,
        credit_col=credit_col,
        date_format=date_format,
        decimal_format="tr",
        debit_is_outflow=True,
    )
