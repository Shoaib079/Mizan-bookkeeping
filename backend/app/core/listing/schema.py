"""Paginated list response schemas."""

from __future__ import annotations

from typing import Generic, TypeVar

from pydantic import BaseModel, Field

from app.core.listing.params import DEFAULT_LIST_LIMIT

T = TypeVar("T")


class PaginatedListOut(BaseModel, Generic[T]):
    items: list[T]
    total: int
    limit: int = Field(default=DEFAULT_LIST_LIMIT, ge=1)
    offset: int = Field(default=0, ge=0)


def paginated_list(
    items: list[T],
    *,
    total: int,
    limit: int,
    offset: int,
) -> PaginatedListOut[T]:
    return PaginatedListOut(
        items=items,
        total=total,
        limit=limit,
        offset=offset,
    )
