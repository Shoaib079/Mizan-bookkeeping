"""Fuzzy supplier match from bank statement description (BSF-3)."""

from __future__ import annotations

import uuid
from dataclasses import dataclass

from app.core.expenses.normalize import FUZZY_MATCH_THRESHOLD, similarity_score
from app.features.banking.classification_learning import (
    _bank_match_key,
    _counterparty_overlap_token,
    derive_stable_bank_description_token,
)


@dataclass(frozen=True, slots=True)
class SupplierDescriptionMatch:
    supplier_id: uuid.UUID
    supplier_name: str
    score: float
    reason: str


def _score_supplier_match(description: str, supplier_name: str) -> tuple[float, str]:
    norm_desc = _bank_match_key(description)
    norm_name = _bank_match_key(supplier_name)
    if not norm_desc or not norm_name:
        return 0.0, ""

    if len(norm_name) >= 3 and norm_name in norm_desc:
        return 1.0, f"Supplier name {supplier_name!r} appears in the description"

    overlap = _counterparty_overlap_token(description, supplier_name)
    if overlap and len(overlap) >= 4:
        return 0.95, f"Description contains counterparty token {overlap!r}"

    name_tokens = [token for token in norm_name.split() if len(token) >= 3]
    if name_tokens and all(token in norm_desc for token in name_tokens[:2]):
        return 0.92, f"Description contains supplier tokens from {supplier_name!r}"

    stable = derive_stable_bank_description_token(description)
    fuzzy = similarity_score(stable or norm_desc, supplier_name)
    if fuzzy >= FUZZY_MATCH_THRESHOLD:
        return fuzzy, f"Description is similar to supplier {supplier_name!r}"

    return 0.0, ""


def suggest_supplier_from_description(
    description: str,
    suppliers: list[tuple[uuid.UUID, str]],
    *,
    min_score: float = FUZZY_MATCH_THRESHOLD,
    min_margin: float = 0.08,
) -> SupplierDescriptionMatch | None:
    """Return the best unique supplier match for a bank line description."""
    if not description.strip() or not suppliers:
        return None

    ranked: list[SupplierDescriptionMatch] = []
    for supplier_id, supplier_name in suppliers:
        score, reason = _score_supplier_match(description, supplier_name)
        if score >= min_score:
            ranked.append(
                SupplierDescriptionMatch(
                    supplier_id=supplier_id,
                    supplier_name=supplier_name,
                    score=score,
                    reason=reason,
                )
            )

    if not ranked:
        return None

    ranked.sort(key=lambda match: (-match.score, match.supplier_name))
    best = ranked[0]
    if len(ranked) > 1 and best.score - ranked[1].score < min_margin:
        return None
    return best
