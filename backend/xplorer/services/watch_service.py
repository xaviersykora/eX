"""
File system watching service using ReadDirectoryChangesW.
"""

import asyncio
import ctypes
from ctypes import wintypes
import logging
from typing import Callable, Any
from concurrent.futures import ThreadPoolExecutor
import threading

from ..protocol import XPEvent, FSEventType

logger = logging.getLogger(__name__)

# Windows constants
FILE_NOTIFY_CHANGE_FILE_NAME = 0x1
FILE_NOTIFY_CHANGE_DIR_NAME = 0x2
FILE_NOTIFY_CHANGE_ATTRIBUTES = 0x4
FILE_NOTIFY_CHANGE_SIZE = 0x8
FILE_NOTIFY_CHANGE_LAST_WRITE = 0x10
FILE_NOTIFY_CHANGE_CREATION = 0x40

FILE_ACTION_ADDED = 0x1
FILE_ACTION_REMOVED = 0x2
FILE_ACTION_MODIFIED = 0x3
FILE_ACTION_RENAMED_OLD_NAME = 0x4
FILE_ACTION_RENAMED_NEW_NAME = 0x5

INVALID_HANDLE_VALUE = ctypes.c_void_p(-1).value


class FILE_NOTIFY_INFORMATION(ctypes.Structure):
    _fields_ = [
        ("NextEntryOffset", wintypes.DWORD),
        ("Action", wintypes.DWORD),
        ("FileNameLength", wintypes.DWORD),
        ("FileName", wintypes.WCHAR * 1),
    ]


