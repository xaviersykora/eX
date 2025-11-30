"""
Windows clipboard service for file operations.
"""

import ctypes
from ctypes import wintypes
import os
import logging
from typing import Any

logger = logging.getLogger(__name__)

# Windows clipboard formats
CF_HDROP = 15
GMEM_MOVEABLE = 0x0002
GMEM_ZEROINIT = 0x0040

# Drop effect values
DROPEFFECT_COPY = 1
DROPEFFECT_MOVE = 2

# Set up proper Windows API function signatures
kernel32 = ctypes.windll.kernel32
user32 = ctypes.windll.user32
shell32 = ctypes.windll.shell32

# GlobalAlloc
kernel32.GlobalAlloc.argtypes = [wintypes.UINT, ctypes.c_size_t]
kernel32.GlobalAlloc.restype = wintypes.HGLOBAL

# GlobalLock
kernel32.GlobalLock.argtypes = [wintypes.HGLOBAL]
kernel32.GlobalLock.restype = ctypes.c_void_p

# GlobalUnlock
kernel32.GlobalUnlock.argtypes = [wintypes.HGLOBAL]
kernel32.GlobalUnlock.restype = wintypes.BOOL

# GlobalFree
kernel32.GlobalFree.argtypes = [wintypes.HGLOBAL]
kernel32.GlobalFree.restype = wintypes.HGLOBAL

# GlobalSize
kernel32.GlobalSize.argtypes = [wintypes.HGLOBAL]
kernel32.GlobalSize.restype = ctypes.c_size_t

# OpenClipboard
user32.OpenClipboard.argtypes = [wintypes.HWND]
user32.OpenClipboard.restype = wintypes.BOOL

# CloseClipboard
user32.CloseClipboard.argtypes = []
user32.CloseClipboard.restype = wintypes.BOOL

# EmptyClipboard
user32.EmptyClipboard.argtypes = []
user32.EmptyClipboard.restype = wintypes.BOOL

# SetClipboardData
user32.SetClipboardData.argtypes = [wintypes.UINT, wintypes.HANDLE]
user32.SetClipboardData.restype = wintypes.HANDLE

# GetClipboardData
user32.GetClipboardData.argtypes = [wintypes.UINT]
user32.GetClipboardData.restype = wintypes.HANDLE

# RegisterClipboardFormatW
user32.RegisterClipboardFormatW.argtypes = [wintypes.LPCWSTR]
user32.RegisterClipboardFormatW.restype = wintypes.UINT

# DragQueryFileW - for getting files from HDROP
shell32.DragQueryFileW.argtypes = [wintypes.HANDLE, wintypes.UINT, wintypes.LPWSTR, wintypes.UINT]
shell32.DragQueryFileW.restype = wintypes.UINT


class DROPFILES(ctypes.Structure):
    _fields_ = [
        ("pFiles", wintypes.DWORD),
        ("pt", wintypes.POINT),
        ("fNC", wintypes.BOOL),
        ("fWide", wintypes.BOOL),
    ]


