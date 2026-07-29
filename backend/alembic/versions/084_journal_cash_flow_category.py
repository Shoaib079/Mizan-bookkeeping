"""Let a manual journal say which cash-flow activity it is (FINANCIAL_AUDIT F5).

Cash-flow categories are inferred from a journal entry's source, and MANUAL and
SYSTEM both fall through to "operating". So a manual journal that is really a
loan repayment (financing) or an equipment purchase (investing) lands in the
wrong category. Totals stay correct — the reconciliation flag proves the three
categories sum back to the actual cash movement — but the split is wrong.

Nullable: existing entries keep being inferred from their source, and the
override only exists for the handful of manual entries where the source can't
tell you.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "084_journal_cash_flow_category"
down_revision: Union[str, None] = "083_period_close_snapshots"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "journal_entries",
        sa.Column("cash_flow_category", sa.String(length=16), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("journal_entries", "cash_flow_category")
