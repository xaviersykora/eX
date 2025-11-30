"""
File system service for X-Plorer.
Provides file operations with fallback to pure Python when Cython modules aren't available.
"""

import os
import stat
import asyncio
import shutil
import mimetypes
from pathlib import Path
from typing import Any
from concurrent.futures import ThreadPoolExecutor
import logging

logger = logging.getLogger(__name__)

# Try to import Cython modules, fall back to pure Python
try:
    from ..core import filesystem as fs_core
    USE_CYTHON = True
    logger.info("Using Cython filesystem module")
except ImportError:
    USE_CYTHON = False
    logger.info("Cython modules not available, using pure Python")

# Thread pool for blocking operations
_executor = ThreadPoolExecutor(max_workers=4)


def _get_file_info(path: str) -> dict[str, Any]:
    """Get file information for a single file."""
    try:
        stat_result = os.stat(path)
        is_dir = stat.S_ISDIR(stat_result.st_mode)
        name = os.path.basename(path)
        extension = "" if is_dir else os.path.splitext(name)[1]

        # Check file attributes on Windows
        is_hidden = False
        is_system = False
        is_readonly = False

        try:
            import ctypes
            attrs = ctypes.windll.kernel32.GetFileAttributesW(path)
            if attrs != -1:
                is_hidden = bool(attrs & 0x2)  # FILE_ATTRIBUTE_HIDDEN
                is_system = bool(attrs & 0x4)  # FILE_ATTRIBUTE_SYSTEM
                is_readonly = bool(attrs & 0x1)  # FILE_ATTRIBUTE_READONLY
        except Exception:
            # Fall back to name-based hidden detection
            is_hidden = name.startswith(".")

        return {
            "name": name,
            "path": path,
            "isDirectory": is_dir,
            "isHidden": is_hidden,
            "isSystem": is_system,
            "isReadOnly": is_readonly,
            "size": 0 if is_dir else stat_result.st_size,
            "createdAt": int(stat_result.st_ctime),
            "modifiedAt": int(stat_result.st_mtime),
            "accessedAt": int(stat_result.st_atime),
            "extension": extension,
            "mimeType": mimetypes.guess_type(path)[0] if not is_dir else None,
        }
    except OSError as e:
        logger.error(f"Error getting file info for {path}: {e}")
        raise


def _list_directory(path: str) -> list[dict[str, Any]]:
    """List directory contents."""
    result = []

    try:
        with os.scandir(path) as entries:
            for entry in entries:
                try:
                    result.append(_get_file_info(entry.path))
                except (OSError, PermissionError) as e:
                    logger.warning(f"Skipping {entry.path}: {e}")
                    continue
    except OSError as e:
        logger.error(f"Error listing directory {path}: {e}")
        raise

    return result


def _get_drives() -> list[dict[str, Any]]:
    """Get list of available drives (Windows)."""
    drives = []

    try:
        import ctypes
        from ctypes import wintypes

        kernel32 = ctypes.windll.kernel32

        # Get logical drives bitmask
        bitmask = kernel32.GetLogicalDrives()

        for i in range(26):
            if bitmask & (1 << i):
                letter = chr(ord("A") + i) + ":"
                drive_path = letter + "\\"

                # Get drive type
                drive_type = kernel32.GetDriveTypeW(drive_path)

                # Get volume information
                name_buffer = ctypes.create_unicode_buffer(256)
                fs_buffer = ctypes.create_unicode_buffer(256)

                success = kernel32.GetVolumeInformationW(
                    drive_path,
                    name_buffer,
                    256,
                    None,
                    None,
                    None,
                    fs_buffer,
                    256,
                )

                # Get disk space
                free_bytes = ctypes.c_ulonglong()
                total_bytes = ctypes.c_ulonglong()

                try:
                    kernel32.GetDiskFreeSpaceExW(
                        drive_path,
                        None,
                        ctypes.byref(total_bytes),
                        ctypes.byref(free_bytes),
                    )
                except Exception:
                    pass

                drives.append({
                    "letter": letter,
                    "name": name_buffer.value if success else "",
                    "type": drive_type,
                    "totalSize": total_bytes.value,
                    "freeSpace": free_bytes.value,
                    "fileSystem": fs_buffer.value if success else "",
                    "isReady": success,
                })

    except Exception as e:
        logger.error(f"Error getting drives: {e}")
        # Fallback
        drives = [{"letter": "C:", "name": "Local Disk", "type": 3, "totalSize": 0, "freeSpace": 0, "fileSystem": "NTFS", "isReady": True}]

    return drives


def _copy_file(src: str, dst: str) -> None:
    """Copy a single file or directory."""
    if os.path.isdir(src):
        shutil.copytree(src, dst)
    else:
        shutil.copy2(src, dst)


