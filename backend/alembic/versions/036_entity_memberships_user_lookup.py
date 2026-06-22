"""RLS policy: list entities via caller's memberships across tenant boundaries."""

from typing import Sequence, Union

from alembic import op

revision: str = "036_entity_memberships_user_lookup"
down_revision: Union[str, None] = "035_roles_permissions"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        "DROP POLICY IF EXISTS entity_memberships_user_lookup ON entity_memberships"
    )
    op.execute(
        """
        CREATE POLICY entity_memberships_user_lookup ON entity_memberships
        FOR SELECT
        USING (
            user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
        )
        """
    )


def downgrade() -> None:
    op.execute(
        "DROP POLICY IF EXISTS entity_memberships_user_lookup ON entity_memberships"
    )
