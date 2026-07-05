"""Storage adapters — local disk or S3/R2 via facade."""

from app.adapters.storage.facade import (
    StoredUploadDocument,
    delete_stored_upload,
    ensure_storage_roots,
    load_upload_document,
    prepare_uploads_for_backup,
    read_upload_bytes,
    save_upload,
    upload_exists,
    uses_s3_upload_storage,
)

__all__ = [
    "StoredUploadDocument",
    "delete_stored_upload",
    "ensure_storage_roots",
    "load_upload_document",
    "prepare_uploads_for_backup",
    "read_upload_bytes",
    "save_upload",
    "upload_exists",
    "uses_s3_upload_storage",
]
