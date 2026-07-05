"""Unit tests for deterministic bank fee description detection (BSF-1)."""

from __future__ import annotations

import pytest

from app.core.banking.bank_fee_detect import is_bank_fee_description


@pytest.mark.parametrize(
    "description",
    [
        "HESAP İŞLETİM ÜCRETİ 12,50",
        "BSMV 3,40",
        "HAVALE ÜCRETİ 5,00",
        "EFT MASRAFI 12,00",
        "KART AİDATI YILLIK",
        "PERİYODİK BAKIM ÜCRETİ",
        "EKSTRE ÜCRETİ",
        "İŞLEM ÜCRETİ",
        "HAVALE KOMİSYONU 15,00",
    ],
)
def test_fee_descriptions_match(description: str) -> None:
    assert is_bank_fee_description(description) is True


@pytest.mark.parametrize(
    "description",
    [
        "HAVALE TRENDYOL 5.000,00",
        "EFT METRO GIDA SAN TIC ODEME",
        "KOMİSYON",
        "FAST GETIR ODEME",
        "Bank service fee",
        "",
    ],
)
def test_non_fee_descriptions_rejected(description: str) -> None:
    assert is_bank_fee_description(description) is False
