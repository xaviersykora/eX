"""
Icon extraction utilities.
"""

import ctypes
from ctypes import wintypes
import base64
from io import BytesIO
import logging

logger = logging.getLogger(__name__)


def get_system_icon(path: str, size: int = 16) -> str | None:
    """
    Get system icon for a file as base64-encoded PNG.

    Args:
        path: File path
        size: Icon size (16 or 32)

    Returns:
        Base64-encoded PNG string or None if failed
    """
    try:
        # Define SHFILEINFO structure
        class SHFILEINFO(ctypes.Structure):
            _fields_ = [
                ("hIcon", wintypes.HICON),
                ("iIcon", ctypes.c_int),
                ("dwAttributes", wintypes.DWORD),
                ("szDisplayName", wintypes.WCHAR * 260),
                ("szTypeName", wintypes.WCHAR * 80),
            ]

        SHGFI_ICON = 0x100
        SHGFI_SMALLICON = 0x1
        SHGFI_LARGEICON = 0x0

        shfi = SHFILEINFO()
        flags = SHGFI_ICON | (SHGFI_SMALLICON if size <= 16 else SHGFI_LARGEICON)

        result = ctypes.windll.shell32.SHGetFileInfoW(
            path,
            0,
            ctypes.byref(shfi),
            ctypes.sizeof(shfi),
            flags,
        )

        if not result or not shfi.hIcon:
            return None

        try:
            # Try to convert icon to PNG using PIL and win32gui
            return _icon_to_base64(shfi.hIcon, size)
        finally:
            ctypes.windll.user32.DestroyIcon(shfi.hIcon)

    except Exception as e:
        logger.error(f"Error getting system icon for {path}: {e}")
        return None


def _icon_to_base64(hicon: int, size: int) -> str | None:
    """Convert HICON to base64 PNG."""
    try:
        import win32gui
        import win32ui
        import win32con
        from PIL import Image

        # Get icon info
        icon_info = win32gui.GetIconInfo(hicon)

        # Determine size
        icon_size = 32 if size > 16 else 16

        # Create device contexts
        hdc = win32gui.GetDC(0)
        hdc_mem = win32ui.CreateDCFromHandle(hdc)
        hdc_bitmap = hdc_mem.CreateCompatibleDC()

        # Create bitmap
        bmp = win32ui.CreateBitmap()
        bmp.CreateCompatibleBitmap(hdc_mem, icon_size, icon_size)
        hdc_bitmap.SelectObject(bmp)

        # Fill with white background
        hdc_bitmap.FillSolidRect((0, 0, icon_size, icon_size), 0xFFFFFF)

        # Draw icon
        win32gui.DrawIconEx(
            hdc_bitmap.GetHandleOutput(),
            0,
            0,
            hicon,
            icon_size,
            icon_size,
            0,
            0,
            win32con.DI_NORMAL,
        )

        # Get bitmap bits
        bmp_info = bmp.GetInfo()
        bmp_bits = bmp.GetBitmapBits(True)

        # Create PIL image
        img = Image.frombuffer(
            "RGBA",
            (bmp_info["bmWidth"], bmp_info["bmHeight"]),
            bmp_bits,
            "raw",
            "BGRA",
            0,
            1,
        )

        # Resize if needed
        if img.size[0] != size:
            img = img.resize((size, size), Image.Resampling.LANCZOS)

        # Convert to base64 PNG
        buffer = BytesIO()
        img.save(buffer, format="PNG")
        return base64.b64encode(buffer.getvalue()).decode("ascii")

    except ImportError:
        logger.warning("win32gui/PIL not available for icon conversion")
        return None
    except Exception as e:
        logger.error(f"Error converting icon to base64: {e}")
        return None
