"""
File permission utilities for Windows.
"""

import ctypes
from ctypes import wintypes
import logging
from typing import Any

logger = logging.getLogger(__name__)


def get_file_permissions(path: str) -> dict[str, Any]:
    """
    Get file permissions/attributes for a path.

    Args:
        path: File path

    Returns:
        Dictionary with permission information
    """
    try:
        attrs = ctypes.windll.kernel32.GetFileAttributesW(path)

        if attrs == 0xFFFFFFFF:  # INVALID_FILE_ATTRIBUTES
            return {"error": "Failed to get attributes"}

        return {
            "readonly": bool(attrs & 0x1),    # FILE_ATTRIBUTE_READONLY
            "hidden": bool(attrs & 0x2),      # FILE_ATTRIBUTE_HIDDEN
            "system": bool(attrs & 0x4),      # FILE_ATTRIBUTE_SYSTEM
            "directory": bool(attrs & 0x10),  # FILE_ATTRIBUTE_DIRECTORY
            "archive": bool(attrs & 0x20),    # FILE_ATTRIBUTE_ARCHIVE
            "encrypted": bool(attrs & 0x4000),  # FILE_ATTRIBUTE_ENCRYPTED
            "compressed": bool(attrs & 0x800),  # FILE_ATTRIBUTE_COMPRESSED
        }

    except Exception as e:
        logger.error(f"Error getting permissions for {path}: {e}")
        return {"error": str(e)}


def set_file_readonly(path: str, readonly: bool) -> bool:
    """
    Set or clear the readonly attribute.

    Args:
        path: File path
        readonly: True to set, False to clear

    Returns:
        True if successful
    """
    try:
        attrs = ctypes.windll.kernel32.GetFileAttributesW(path)

        if attrs == 0xFFFFFFFF:
            return False

        if readonly:
            new_attrs = attrs | 0x1
        else:
            new_attrs = attrs & ~0x1

        return bool(ctypes.windll.kernel32.SetFileAttributesW(path, new_attrs))

    except Exception as e:
        logger.error(f"Error setting readonly for {path}: {e}")
        return False


def set_file_hidden(path: str, hidden: bool) -> bool:
    """
    Set or clear the hidden attribute.

    Args:
        path: File path
        hidden: True to set, False to clear

    Returns:
        True if successful
    """
    try:
        attrs = ctypes.windll.kernel32.GetFileAttributesW(path)

        if attrs == 0xFFFFFFFF:
            return False

        if hidden:
            new_attrs = attrs | 0x2
        else:
            new_attrs = attrs & ~0x2

        return bool(ctypes.windll.kernel32.SetFileAttributesW(path, new_attrs))

    except Exception as e:
        logger.error(f"Error setting hidden for {path}: {e}")
        return False


def get_owner(path: str) -> str | None:
    """
    Get the owner of a file.

    Args:
        path: File path

    Returns:
        Owner name or None if failed
    """
    try:
        import win32security

        sd = win32security.GetFileSecurity(
            path, win32security.OWNER_SECURITY_INFORMATION
        )
        owner_sid = sd.GetSecurityDescriptorOwner()
        name, domain, _ = win32security.LookupAccountSid(None, owner_sid)

        return f"{domain}\\{name}"

    except ImportError:
        logger.warning("win32security not available")
        return None
    except Exception as e:
        logger.error(f"Error getting owner for {path}: {e}")
        return None