def _move_file(src: str, dst: str) -> None:
    """Move a single file or directory."""
    shutil.move(src, dst)


def _delete_file(path: str, recycle: bool = True) -> None:
    """Delete a file or directory."""
    if recycle:
        try:
            # Use Windows Shell to move to recycle bin
            import ctypes
            from ctypes import wintypes

            # SHFILEOPSTRUCT requires pFrom to be a buffer (not a pointer to string)
            # with double null termination
            class SHFILEOPSTRUCTW(ctypes.Structure):
                _fields_ = [
                    ("hwnd", wintypes.HWND),
                    ("wFunc", ctypes.c_uint),
                    ("pFrom", ctypes.c_wchar_p),
                    ("pTo", ctypes.c_wchar_p),
                    ("fFlags", wintypes.WORD),
                    ("fAnyOperationsAborted", wintypes.BOOL),
                    ("hNameMappings", ctypes.c_void_p),
                    ("lpszProgressTitle", ctypes.c_wchar_p),
                ]

            FO_DELETE = 3
            FOF_ALLOWUNDO = 0x40
            FOF_NOCONFIRMATION = 0x10
            FOF_SILENT = 0x4
            FOF_NOERRORUI = 0x400

            # Create double-null terminated string
            # The path must end with double null characters
            from_path = path + "\0"

            fileop = SHFILEOPSTRUCTW()
            fileop.hwnd = None
            fileop.wFunc = FO_DELETE
            fileop.pFrom = from_path
            fileop.pTo = None
            fileop.fFlags = FOF_ALLOWUNDO | FOF_NOCONFIRMATION | FOF_SILENT | FOF_NOERRORUI
            fileop.fAnyOperationsAborted = False
            fileop.hNameMappings = None
            fileop.lpszProgressTitle = None

            # Set up proper function signature
            shell32 = ctypes.windll.shell32
            shell32.SHFileOperationW.argtypes = [ctypes.POINTER(SHFILEOPSTRUCTW)]
            shell32.SHFileOperationW.restype = ctypes.c_int

            result = shell32.SHFileOperationW(ctypes.byref(fileop))
            if result != 0:
                # Common error codes:
                # 2 = File not found
                # 5 = Access denied
                # 113 = Path too long
                # 120 = API not implemented (structure problem)
                # 1026 = Source and destination are the same
                raise OSError(f"SHFileOperation failed with code {result}")

            if fileop.fAnyOperationsAborted:
                raise OSError("Operation was aborted")

            return

        except Exception as e:
            logger.warning(f"Failed to use recycle bin, falling back to permanent delete: {e}")

    # Permanent delete
    if os.path.isdir(path):
        shutil.rmtree(path)
    else:
        os.remove(path)


def _rename_file(path: str, new_name: str) -> str:
    """Rename a file or directory."""
    parent = os.path.dirname(path)
    new_path = os.path.join(parent, new_name)
    os.rename(path, new_path)
    return new_path


def _create_directory(path: str) -> None:
    """Create a directory."""
    os.makedirs(path, exist_ok=False)


