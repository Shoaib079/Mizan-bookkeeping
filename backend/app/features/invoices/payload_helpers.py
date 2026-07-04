"""Shared extraction-payload helpers — importable without circular deps."""

from __future__ import annotations


def pdf_text_from_payload(payload: dict) -> str | None:
    """Read text_sample from payload — stored inside raw{} by efatura.py."""
    raw = payload.get("raw")
    if isinstance(raw, dict):
        sample = raw.get("text_sample")
        if isinstance(sample, str) and sample.strip():
            return sample
    sample = payload.get("text_sample")
    return sample if isinstance(sample, str) and sample.strip() else None
