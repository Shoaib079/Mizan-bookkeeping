"""Classification rule keyed by (entity_id, seller_vkn, match_token).

Prevents counter collisions when multiple platforms share the same text token
(e.g. "komisyon hizmet bedeli") but have different seller VKNs.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "069_classification_rule_vkn_key"
down_revision: Union[str, None] = "068_invoice_draft_other_taxes"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        "UPDATE invoice_classification_rules SET seller_vkn = '' WHERE seller_vkn IS NULL"
    )
    op.drop_constraint(
        "uq_invoice_classification_rules_entity_token",
        "invoice_classification_rules",
        type_="unique",
    )
    op.alter_column(
        "invoice_classification_rules",
        "seller_vkn",
        existing_type=sa.String(16),
        nullable=False,
        server_default="",
    )
    op.create_unique_constraint(
        "uq_invoice_classification_rules_entity_vkn_token",
        "invoice_classification_rules",
        ["entity_id", "seller_vkn", "match_token"],
    )


def downgrade() -> None:
    op.drop_constraint(
        "uq_invoice_classification_rules_entity_vkn_token",
        "invoice_classification_rules",
        type_="unique",
    )
    op.alter_column(
        "invoice_classification_rules",
        "seller_vkn",
        existing_type=sa.String(16),
        nullable=True,
        server_default=None,
    )
    op.create_unique_constraint(
        "uq_invoice_classification_rules_entity_token",
        "invoice_classification_rules",
        ["entity_id", "match_token"],
    )