class WatchService:
    """Service for watching file system changes."""

    def __init__(self, event_callback: Callable[[XPEvent], Any]):
        self.event_callback = event_callback
        self.watches: dict[str, dict] = {}
        self.running = False
        self._executor = ThreadPoolExecutor(max_workers=4, thread_name_prefix="watch_")
        self._stop_event = threading.Event()

    async def start(self):
        """Start the watch service."""
        self.running = True
        self._stop_event.clear()
        logger.info("Watch service started")

    async def stop(self):
        """Stop the watch service."""
        self.running = False
        self._stop_event.set()

        # Close all watch handles
        for path, watch_info in list(self.watches.items()):
            try:
                handle = watch_info.get("handle")
                if handle and handle != INVALID_HANDLE_VALUE:
                    ctypes.windll.kernel32.CancelIo(handle)
                    ctypes.windll.kernel32.CloseHandle(handle)
            except Exception as e:
                logger.error(f"Error closing watch handle for {path}: {e}")

        self.watches.clear()
        self._executor.shutdown(wait=False)
        logger.info("Watch service stopped")

    async def watch(self, path: str, recursive: bool = True):
        """Start watching a directory."""
        if path in self.watches:
            logger.debug(f"Already watching: {path}")
            return

        logger.info(f"Starting watch on: {path}")

        loop = asyncio.get_event_loop()

        def start_watch():
            try:
                # Open directory handle
                handle = ctypes.windll.kernel32.CreateFileW(
                    path,
                    0x1,  # FILE_LIST_DIRECTORY
                    0x7,  # FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE
                    None,
                    3,    # OPEN_EXISTING
                    0x02000000 | 0x40000000,  # FILE_FLAG_BACKUP_SEMANTICS | FILE_FLAG_OVERLAPPED
                    None,
                )

                if handle == INVALID_HANDLE_VALUE:
                    error = ctypes.get_last_error()
                    raise OSError(f"CreateFileW failed with error {error}")

                self.watches[path] = {
                    "handle": handle,
                    "recursive": recursive,
                }

                # Start watching in a separate thread
                self._executor.submit(self._watch_loop, path, handle, recursive)

            except Exception as e:
                logger.error(f"Failed to start watch on {path}: {e}")
                raise

        await loop.run_in_executor(None, start_watch)

    async def unwatch(self, path: str):
        """Stop watching a directory."""
        watch_info = self.watches.pop(path, None)
        if watch_info:
            handle = watch_info.get("handle")
            if handle and handle != INVALID_HANDLE_VALUE:
                try:
                    ctypes.windll.kernel32.CancelIo(handle)
                    ctypes.windll.kernel32.CloseHandle(handle)
                except Exception as e:
                    logger.error(f"Error closing watch handle: {e}")

            logger.info(f"Stopped watching: {path}")

    def _watch_loop(self, path: str, handle: int, recursive: bool):
        """Main watching loop (runs in thread)."""
        buffer_size = 64 * 1024  # 64KB buffer
        buffer = ctypes.create_string_buffer(buffer_size)
        bytes_returned = wintypes.DWORD()

        notify_filter = (
            FILE_NOTIFY_CHANGE_FILE_NAME |
            FILE_NOTIFY_CHANGE_DIR_NAME |
            FILE_NOTIFY_CHANGE_ATTRIBUTES |
            FILE_NOTIFY_CHANGE_SIZE |
            FILE_NOTIFY_CHANGE_LAST_WRITE |
            FILE_NOTIFY_CHANGE_CREATION
        )

        old_name = None  # For tracking renames

        while self.running and path in self.watches:
            try:
                result = ctypes.windll.kernel32.ReadDirectoryChangesW(
                    handle,
                    buffer,
                    buffer_size,
                    recursive,
                    notify_filter,
                    ctypes.byref(bytes_returned),
                    None,  # Synchronous
                    None,
                )

                if not result:
                    error = ctypes.get_last_error()
                    if error == 995:  # ERROR_OPERATION_ABORTED
                        break
                    logger.error(f"ReadDirectoryChangesW failed with error {error}")
                    continue

                if bytes_returned.value == 0:
                    continue

                # Parse notifications
                offset = 0
                while offset < bytes_returned.value:
                    info = ctypes.cast(
                        ctypes.byref(buffer, offset),
                        ctypes.POINTER(FILE_NOTIFY_INFORMATION)
                    ).contents

                    # Get filename
                    name_length = info.FileNameLength // 2
                    filename_ptr = ctypes.cast(
                        ctypes.byref(info.FileName),
                        ctypes.POINTER(wintypes.WCHAR * name_length)
                    ).contents
                    filename = "".join(filename_ptr)
                    full_path = f"{path}\\{filename}"

                    # Map action to event type
                    if info.Action == FILE_ACTION_ADDED:
                        self._emit_event(FSEventType.CREATED, full_path)
                    elif info.Action == FILE_ACTION_REMOVED:
                        self._emit_event(FSEventType.DELETED, full_path)
                    elif info.Action == FILE_ACTION_MODIFIED:
                        self._emit_event(FSEventType.MODIFIED, full_path)
                    elif info.Action == FILE_ACTION_RENAMED_OLD_NAME:
                        old_name = full_path
                    elif info.Action == FILE_ACTION_RENAMED_NEW_NAME:
                        self._emit_event(FSEventType.RENAMED, full_path, {"oldPath": old_name})
                        old_name = None

                    if info.NextEntryOffset == 0:
                        break
                    offset += info.NextEntryOffset

            except Exception as e:
                if self.running:
                    logger.error(f"Error in watch loop for {path}: {e}")
                    # Emit overflow event to trigger refresh
                    self._emit_event(FSEventType.OVERFLOW, path)
                break

    def _emit_event(self, event_type: FSEventType, path: str, extra_data: dict = None):
        """Emit a file system event."""
        data = {"eventType": event_type.value}
        if extra_data:
            data.update(extra_data)

        event = XPEvent(
            type="fs.changed",
            path=path,
            data=data,
        )

        # Run callback in async context
        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                asyncio.run_coroutine_threadsafe(self.event_callback(event), loop)
            else:
                asyncio.run(self.event_callback(event))
        except Exception as e:
            logger.error(f"Error emitting event: {e}")
