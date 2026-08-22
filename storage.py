"""
CampusConnect AI - Secure File Storage & Image Optimization Module
Handles file validation, MIME type verification, size constraints,
and secure storage for campus item photos.
"""

import os
import uuid
from typing import Tuple
from fastapi import UploadFile, HTTPException

UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

# Allowed MIME types and extensions
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
ALLOWED_MIME_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024  # 5MB Limit

def validate_and_save_upload(file: UploadFile) -> Tuple[str, str]:
    """
    Validates uploaded file size, extension, and content type.
    Saves to safe UUID-named file on disk.
    Returns (relative_url, absolute_path).
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided.")

    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file format '{ext}'. Allowed: {', '.join(ALLOWED_EXTENSIONS)}"
        )

    if file.content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid MIME type '{file.content_type}'. Must be an image."
        )

    # Read and validate size
    try:
        content = file.file.read()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to read upload: {str(e)}")

    if len(content) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(
            status_code=400,
            detail=f"File exceeds maximum allowed size of {MAX_FILE_SIZE_BYTES // (1024*1024)}MB."
        )

    # Generate unique filename to prevent path traversal & collisions
    unique_name = f"item_{uuid.uuid4().hex[:16]}{ext}"
    target_path = os.path.join(UPLOAD_DIR, unique_name)

    with open(target_path, "wb") as f:
        f.write(content)

    return f"/uploads/{unique_name}", target_path
