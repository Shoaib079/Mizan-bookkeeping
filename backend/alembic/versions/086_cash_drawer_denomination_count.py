"""No-op placeholder — note breakdown is UI-only (never stored on sessions).

Earlier WIP briefly added ``denomination_count``; drop it if present so local
DBs that applied that draft stay clean. Books only need counted total.
"""

from typing import Sequence, Union

from alembic import op

revision: str = "086_cash_drawer_denomination_count"
down_revision: Union[str, None] = "085_bank_import_balance_col"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE cash_drawer_sessions "
        "DROP COLUMN IF EXISTS denomination_count"
    )


def downgrade() -> None:
    # Intentionally empty — column was never part of the product contract.
    pass
