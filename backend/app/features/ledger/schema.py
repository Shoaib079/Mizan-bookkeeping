"""Ledger API schemas."""

from __future__ import annotations

import uuid
from datetime import date, datetime

from pydantic import BaseModel, Field
from app.core.schema_types import OptionalActorId

from app.core.chart_of_accounts.types import AccountNormalBalance
from app.core.ledger.models import JournalEntrySource, JournalEntryStatus
from app.core.listing.schema import PaginatedListOut


class PostingLineIn(BaseModel):
    account_id: uuid.UUID
    amount_kurus: int = Field(gt=0)
    side: AccountNormalBalance


class PostJournalEntryRequest(BaseModel):
    entry_date: date | None = None
    description: str = Field(max_length=512)
    lines: list[PostingLineIn] = Field(min_length=2)
    actor_id: OptionalActorId = None
    period_unlock_reason: str | None = Field(default=None, max_length=512)


class VoidJournalEntryRequest(BaseModel):
    actor_id: OptionalActorId = None
    reason: str | None = Field(default=None, max_length=512)
    void_date: date | None = None
    period_unlock_reason: str | None = Field(default=None, max_length=512)


class CorrectJournalEntryRequest(BaseModel):
    entry_date: date
    description: str = Field(max_length=512)
    lines: list[PostingLineIn] = Field(min_length=2)
    actor_id: OptionalActorId = None
    reason: str | None = Field(default=None, max_length=512)
    void_date: date | None = None
    period_unlock_reason: str | None = Field(default=None, max_length=512)
    # Omit to keep the original's classification. Only set to reclassify.
    cash_flow_category: str | None = Field(default=None, max_length=32)


class JournalEntryLineOut(BaseModel):
    id: uuid.UUID
    account_id: uuid.UUID
    amount_kurus: int
    side: AccountNormalBalance
    line_number: int

    model_config = {"from_attributes": True}


class JournalEntryOut(BaseModel):
    id: uuid.UUID
    entity_id: uuid.UUID
    entry_date: date
    description: str
    status: JournalEntryStatus
    source: JournalEntrySource
    reverses_entry_id: uuid.UUID | None
    reversed_by_entry_id: uuid.UUID | None
    amends_entry_id: uuid.UUID | None
    amended_by_entry_id: uuid.UUID | None
    voided_at: datetime | None
    created_at: datetime
    lines: list[JournalEntryLineOut]

    model_config = {"from_attributes": True}


class VoidJournalEntryOut(BaseModel):
    original: JournalEntryOut
    reversal: JournalEntryOut


class SubledgerVoidOut(BaseModel):
    original_journal_entry_id: uuid.UUID | None = None
    reversal_journal_entry_id: uuid.UUID | None = None
    original_customer_ledger_entry_id: uuid.UUID | None = None
    reversal_customer_ledger_entry_id: uuid.UUID | None = None


class CorrectJournalEntryOut(BaseModel):
    original: JournalEntryOut
    reversal: JournalEntryOut
    corrected: JournalEntryOut


class JournalEntryListOut(PaginatedListOut[JournalEntryOut]):
    pass


class LedgerEntryEditContextOut(BaseModel):
    kind: str
    context: dict


class LedgerEntryActionsOut(BaseModel):
    can_edit: bool
    can_void: bool
    void_path: str | None = None
    edit: LedgerEntryEditContextOut | None = None
    #: Owners sharing this entry — see `LedgerEntryActions.owner_count`.
    #: A page showing one owner's row of several must not offer to void it.
    owner_count: int = 1

    @classmethod
    def of(cls, actions) -> LedgerEntryActionsOut:
        """From the core dataclass.

        Here rather than in the route because three callers now need it: the
        single route, the batch route, and the partner ledger, which sends
        these with its rows so the buttons do not arrive late. A second copy
        of this mapping is how two endpoints come to disagree about the same
        entry, which is the fault this whole area was built to end.
        """
        edit = None
        if actions.edit is not None:
            edit = LedgerEntryEditContextOut(
                kind=actions.edit.kind, context=actions.edit.context
            )
        return cls(
            can_edit=actions.can_edit,
            can_void=actions.can_void,
            void_path=actions.void_path,
            edit=edit,
            owner_count=actions.owner_count,
        )


#: One page of rows. Capped so a caller cannot ask about the whole ledger in
#: one request — each id costs a subledger lookup.
MAX_ACTIONS_BATCH = 200


class LedgerEntryActionsBatchIn(BaseModel):
    entry_ids: list[uuid.UUID]


class LedgerEntryActionsBatchOut(BaseModel):
    #: Keyed by entry id as a string, so it can be read straight from JSON.
    #: Missing ids mean the entry is gone — see the route's docstring.
    actions: dict[str, LedgerEntryActionsOut]
