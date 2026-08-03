"""Backup feature schemas (Phase 8)."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class BackupRunResult(BaseModel):
    artifact_key: str
    timestamp: str
    git_tag: str
    sha256: str
    row_counts: dict[str, int] = Field(default_factory=dict)


class BackupVerifyResult(BaseModel):
    artifact_key: str
    scratch_database: str
    checks_passed: bool
    message: str


class BackupEnqueueResult(BaseModel):
    status: Literal["started"] = "started"
    task_id: str


class BackupTaskStatus(BaseModel):
    status: Literal["pending", "success", "failed"]
    task_id: str
    artifact_key: str | None = None
    timestamp: str | None = None
    message: str | None = None
