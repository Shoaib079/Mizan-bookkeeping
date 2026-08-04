"""Idempotent ledger repair runner — apply each registry key once per entity."""

from __future__ import annotations

import logging
import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.ledger.repairs.models import LedgerRepair
from app.core.ledger.repairs.registry import all_repair_specs
from app.core.ledger.repairs.types import RepairReport
from app.db.session import entity_context, require_entity_context
from app.features.entities.models import Entity

logger = logging.getLogger(__name__)


def _entity_ids(session: Session, entity_id: uuid.UUID | None) -> list[uuid.UUID]:
    if entity_id is not None:
        return [entity_id]
    return list(session.scalars(select(Entity.id).order_by(Entity.created_at, Entity.id)))


def _already_applied(session: Session, entity_id: uuid.UUID, repair_key: str) -> bool:
    with entity_context(session, entity_id):
        require_entity_context()
        existing = session.scalar(
            select(LedgerRepair.id).where(
                LedgerRepair.repair_key == repair_key,
            )
        )
    return existing is not None


def _record_applied(
    session: Session,
    entity_id: uuid.UUID,
    *,
    repair_key: str,
    report: RepairReport,
    actor_id: uuid.UUID,
) -> None:
    with entity_context(session, entity_id):
        require_entity_context()
        session.add(
            LedgerRepair(
                repair_key=repair_key,
                report_json=report.to_json(),
                actor_id=actor_id,
            )
        )
        session.commit()


def run_pending_repairs(
    session: Session,
    *,
    entity_id: uuid.UUID | None = None,
) -> list[RepairReport]:
    """Apply all registered repairs that are not yet recorded for each entity.

    Fail-closed: an exception aborts that entity+repair (no applied row).
    Prior JE void/repost commits from recipe helpers may already be durable;
    re-run skips era-C rows and continues.
    """
    reports: list[RepairReport] = []
    for eid in _entity_ids(session, entity_id):
        for spec in all_repair_specs():
            if _already_applied(session, eid, spec.key):
                reports.append(
                    RepairReport(
                        repair_key=spec.key,
                        skipped=True,
                        details={"entity_id": str(eid), "reason": "already_applied"},
                    )
                )
                continue
            logger.info(
                "ledger_repair_start key=%s entity_id=%s",
                spec.key,
                eid,
            )
            try:
                report = spec.apply(session, eid)
            except Exception:
                logger.exception(
                    "ledger_repair_failed key=%s entity_id=%s",
                    spec.key,
                    eid,
                )
                raise
            actor_raw = report.details.get("actor_id")
            if not actor_raw:
                raise RuntimeError(
                    f"repair {spec.key} for entity {eid} did not report actor_id"
                )
            actor_id = uuid.UUID(str(actor_raw))
            _record_applied(
                session,
                eid,
                repair_key=spec.key,
                report=report,
                actor_id=actor_id,
            )
            logger.info(
                "ledger_repair_applied key=%s entity_id=%s repaired=%s skipped_current=%s",
                spec.key,
                eid,
                len(report.details.get("repaired") or []),
                report.details.get("skipped_current"),
            )
            reports.append(
                RepairReport(
                    repair_key=spec.key,
                    skipped=False,
                    details={"entity_id": str(eid), **report.details},
                )
            )
    return reports
