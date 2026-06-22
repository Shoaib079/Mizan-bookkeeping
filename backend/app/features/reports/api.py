"""Read-only report HTTP routes (ARCHITECTURE.md)."""

from __future__ import annotations

import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.db.session import get_session
from app.features.delivery.settings import DeliveryNotEnabledError
from app.features.reports import service as reports_service
from app.features.reports.schema import DeliverySalesReportRead
from app.features.reports.service import InvalidDateRangeError

router = APIRouter(prefix="/entities/{entity_id}/reports", tags=["reports"])


@router.get("/delivery-sales", response_model=DeliverySalesReportRead)
def get_delivery_sales_report(
    entity_id: uuid.UUID,
    from_date: date = Query(..., alias="from"),
    to_date: date = Query(..., alias="to"),
    session: Session = Depends(get_session),
) -> DeliverySalesReportRead:
    try:
        return reports_service.get_delivery_sales_report(
            session, entity_id, from_date, to_date
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except DeliveryNotEnabledError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except InvalidDateRangeError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
