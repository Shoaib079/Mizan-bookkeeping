"""Backup feature schemas (Phase 8)."""

from __future__ import annotations

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
