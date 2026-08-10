"""The one sanctioned way past the immutability triggers.

`mizan_app` cannot disable a trigger — that is the property the ledger's
undeletability rests on. Deleting a whole restaurant needs a way through, and
this grants exactly one: a SECURITY DEFINER function that deletes an entity and
nothing finer, re-enabling every trigger before it returns.

See `app/db/entity_deletion.py` for why this shape rather than an admin
connection, and for why the trigger list is discovered rather than written down.
"""

from typing import Sequence, Union

from alembic import op

from app.db.entity_deletion import DELETE_ENTITY_FUNCTION, apply_entity_deletion_function
from app.db.provisioning import APP_DB_ROLE

revision: str = "095_delete_entity_function"
down_revision: Union[str, None] = "094_restaurant_branding"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    apply_entity_deletion_function(op.get_bind(), app_role=APP_DB_ROLE)


def downgrade() -> None:
    op.execute(f"DROP FUNCTION IF EXISTS {DELETE_ENTITY_FUNCTION}(uuid)")
