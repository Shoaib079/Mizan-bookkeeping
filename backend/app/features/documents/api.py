"""Document detection API (UX-C)."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, File, UploadFile
from pydantic import BaseModel

from app.core.auth.deps import member_read_guard
from app.features.documents.detect import (
    Confidence,
    DocumentType,
    detect_document_type,
)

router = APIRouter(
    prefix="/entities/{entity_id}/detect-document-type",
    tags=["documents"],
)


class DetectDocumentTypeOut(BaseModel):
    document_type: DocumentType
    confidence: Confidence


@router.post("", response_model=DetectDocumentTypeOut)
async def detect_document_type_endpoint(
    entity_id: uuid.UUID,
    file: UploadFile = File(...),
    _: None = Depends(member_read_guard),
) -> DetectDocumentTypeOut:
    content = await file.read()
    doc_type, confidence = detect_document_type(
        content,
        filename=file.filename,
        content_type=file.content_type,
    )
    return DetectDocumentTypeOut(document_type=doc_type, confidence=confidence)
