"""Unit tests for fuzzy supplier match from bank descriptions (BSF-3)."""

from __future__ import annotations

import uuid

import pytest

from app.core.banking.supplier_suggest import suggest_supplier_from_description

METRO_ID = uuid.UUID("00000000-0000-4000-8000-000000000101")
TRENDYOL_ID = uuid.UUID("00000000-0000-4000-8000-000000000102")
MIGROS_ID = uuid.UUID("00000000-0000-4000-8000-000000000103")

SUPPLIERS = [
    (METRO_ID, "Metro Gida San Tic Ltd"),
    (TRENDYOL_ID, "Trendyol Go"),
    (MIGROS_ID, "Migros Ticaret"),
]


def test_matches_metro_from_havale_description() -> None:
    match = suggest_supplier_from_description(
        "HAVALE EFT METRO GIDA SAN TIC ODEME 20260215 REF12345678",
        SUPPLIERS,
    )
    assert match is not None
    assert match.supplier_id == METRO_ID


def test_rejects_ambiguous_suppliers() -> None:
    match = suggest_supplier_from_description(
        "HAVALE ODEME",
        SUPPLIERS,
    )
    assert match is None


def test_no_match_for_unrelated_description() -> None:
    match = suggest_supplier_from_description(
        "HESAP ISLETIM UCRETI",
        SUPPLIERS,
    )
    assert match is None
