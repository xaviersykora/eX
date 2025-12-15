"""
Message protocol definitions for ZeroMQ communication.
"""

from dataclasses import dataclass, field
from typing import Any, Literal
from enum import Enum
import time


class ErrorCode(str, Enum):
    """Error codes for IPC communication."""
    PATH_NOT_FOUND = "PATH_NOT_FOUND"
    ACCESS_DENIED = "ACCESS_DENIED"
    FILE_EXISTS = "FILE_EXISTS"
    DIRECTORY_NOT_EMPTY = "DIRECTORY_NOT_EMPTY"
    INVALID_PATH = "INVALID_PATH"
    DISK_FULL = "DISK_FULL"
    OPERATION_CANCELLED = "OPERATION_CANCELLED"
    OPERATION_FAILED = "OPERATION_FAILED"
    CONNECTION_FAILED = "CONNECTION_FAILED"
    TIMEOUT = "TIMEOUT"
    INVALID_REQUEST = "INVALID_REQUEST"
    UNKNOWN = "UNKNOWN"


class FSEventType(str, Enum):
    """File system event types."""
    CREATED = "created"
    DELETED = "deleted"
    MODIFIED = "modified"
    RENAMED = "renamed"
    OVERFLOW = "overflow"


@dataclass
class XPRequest:
    """Request message format."""
    id: str
    action: str
    params: dict[str, Any] = field(default_factory=dict)


@dataclass
class XPError:
    """Error information."""
    code: str
    message: str
    details: Any = None


@dataclass
class XPResponse:
    """Response message format."""
    id: str
    success: bool
    data: Any = None
    error: XPError | None = None

    def to_dict(self) -> dict:
        result = {
            "id": self.id,
            "success": self.success,
        }
        if self.data is not None:
            result["data"] = self.data
        if self.error is not None:
            result["error"] = {
                "code": self.error.code,
                "message": self.error.message,
            }
            if self.error.details is not None:
                result["error"]["details"] = self.error.details
        return result


@dataclass
class XPEvent:
    """Event message format for pub/sub."""
    type: str
    path: str
    data: Any
    timestamp: float = field(default_factory=time.time)

    def to_dict(self) -> dict:
        return {
            "type": self.type,
            "path": self.path,
            "data": self.data,
            "timestamp": self.timestamp,
        }


# Action handlers registry
ACTIONS = {
    # File System
    "fs.list": "handle_fs_list",
    "fs.info": "handle_fs_info",
    "fs.copy": "handle_fs_copy",
    "fs.move": "handle_fs_move",
    "fs.delete": "handle_fs_delete",
    "fs.rename": "handle_fs_rename",
    "fs.mkdir": "handle_fs_mkdir",
    "fs.writeFile": "handle_fs_write_file",
    "fs.folderStats": "handle_fs_folder_stats",
    "fs.folderSize": "handle_fs_folder_size",
    "fs.drives": "handle_fs_drives",
    "fs.watch": "handle_fs_watch",
    "fs.unwatch": "handle_fs_unwatch",
    "fs.search": "handle_fs_search",

    # Clipboard
    "clipboard.copy": "handle_clipboard_copy",
    "clipboard.cut": "handle_clipboard_cut",
    "clipboard.paste": "handle_clipboard_paste",
    "clipboard.get": "handle_clipboard_get",
    "clipboard.clear": "handle_clipboard_clear",

    # Shell
    "shell.thumbnail": "handle_shell_thumbnail",
    "shell.icon": "handle_shell_icon",
    "shell.contextmenu": "handle_shell_contextmenu",
    "shell.execute": "handle_shell_execute",
    "shell.properties": "handle_shell_properties",
    "shell.open": "handle_shell_open",
    "shell.recent": "handle_shell_recent",
    "shell.createShortcut": "handle_shell_create_shortcut",
    "shell.knownFolders": "handle_shell_known_folders",

    # Theme
    "theme.list": "handle_theme_list",
    "theme.get": "handle_theme_get",
    "theme.save": "handle_theme_save",
    "theme.delete": "handle_theme_delete",

    # 7-Zip
    "sevenzip.check": "handle_sevenzip_check",
    "sevenzip.addToArchive": "handle_sevenzip_add",
    "sevenzip.addToArchiveDialog": "handle_sevenzip_add_dialog",
    "sevenzip.openArchive": "handle_sevenzip_open",
    "sevenzip.extract": "handle_sevenzip_extract",

    # Operation Control
    "cancel": "handle_cancel",
}
