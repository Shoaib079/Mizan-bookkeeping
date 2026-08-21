"""Backfill scope:export for owner/partner; strip it from partner_view_only.

Generated Excel/PDF downloads now require scope:export (layered after the
route's read guard). Presets: owner + partner include it; cashier and
partner_view_only do not. Stored grants are authoritative for non-owners, so
changing only the preset would leave existing view-only members able to
export — strip their stored grant here. Add where the new preset includes it
and the membership is missing it.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "096_scope_export_backfill"
down_revision: Union[str, None] = "095_delete_entity_function"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_GRANT = "scope:export"


def upgrade() -> None:
    # Add for owner / partner when missing (JSON array of strings).
    op.execute(
        sa.text(
            f"""
            UPDATE entity_memberships
            SET grants = grants || to_jsonb(ARRAY['{_GRANT}']::text[])
            WHERE role IN ('owner', 'partner')
              AND grants IS NOT NULL
              AND jsonb_typeof(grants) = 'array'
              AND NOT (grants ? '{_GRANT}')
            """
        )
    )
    # Strip from partner_view_only stored grants (088 had seeded it).
    op.execute(
        sa.text(
            f"""
            UPDATE entity_memberships
            SET grants = (
                SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb)
                FROM jsonb_array_elements_text(grants) AS elem
                WHERE elem <> '{_GRANT}'
            )
            WHERE role = 'partner_view_only'
              AND grants IS NOT NULL
              AND jsonb_typeof(grants) = 'array'
              AND grants ? '{_GRANT}'
            """
        )
    )


def downgrade() -> None:
    # Re-add to view-only (pre-enforce preset). Do not remove from owner/partner.
    op.execute(
        sa.text(
            f"""
            UPDATE entity_memberships
            SET grants = grants || to_jsonb(ARRAY['{_GRANT}']::text[])
            WHERE role = 'partner_view_only'
              AND grants IS NOT NULL
              AND jsonb_typeof(grants) = 'array'
              AND NOT (grants ? '{_GRANT}')
            """
        )
    )
