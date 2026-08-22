"""Group sale domain errors."""


class GroupSaleError(ValueError):
    """Group sale validation or state error."""


class GroupSaleHasPaymentsError(GroupSaleError):
    """Cannot void or edit while payments are linked."""
