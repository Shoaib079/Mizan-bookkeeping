"""Detect delivery platform commission e-Faturas and match entity platforms."""

from __future__ import annotations

import re
import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.adapters.ocr_ai.efatura import EInvoiceExtraction
from app.db.session import entity_context, require_entity_context
from app.features.delivery.models import OwnedDeliveryPlatform

_PLATFORM_ALIASES: dict[str, tuple[str, ...]] = {
    "getir": ("getir", "getir perakende"),
    "yemeksepeti": ("yemeksepeti", "yemek sepeti", "yemeksepeti elektronik"),
    "migros": ("migros", "migros yemek"),
}

_KNOWN_PLATFORM_VKNS: dict[str, tuple[str, ...]] = {
    "getir": ("3940482658",),
}


def _normalize_name(value: str | None) -> str:
    return (value or "").casefold()


def _looks_like_supply_invoice(text: str) -> bool:
    """Multi-line grocery/supply layouts — not platform commission."""
    lowered = text.casefold()
    if "depo:" in lowered or "depo :" in lowered:
        return True
    product_hits = len(
        re.findall(
            r"mal\s*hizmet|ürün\s*adı|urun\s*adi|miktar\s+birim",
            lowered,
        )
    )
    return product_hits >= 2 and "komisyon bedeli" not in lowered


def is_delivery_commission_extraction(
    extraction: EInvoiceExtraction,
    *,
    pdf_text: str | None = None,
) -> bool:
    """True when the document is a platform commission fee invoice (Komisyon)."""
    text = pdf_text or ""
    if not text and extraction.raw:
        text = str(extraction.raw.get("text_sample") or "")
    lowered = _normalize_name(text)
    supplier = _normalize_name(extraction.supplier_name)

    has_komisyon = "komisyon" in lowered or "komisyon" in supplier
    if not has_komisyon:
        return False
    if _looks_like_supply_invoice(text):
        return False
    return True


def match_delivery_platform(
    session: Session,
    entity_id: uuid.UUID,
    *,
    supplier_name: str | None,
    supplier_vkn: str | None,
) -> OwnedDeliveryPlatform | None:
    """Match seller identity to an entity delivery platform by name or known VKN."""
    name = _normalize_name(supplier_name)
    vkn = (supplier_vkn or "").strip()

    with entity_context(session, entity_id):
        require_entity_context()
        platforms = session.scalars(
            select(OwnedDeliveryPlatform).where(OwnedDeliveryPlatform.is_active.is_(True))
        ).all()

    if not platforms:
        return None

    if vkn:
        for platform in platforms:
            key = _normalize_name(platform.name)
            for known in _KNOWN_PLATFORM_VKNS.get(key, ()):
                if vkn == known:
                    return platform

    for platform in platforms:
        key = _normalize_name(platform.name)
        aliases = _PLATFORM_ALIASES.get(key, (key,))
        for alias in aliases:
            if alias in name or (name and name in alias):
                return platform
        if key in name or (name and name in key):
            return platform

    return None