class ClipboardService:
    """Service for clipboard operations."""

    @staticmethod
    async def copy(paths: list[str], cut: bool = False) -> dict[str, Any]:
        """Copy files to clipboard."""
        if not paths:
            return {"success": False, "error": "No paths provided"}

        h_global = None
        clipboard_opened = False

        try:
            # Open clipboard with retries (clipboard may be temporarily locked)
            for _ in range(3):
                if user32.OpenClipboard(None):
                    clipboard_opened = True
                    break
                import time
                time.sleep(0.1)

            if not clipboard_opened:
                raise OSError("Failed to open clipboard - it may be in use by another application")

            # Empty clipboard
            user32.EmptyClipboard()

            # Build file list (double-null terminated)
            file_list = "\0".join(paths) + "\0\0"
            file_list_bytes = file_list.encode("utf-16-le")

            # Calculate buffer size
            buffer_size = ctypes.sizeof(DROPFILES) + len(file_list_bytes)

            # Allocate global memory
            h_global = kernel32.GlobalAlloc(GMEM_MOVEABLE | GMEM_ZEROINIT, buffer_size)
            if not h_global:
                error_code = ctypes.get_last_error()
                raise OSError(f"Failed to allocate global memory (error {error_code})")

            # Lock memory and get pointer
            p_global = kernel32.GlobalLock(h_global)
            if not p_global:
                error_code = ctypes.get_last_error()
                raise OSError(f"Failed to lock global memory (error {error_code})")

            try:
                # Write DROPFILES structure
                drop_files = DROPFILES.from_address(p_global)
                drop_files.pFiles = ctypes.sizeof(DROPFILES)
                drop_files.fWide = True
                drop_files.fNC = False
                drop_files.pt.x = 0
                drop_files.pt.y = 0

                # Write file list after structure
                ctypes.memmove(
                    p_global + ctypes.sizeof(DROPFILES),
                    file_list_bytes,
                    len(file_list_bytes),
                )

            finally:
                kernel32.GlobalUnlock(h_global)

            # Set clipboard data - ownership of h_global transfers to clipboard on success
            result = user32.SetClipboardData(CF_HDROP, h_global)
            if not result:
                error_code = ctypes.get_last_error()
                raise OSError(f"Failed to set clipboard data (error {error_code})")

            # h_global is now owned by clipboard, don't free it
            h_global = None

            # Set drop effect for cut operation
            if cut:
                # Register and set drop effect format
                cf_preferred = user32.RegisterClipboardFormatW("Preferred DropEffect")
                if cf_preferred:
                    effect_size = ctypes.sizeof(wintypes.DWORD)
                    h_effect = kernel32.GlobalAlloc(GMEM_MOVEABLE, effect_size)
                    if h_effect:
                        p_effect = kernel32.GlobalLock(h_effect)
                        if p_effect:
                            try:
                                effect = wintypes.DWORD.from_address(p_effect)
                                effect.value = DROPEFFECT_MOVE
                            finally:
                                kernel32.GlobalUnlock(h_effect)
                            if not user32.SetClipboardData(cf_preferred, h_effect):
                                kernel32.GlobalFree(h_effect)

            return {
                "success": True,
                "operation": "cut" if cut else "copy",
                "count": len(paths),
            }

        except Exception as e:
            logger.error(f"Error copying to clipboard: {e}")
            # Free h_global if we still own it
            if h_global:
                kernel32.GlobalFree(h_global)
            return {"success": False, "error": str(e)}

        finally:
            if clipboard_opened:
                user32.CloseClipboard()

    @staticmethod
    async def paste(destination: str) -> dict[str, Any]:
        """Paste files from clipboard to destination."""
        if not destination:
            return {"success": False, "error": "No destination provided"}

        try:
            files = await ClipboardService.get_files()
            if not files:
                return {"success": False, "error": "No files in clipboard"}

            # Check if it's a cut operation
            is_cut = False
            try:
                if user32.OpenClipboard(None):
                    try:
                        cf_preferred = user32.RegisterClipboardFormatW(
                            "Preferred DropEffect"
                        )
                        if cf_preferred:
                            h_data = user32.GetClipboardData(cf_preferred)
                            if h_data:
                                p_data = kernel32.GlobalLock(h_data)
                                if p_data:
                                    effect = wintypes.DWORD.from_address(p_data).value
                                    is_cut = (effect & DROPEFFECT_MOVE) != 0
                                    kernel32.GlobalUnlock(h_data)
                    finally:
                        user32.CloseClipboard()
            except Exception:
                pass

            # Perform file operations
            import shutil
            results = {"copied": [], "moved": [], "errors": []}

            for src in files:
                try:
                    name = os.path.basename(src)
                    dst = os.path.join(destination, name)

                    # Handle conflicts
                    counter = 1
                    base, ext = os.path.splitext(name)
                    while os.path.exists(dst):
                        dst = os.path.join(destination, f"{base} ({counter}){ext}")
                        counter += 1

                    if is_cut:
                        shutil.move(src, dst)
                        results["moved"].append({"source": src, "destination": dst})
                    else:
                        if os.path.isdir(src):
                            shutil.copytree(src, dst)
                        else:
                            shutil.copy2(src, dst)
                        results["copied"].append({"source": src, "destination": dst})

                except Exception as e:
                    results["errors"].append({"path": src, "error": str(e)})

            # Clear clipboard if cut
            if is_cut and not results["errors"]:
                await ClipboardService.clear()

            return {"success": True, **results}

        except Exception as e:
            logger.error(f"Error pasting from clipboard: {e}")
            return {"success": False, "error": str(e)}

    @staticmethod
    async def get_files() -> list[str]:
        """Get list of files from clipboard."""
        files = []

        try:
            if not user32.OpenClipboard(None):
                return files

            try:
                h_drop = user32.GetClipboardData(CF_HDROP)
                if not h_drop:
                    return files

                # Get number of files (0xFFFFFFFF = -1 as UINT means get count)
                count = shell32.DragQueryFileW(h_drop, 0xFFFFFFFF, None, 0)

                # Get each file path
                buffer = ctypes.create_unicode_buffer(260)
                for i in range(count):
                    length = shell32.DragQueryFileW(h_drop, i, buffer, 260)
                    if length > 0:
                        files.append(buffer.value)

            finally:
                user32.CloseClipboard()

        except Exception as e:
            logger.error(f"Error getting files from clipboard: {e}")

        return files

    @staticmethod
    async def clear() -> dict[str, Any]:
        """Clear the clipboard."""
        try:
            if not user32.OpenClipboard(None):
                raise OSError("Failed to open clipboard")

            try:
                user32.EmptyClipboard()
            finally:
                user32.CloseClipboard()

            return {"success": True}

        except Exception as e:
            logger.error(f"Error clearing clipboard: {e}")
            return {"success": False, "error": str(e)}
