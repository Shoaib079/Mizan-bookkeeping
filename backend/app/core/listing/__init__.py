"""Shared list pagination, search, and filter helpers (Phase 8.5 Slice 3)."""

from app.core.listing.params import (
    DEFAULT_LIST_LIMIT,
    MAX_LIST_LIMIT,
    ListParams,
    list_params_dependency,
)
from app.core.listing.query import (
    amount_range_filters,
    apply_list_window,
    count_rows,
    date_range_filters,
    fetch_all_scalars,
    fetch_paginated,
    fetch_paginated_rows,
    normalized_text_search_filter,
    text_search_filter,
)
from app.core.listing.schema import PaginatedListOut, paginated_list

__all__ = [
    "DEFAULT_LIST_LIMIT",
    "MAX_LIST_LIMIT",
    "ListParams",
    "PaginatedListOut",
    "amount_range_filters",
    "apply_list_window",
    "count_rows",
    "fetch_all_scalars",
    "fetch_paginated",
    "fetch_paginated_rows",
    "list_params_dependency",
    "normalized_text_search_filter",
    "paginated_list",
    "text_search_filter",
]
