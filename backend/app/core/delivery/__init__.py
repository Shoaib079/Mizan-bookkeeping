"""Delivery core — platform report and settlement posting boundary."""

from app.core.delivery.posting import (
    DeliveryReportPostResult,
    DeliverySettlementPostResult,
    InvalidDeliveryReportError,
    InvalidDeliverySettlementError,
    post_delivery_report,
    post_delivery_settlement,
)

__all__ = [
    "DeliveryReportPostResult",
    "DeliverySettlementPostResult",
    "InvalidDeliveryReportError",
    "InvalidDeliverySettlementError",
    "post_delivery_report",
    "post_delivery_settlement",
]
