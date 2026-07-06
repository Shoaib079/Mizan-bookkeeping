"""Group sale amount calculations."""

from __future__ import annotations

import uuid
from dataclasses import dataclass

from app.features.group_sales.schema import GroupSaleCreate, GroupSaleLineInput


@dataclass(frozen=True, slots=True)
class ComputedLine:
    group_menu_id: uuid.UUID | None
    menu_name_snapshot: str
    pax: int
    rate_per_person_minor: int
    line_total_minor: int
    line_total_kurus: int


@dataclass(frozen=True, slots=True)
class ComputedGroupSale:
    currency: str
    total_minor: int
    total_kurus: int
    forex_currency: str | None
    total_forex_minor: int | None
    fx_rate_used: int | None
    lines: list[ComputedLine]


def _line_total_minor(line: GroupSaleLineInput) -> int:
    return line.pax * line.rate_per_person_minor


def compute_group_sale(payload: GroupSaleCreate, menu_names: dict) -> ComputedGroupSale:
    """Compute line and header totals from menu lines and booking currency."""
    if not payload.lines:
        raise ValueError("at least one menu line is required")

    currency = payload.currency
    total_minor = sum(_line_total_minor(line) for line in payload.lines)

    if currency == "TRY":
        lines = [
            ComputedLine(
                group_menu_id=line.group_menu_id,
                menu_name_snapshot=_menu_name(line, menu_names),
                pax=line.pax,
                rate_per_person_minor=line.rate_per_person_minor,
                line_total_minor=_line_total_minor(line),
                line_total_kurus=_line_total_minor(line),
            )
            for line in payload.lines
        ]
        return ComputedGroupSale(
            currency="TRY",
            total_minor=total_minor,
            total_kurus=total_minor,
            forex_currency=None,
            total_forex_minor=None,
            fx_rate_used=None,
            lines=lines,
        )

    fx_rate = payload.fx_rate_used
    if payload.total_kurus is not None:
        total_kurus = payload.total_kurus
        if fx_rate is None and total_minor > 0:
            fx_rate = round(total_kurus * 100 / total_minor)
    elif fx_rate is not None:
        total_kurus = round(total_minor * fx_rate / 100)
    else:
        raise ValueError("FX booking requires fx_rate_used or total_kurus")

    if fx_rate is None or fx_rate <= 0:
        raise ValueError("fx_rate_used must be positive")

    line_kurus_parts: list[int] = []
    for line in payload.lines:
        line_minor = _line_total_minor(line)
        line_kurus_parts.append(round(line_minor * fx_rate / 100))

    rounding_diff = total_kurus - sum(line_kurus_parts)
    if line_kurus_parts and rounding_diff != 0:
        line_kurus_parts[-1] += rounding_diff

    lines = [
        ComputedLine(
            group_menu_id=line.group_menu_id,
            menu_name_snapshot=_menu_name(line, menu_names),
            pax=line.pax,
            rate_per_person_minor=line.rate_per_person_minor,
            line_total_minor=_line_total_minor(line),
            line_total_kurus=line_kurus,
        )
        for line, line_kurus in zip(payload.lines, line_kurus_parts, strict=True)
    ]

    return ComputedGroupSale(
        currency=currency,
        total_minor=total_minor,
        total_kurus=total_kurus,
        forex_currency=currency,
        total_forex_minor=total_minor,
        fx_rate_used=fx_rate,
        lines=lines,
    )


def _menu_name(line: GroupSaleLineInput, menu_names: dict) -> str:
    if line.menu_name and line.menu_name.strip():
        return line.menu_name.strip()
    if line.group_menu_id and line.group_menu_id in menu_names:
        return menu_names[line.group_menu_id]
    raise ValueError("each line needs menu_name or a valid group_menu_id")
