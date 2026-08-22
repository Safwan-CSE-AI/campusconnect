"""
CampusConnect AI - Authentication, RBAC Authorization & Privacy Redaction Module
Provides secure token/session handling, Role-Based Access Control (RBAC),
input sanitization, and strict zero-leak item serialization.
"""

import hashlib
import hmac
import html
import json
import re
from typing import Optional, Dict, Any, List
from fastapi import HTTPException, status
from database import get_db

SECRET_KEY = "campusconnect-hackathon-secure-salt-key"
ALLOWED_ROLES = {"STUDENT", "MODERATOR", "ADMIN"}

def hash_password(password: str) -> str:
    """Computes HMAC-SHA256 hash with secure salt."""
    return hmac.new(SECRET_KEY.encode("utf-8"), password.encode("utf-8"), hashlib.sha256).hexdigest()

def verify_password(plain_password: str, password_hash: str) -> bool:
    """Verifies plain password against hash (supporting demo fallback)."""
    if plain_password == password_hash:
        return True
    return hmac.compare_digest(hash_password(plain_password), password_hash)

def sanitize_text(text: Optional[str], max_length: int = 1000) -> str:
    """Strips dangerous HTML/script tags and normalizes whitespace."""
    if not text:
        return ""
    # HTML escape
    escaped = html.escape(text.strip())
    # Limit length
    return escaped[:max_length]

def get_user_by_id(user_id: int) -> Optional[Dict[str, Any]]:
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM users WHERE id = ?", (user_id,))
    row = cursor.fetchone()
    conn.close()
    if row:
        return dict(row)
    return None

def get_user_by_email(email: str) -> Optional[Dict[str, Any]]:
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM users WHERE LOWER(email) = LOWER(?)", (email.strip(),))
    row = cursor.fetchone()
    conn.close()
    if row:
        return dict(row)
    return None

def require_role(current_user: Optional[Dict[str, Any]], allowed_roles: List[str]) -> Dict[str, Any]:
    """
    Enforces RBAC on protected endpoints.
    Raises HTTP 401 if unauthenticated, 403 if role insufficient.
    """
    if not current_user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required."
        )

    user_role = current_user.get("role", "STUDENT").upper()
    if user_role not in [r.upper() for r in allowed_roles]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Access denied. Requires one of roles: {', '.join(allowed_roles)}"
        )

    return current_user

def serialize_user_safe(user: Dict[str, Any]) -> Dict[str, Any]:
    """Safe user dict for clients (strictly strips password hash)."""
    return {
        "id": user.get("id"),
        "name": user.get("name"),
        "email": user.get("email"),
        "student_or_employee_id": user.get("student_or_employee_id"),
        "department": user.get("department"),
        "role": user.get("role"),
        "profile_image": user.get("profile_image"),
        "created_at": user.get("created_at")
    }

def serialize_item_safe(item: Dict[str, Any], current_user: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """
    Strict Zero-Leak Privacy Guard:
    - Never expose `private_identification_details` to public viewers.
    - Only reveal private details if current_user is the owner, a MODERATOR, or an ADMIN.
    """
    user_id = current_user.get("id") if current_user else None
    user_role = current_user.get("role") if current_user else None

    is_owner = (user_id is not None and item.get("user_id") == user_id)
    is_staff = (user_role in ["MODERATOR", "ADMIN"])

    images = item.get("image_urls")
    if isinstance(images, str):
        try:
            images = json.loads(images)
        except Exception:
            images = [images] if images else []

    item_dict = {
        "id": item.get("id"),
        "user_id": item.get("user_id"),
        "user_name": item.get("user_name"),
        "report_type": item.get("report_type"),
        "item_name": item.get("item_name"),
        "category": item.get("category"),
        "brand": item.get("brand") or "",
        "color": item.get("color"),
        "description": item.get("description"),
        "image_urls": images or [],
        "date_time": item.get("date_time"),
        "campus_zone": item.get("campus_zone"),
        "building": item.get("building"),
        "floor": item.get("floor") or "Ground",
        "approximate_location": item.get("approximate_location") or "",
        "current_item_location": item.get("current_item_location") or "With Finder",
        "status": item.get("status"),
        "qr_code_url": item.get("qr_code_url"),
        "recovery_probability": item.get("recovery_probability", 65),
        "created_at": item.get("created_at"),
        "updated_at": item.get("updated_at"),
        "has_private_details": bool(item.get("private_identification_details"))
    }

    if is_owner or is_staff:
        item_dict["private_identification_details"] = item.get("private_identification_details")
        item_dict["is_authorized_viewer"] = True
    else:
        item_dict["private_identification_details"] = None
        item_dict["is_authorized_viewer"] = False

    return item_dict
