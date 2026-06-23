"""Pagination query parameters for list endpoints."""

from __future__ import annotations

from dataclasses import dataclass

from fastapi import Query

DEFAULT_LIST_LIMIT = 50
MAX_LIST_LIMIT = 200


@dataclass(frozen=True, slots=True)
class ListParams:
    limit: int = DEFAULT_LIST_LIMIT
    offset: int = 0


def list_params_dependency(
    limit: int = Query(default=DEFAULT_LIST_LIMIT, ge=1, le=MAX_LIST_LIMIT),
    offset: int = Query(default=0, ge=0),
) -> ListParams:
    return ListParams(limit=limit, offset=offset)
