"""Bounce dialog fee/refund candidate filtering."""

from __future__ import annotations

import pytest

from app.core.banking.bank_fee_detect import is_bank_fee_refund_description
from app.features.banking.statement_bounce_fees import (
    BOUNCE_FEE_SMALL_KURUS,
    is_bounce_fee_candidate_line,
    is_unposted_bounce_fee_line,
)
from app.features.banking.statement_models import (
    BankStatementLine,
    StatementLineClassification,
    StatementLineStatus,
)


def _line(
    *,
    amount_kurus: int,
    description: str,
    classification: StatementLineClassification = StatementLineClassification.UNCLASSIFIED,
) -> BankStatementLine:
    return BankStatementLine(
        amount_kurus=amount_kurus,
        description=description,
        classification=classification,
    )


@pytest.mark.parametrize(
    "description",
    [
        "Fast ücret iadesi",
        "ÜCRET İADESİ",
        "HAVALE ÜCRET İADESİ",
    ],
)
def test_fee_refund_descriptions_match(description: str) -> None:
    assert is_bank_fee_refund_description(description) is True


def test_fee_candidates_include_refunds_and_charges() -> None:
    lines = [
        _line(amount_kurus=1_526, description="Fast ücret iadesi"),
        _line(amount_kurus=-1_676, description="ÜCRET H260883"),
        _line(amount_kurus=74, description="Fast ücret iadesi"),
        _line(amount_kurus=-399, description="BSMV"),
    ]
    assert all(is_bounce_fee_candidate_line(line) for line in lines)


def test_fee_candidates_exclude_large_settlements() -> None:
    assert (
        is_bounce_fee_candidate_line(
            _line(amount_kurus=10_440_670, description="NET SATIŞ TUTARI")
        )
        is False
    )
    assert (
        is_bounce_fee_candidate_line(
            _line(amount_kurus=-2_807_500, description="LATIF COSGUN")
        )
        is False
    )


def test_fee_candidates_exclude_large_ucret_without_small_amount() -> None:
    assert (
        is_bounce_fee_candidate_line(
            _line(amount_kurus=-550_000, description="ÜCRET ODEME")
        )
        is False
    )


def test_fee_candidates_include_classified_bank_fee() -> None:
    assert is_bounce_fee_candidate_line(
        _line(
            amount_kurus=-1_676,
            description="anything",
            classification=StatementLineClassification.BANK_FEE,
        )
    )


def test_fee_candidates_reject_classified_bank_fee_over_ceiling() -> None:
    assert (
        is_bounce_fee_candidate_line(
            _line(
                amount_kurus=-(BOUNCE_FEE_SMALL_KURUS + 1),
                description="ÜCRET",
                classification=StatementLineClassification.BANK_FEE,
            )
        )
        is False
    )


def test_fee_candidates_tiny_amount_without_keyword() -> None:
    assert is_bounce_fee_candidate_line(_line(amount_kurus=76, description="X"))


def test_unposted_fee_line_rejects_posted() -> None:
    posted = _line(
        amount_kurus=-399,
        description="BSMV",
        classification=StatementLineClassification.UNCLASSIFIED,
    )
    posted.status = StatementLineStatus.POSTED
    assert is_unposted_bounce_fee_line(posted) is False