class FileService:
    """Service for file system operations."""

    async def list_directory(self, path: str) -> list[dict[str, Any]]:
        """List contents of a directory."""
        if not path:
            raise ValueError("Path is required")

        loop = asyncio.get_event_loop()

        if USE_CYTHON:
            return await loop.run_in_executor(_executor, fs_core.list_directory, path)
        else:
            return await loop.run_in_executor(_executor, _list_directory, path)

    async def get_file_info(self, path: str) -> dict[str, Any]:
        """Get information about a file or directory."""
        if not path:
            raise ValueError("Path is required")

        loop = asyncio.get_event_loop()

        if USE_CYTHON:
            return await loop.run_in_executor(_executor, fs_core.get_file_info, path)
        else:
            return await loop.run_in_executor(_executor, _get_file_info, path)

    async def copy_files(self, sources: list[str], destination: str) -> dict[str, Any]:
        """Copy files to destination."""
        if not sources or not destination:
            raise ValueError("Sources and destination are required")

        loop = asyncio.get_event_loop()
        copied = []
        errors = []

        for src in sources:
            try:
                name = os.path.basename(src)
                dst = os.path.join(destination, name)

                # Handle name conflicts
                counter = 1
                base, ext = os.path.splitext(name)
                while os.path.exists(dst):
                    dst = os.path.join(destination, f"{base} ({counter}){ext}")
                    counter += 1

                await loop.run_in_executor(_executor, _copy_file, src, dst)
                copied.append({"source": src, "destination": dst})
            except Exception as e:
                errors.append({"path": src, "error": str(e)})

        return {"copied": copied, "errors": errors}

    async def move_files(self, sources: list[str], destination: str) -> dict[str, Any]:
        """Move files to destination."""
        if not sources or not destination:
            raise ValueError("Sources and destination are required")

        loop = asyncio.get_event_loop()
        moved = []
        errors = []

        for src in sources:
            try:
                name = os.path.basename(src)
                dst = os.path.join(destination, name)
                await loop.run_in_executor(_executor, _move_file, src, dst)
                moved.append({"source": src, "destination": dst})
            except Exception as e:
                errors.append({"path": src, "error": str(e)})

        return {"moved": moved, "errors": errors}

    async def delete_files(self, paths: list[str], recycle_bin: bool = True) -> dict[str, Any]:
        """Delete files."""
        if not paths:
            raise ValueError("Paths are required")

        loop = asyncio.get_event_loop()
        deleted = []
        errors = []

        for path in paths:
            try:
                await loop.run_in_executor(_executor, _delete_file, path, recycle_bin)
                deleted.append(path)
            except Exception as e:
                errors.append({"path": path, "error": str(e)})

        return {"deleted": deleted, "errors": errors}

    async def rename_file(self, path: str, new_name: str) -> dict[str, Any]:
        """Rename a file or directory."""
        if not path or not new_name:
            raise ValueError("Path and new name are required")

        loop = asyncio.get_event_loop()
        new_path = await loop.run_in_executor(_executor, _rename_file, path, new_name)

        return {"oldPath": path, "newPath": new_path}

    async def create_directory(self, path: str) -> dict[str, Any]:
        """Create a new directory."""
        if not path:
            raise ValueError("Path is required")

        loop = asyncio.get_event_loop()

        # Handle name conflicts
        base_path = path
        counter = 1
        while os.path.exists(path):
            path = f"{base_path} ({counter})"
            counter += 1

        await loop.run_in_executor(_executor, _create_directory, path)

        return {"path": path}

    async def write_file(self, path: str, content: str = "") -> dict[str, Any]:
        """Create a new file with optional content."""
        if not path:
            raise ValueError("Path is required")

        loop = asyncio.get_event_loop()

        # Handle name conflicts
        base_path = path
        base, ext = os.path.splitext(path)
        counter = 1
        while os.path.exists(path):
            path = f"{base} ({counter}){ext}"
            counter += 1

        def do_write():
            with open(path, 'w', encoding='utf-8') as f:
                f.write(content)

        await loop.run_in_executor(_executor, do_write)

        return {"path": path}

    async def get_folder_stats(self, path: str) -> dict[str, Any]:
        """Get folder statistics (file count and folder count)."""
        if not path:
            raise ValueError("Path is required")

        loop = asyncio.get_event_loop()

        def do_count():
            file_count = 0
            folder_count = 0

            try:
                with os.scandir(path) as entries:
                    for entry in entries:
                        try:
                            if entry.is_dir():
                                folder_count += 1
                            else:
                                file_count += 1
                        except (OSError, PermissionError):
                            continue
            except (OSError, PermissionError) as e:
                logger.error(f"Error counting folder contents for {path}: {e}")

            return {"fileCount": file_count, "folderCount": folder_count}

        return await loop.run_in_executor(_executor, do_count)

    async def get_folder_size(self, path: str) -> dict[str, Any]:
        """Get recursive folder size (total size of all contents)."""
        if not path:
            raise ValueError("Path is required")

        loop = asyncio.get_event_loop()

        def do_calculate():
            total_size = 0

            try:
                for root, dirs, files in os.walk(path):
                    for file in files:
                        try:
                            file_path = os.path.join(root, file)
                            total_size += os.path.getsize(file_path)
                        except (OSError, PermissionError):
                            continue
            except (OSError, PermissionError) as e:
                logger.error(f"Error calculating folder size for {path}: {e}")

            return {"path": path, "size": total_size}

        return await loop.run_in_executor(_executor, do_calculate)

    async def get_drives(self) -> list[dict[str, Any]]:
        """Get list of available drives."""
        loop = asyncio.get_event_loop()

        if USE_CYTHON:
            return await loop.run_in_executor(_executor, fs_core.get_drives)
        else:
            return await loop.run_in_executor(_executor, _get_drives)

    async def search(self, path: str, query: str, recursive: bool = True) -> list[dict[str, Any]]:
        """Search for files."""
        if not path or not query:
            raise ValueError("Path and query are required")

        loop = asyncio.get_event_loop()

        def do_search():
            results = []
            query_lower = query.lower()

            if recursive:
                for root, dirs, files in os.walk(path):
                    for name in dirs + files:
                        if query_lower in name.lower():
                            full_path = os.path.join(root, name)
                            try:
                                results.append(_get_file_info(full_path))
                            except Exception:
                                continue
            else:
                for entry in os.scandir(path):
                    if query_lower in entry.name.lower():
                        try:
                            results.append(_get_file_info(entry.path))
                        except Exception:
                            continue

            return results

        return await loop.run_in_executor(_executor, do_search)
