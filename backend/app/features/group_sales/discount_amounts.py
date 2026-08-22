"""Resolve group-sale discount amounts per sale type."""

from __future__ import annotations

from app.features.group_sales.forex_only_discount import is_forex_only_group_sale
from app.features.group_sales.models import GroupSale


class GroupSaleDiscountError(ValueError):
    """Invalid discount input for this sale type."""


def try_discount_from_native_at_sale_rate(
    discount_native: int, fx_rate_used: int
) -> int:
    """TRY kuruş for a native discount at the sale's booked rate."""
    return round(discount_native * fx_rate_used / 100)


def resolve_group_sale_discount_amounts(
    group_sale: GroupSale,
    *,
    discount_kurus: int,
    discount_native: int | None,
) -> tuple[int, int | None]:
    """Map UI input to the TRY and native legs each sale type expects."""
    if is_forex_only_group_sale(group_sale):
        raise GroupSaleDiscountError("forex-only sales use the native-only path")

    if group_sale.forex_currency and group_sale.total_kurus > 0:
        if discount_native is None or discount_native <= 0:
            raise GroupSaleDiscountError("discount_native is required for rated FX sales")
        if group_sale.fx_rate_used is None or group_sale.fx_rate_used <= 0:
            raise GroupSaleDiscountError("group sale is missing fx rate")
        derived_kurus = try_discount_from_native_at_sale_rate(
            discount_native, group_sale.fx_rate_used
        )
        if discount_kurus > 0 and discount_kurus != derived_kurus:
            raise GroupSaleDiscountError(
                "discount TRY must match native at the sale rate"
            )
        return derived_kurus, discount_native

    if discount_kurus <= 0:
        raise GroupSaleDiscountError("discount must be positive")
    if discount_native is not None:
        raise GroupSaleDiscountError("discount_native is not used for TRY sales")
    return discount_kurus, None
