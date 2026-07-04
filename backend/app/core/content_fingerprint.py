"""Stable SHA-256 fingerprints for uploaded file bytes."""

from __future__ import annotations

import hashlib


def file_fingerprint(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()
