"""Customer master validation helpers."""

from __future__ import annotations

from app.core.turkish_vkn import is_valid_vkn_or_tckn


def validate_optional_tax_id(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = value.strip()
    if not cleaned:
        return None
    if not is_valid_vkn_or_tckn(cleaned):
        raise ValueError("Tax ID must be a valid 10-digit VKN or 11-digit TCKN")
    return cleaned
