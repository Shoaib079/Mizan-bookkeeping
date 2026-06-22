"""Delivery platform constants — clearing account mapping (Decisions §9)."""

from __future__ import annotations

import enum

from app.core.chart_of_accounts.default_chart import (
    GETIR_CLEARING_CODE,
    TRENDYOL_CLEARING_CODE,
    YEMEKSEPETI_CLEARING_CODE,
)


class DeliveryPlatform(str, enum.Enum):
    GETIR = "getir"
    YEMEKSEPETI = "yemeksepeti"
    TRENDYOL = "trendyol"


PLATFORM_CLEARING_CODES: dict[DeliveryPlatform, str] = {
    DeliveryPlatform.GETIR: GETIR_CLEARING_CODE,
    DeliveryPlatform.YEMEKSEPETI: YEMEKSEPETI_CLEARING_CODE,
    DeliveryPlatform.TRENDYOL: TRENDYOL_CLEARING_CODE,
}


def clearing_code_for_platform(platform: DeliveryPlatform) -> str:
    return PLATFORM_CLEARING_CODES[platform]


def parse_platform(value: str) -> DeliveryPlatform:
    try:
        return DeliveryPlatform(value.lower())
    except ValueError as exc:
        raise ValueError(f"unknown delivery platform: {value}") from exc
