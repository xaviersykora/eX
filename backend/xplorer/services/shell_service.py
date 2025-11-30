"""
Windows Shell integration service.
"""

import ctypes
from ctypes import wintypes
import os
import base64
from io import BytesIO
import logging
import hashlib
from typing import Any
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import uuid

logger = logging.getLogger(__name__)

# Known folder GUIDs for Windows libraries
# https://docs.microsoft.com/en-us/windows/win32/shell/knownfolderid
KNOWN_FOLDER_GUIDS = {
    "Desktop": "{B4BFCC3A-DB2C-424C-B029-7FE99A87C641}",
    "Documents": "{FDD39AD0-238F-46AF-ADB4-6C85480369C7}",
    "Downloads": "{374DE290-123F-4565-9164-39C4925E467B}",
    "Music": "{4BD8D571-6D19-48D3-BE97-422220080E43}",
    "Pictures": "{33E28130-4E1E-4676-835A-98395C3BC3BB}",
    "Videos": "{18989B1D-99B5-455B-841C-AB7C74E4DDFC}",
    "Profile": "{5E6C858F-0E22-4760-9AFE-EA3317B67173}",  # User's home folder
}

_executor = ThreadPoolExecutor(max_workers=4, thread_name_prefix="shell_")

# Supported file extensions for thumbnails
IMAGE_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.ico', '.tiff', '.tif'}
VIDEO_EXTENSIONS = {'.mp4', '.mkv', '.avi', '.mov', '.wmv', '.webm', '.flv', '.m4v', '.mpg', '.mpeg'}

# Cache directory for thumbnails
THUMBNAIL_CACHE_DIR = os.path.join(os.environ.get('LOCALAPPDATA', ''), 'XPlorer', 'ThumbnailCache')

# Windows Recent folder path
RECENT_FOLDER = os.path.join(os.environ.get('APPDATA', ''), 'Microsoft', 'Windows', 'Recent')


class ShellService:
    """Service for Windows Shell operations."""

    @staticmethod
    def _get_cache_path(path: str, size: int) -> str:
        """Get the cache file path for a thumbnail."""
        # Create a unique hash based on path and modification time
        try:
            mtime = os.path.getmtime(path)
        except OSError:
            mtime = 0
        cache_key = f"{path}:{size}:{mtime}"
        hash_name = hashlib.md5(cache_key.encode()).hexdigest()
        return os.path.join(THUMBNAIL_CACHE_DIR, f"{hash_name}.png")

    @staticmethod
    def _generate_image_thumbnail(path: str, size: int) -> str:
        """Generate thumbnail for an image file."""
        try:
            from PIL import Image

            # Open image and create thumbnail
            with Image.open(path) as img:
                # Convert to RGB if needed (handles RGBA, P mode, etc.)
                if img.mode in ('RGBA', 'LA', 'P'):
                    # Create white background
                    background = Image.new('RGB', img.size, (255, 255, 255))
                    if img.mode == 'P':
                        img = img.convert('RGBA')
                    if img.mode in ('RGBA', 'LA'):
                        background.paste(img, mask=img.split()[-1])
                        img = background
                elif img.mode != 'RGB':
                    img = img.convert('RGB')

                # Create thumbnail maintaining aspect ratio
                img.thumbnail((size, size), Image.Resampling.LANCZOS)

                # Save to buffer as PNG
                buffer = BytesIO()
                img.save(buffer, format="PNG", optimize=True)
                return base64.b64encode(buffer.getvalue()).decode("ascii")

        except Exception as e:
            logger.debug(f"Failed to generate image thumbnail for {path}: {e}")
            return ""

    @staticmethod
    def _generate_video_thumbnail(path: str, size: int) -> str:
        """Generate thumbnail for a video file using ffmpeg."""
        import subprocess
        import tempfile

        try:
            # Create temp file for the frame
            with tempfile.NamedTemporaryFile(suffix='.jpg', delete=False) as tmp:
                tmp_path = tmp.name

            try:
                # Use ffmpeg to extract a frame at 1 second or 10% into the video
                # First, try to get video duration
                probe_cmd = [
                    'ffprobe',
                    '-v', 'quiet',
                    '-show_entries', 'format=duration',
                    '-of', 'csv=p=0',
                    path
                ]

                try:
                    result = subprocess.run(probe_cmd, capture_output=True, text=True, timeout=5)
                    duration = float(result.stdout.strip()) if result.stdout.strip() else 0
                    # Seek to 10% of video or 1 second, whichever is smaller
                    seek_time = min(duration * 0.1, 1.0) if duration > 0 else 1.0
                except (subprocess.TimeoutExpired, ValueError):
                    seek_time = 1.0

                # Extract frame using ffmpeg
                ffmpeg_cmd = [
                    'ffmpeg',
                    '-y',  # Overwrite output
                    '-ss', str(seek_time),  # Seek position
                    '-i', path,
                    '-vframes', '1',  # Extract 1 frame
                    '-vf', f'scale={size}:{size}:force_original_aspect_ratio=decrease',
                    '-q:v', '2',  # Quality
                    tmp_path
                ]

                result = subprocess.run(
                    ffmpeg_cmd,
                    capture_output=True,
                    timeout=10,
                    creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0
                )

                if result.returncode == 0 and os.path.exists(tmp_path) and os.path.getsize(tmp_path) > 0:
                    # Read the generated image and convert to base64
                    from PIL import Image

                    with Image.open(tmp_path) as img:
                        # Ensure we have RGB
                        if img.mode != 'RGB':
                            img = img.convert('RGB')

                        # Resize to exact size if needed
                        img.thumbnail((size, size), Image.Resampling.LANCZOS)

                        buffer = BytesIO()
                        img.save(buffer, format="PNG", optimize=True)
                        return base64.b64encode(buffer.getvalue()).decode("ascii")

            finally:
                # Clean up temp file
                try:
                    os.unlink(tmp_path)
                except OSError:
                    pass

        except FileNotFoundError:
            logger.debug("ffmpeg not found, video thumbnails unavailable")
        except subprocess.TimeoutExpired:
            logger.debug(f"Timeout generating video thumbnail for {path}")
        except Exception as e:
            logger.debug(f"Failed to generate video thumbnail for {path}: {e}")

        return ""

    @staticmethod
    async def get_thumbnail(path: str, size: int = 96) -> str:
        """Get file thumbnail as base64-encoded PNG."""
        import asyncio

        def get_thumb():
            try:
                # Check file extension
                ext = os.path.splitext(path)[1].lower()

                # Ensure cache directory exists
                os.makedirs(THUMBNAIL_CACHE_DIR, exist_ok=True)

                # Check cache first
                cache_path = ShellService._get_cache_path(path, size)
                if os.path.exists(cache_path):
                    try:
                        with open(cache_path, 'rb') as f:
                            return base64.b64encode(f.read()).decode("ascii")
                    except OSError:
                        pass

                thumbnail_data = ""

                # Generate thumbnail based on file type
                if ext in IMAGE_EXTENSIONS:
                    thumbnail_data = ShellService._generate_image_thumbnail(path, size)
                elif ext in VIDEO_EXTENSIONS:
                    thumbnail_data = ShellService._generate_video_thumbnail(path, size)

                # Cache the result if successful
                if thumbnail_data:
                    try:
                        with open(cache_path, 'wb') as f:
                            f.write(base64.b64decode(thumbnail_data))
                    except OSError as e:
                        logger.debug(f"Failed to cache thumbnail: {e}")

                return thumbnail_data

            except Exception as e:
                logger.error(f"Error getting thumbnail for {path}: {e}")
                return ""

        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(_executor, get_thumb)

    @staticmethod
    async def get_icon(path: str, size: int = 16) -> str:
        """Get file icon as base64-encoded PNG."""
        import asyncio

        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            _executor, ShellService._get_icon_sync, path, size
        )

    @staticmethod
    def _get_icon_sync(path: str, size: int) -> str:
        """Get file icon synchronously."""
        try:
            # Use SHGetFileInfo to get icon
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

            if result and shfi.hIcon:
                try:
                    # Convert icon to PNG
                    from PIL import Image
                    import win32gui
                    import win32ui
                    import win32con

                    # Get icon info
                    icon_info = win32gui.GetIconInfo(shfi.hIcon)

                    # Create device contexts
                    hdc = win32gui.GetDC(0)
                    hdc_mem = win32ui.CreateDCFromHandle(hdc)
                    hdc_bitmap = hdc_mem.CreateCompatibleDC()

                    # Create bitmap
                    bmp = win32ui.CreateBitmap()
                    icon_size = 32 if size > 16 else 16
                    bmp.CreateCompatibleBitmap(hdc_mem, icon_size, icon_size)
                    hdc_bitmap.SelectObject(bmp)

                    # Draw icon
                    hdc_bitmap.FillSolidRect((0, 0, icon_size, icon_size), 0xFFFFFF)
                    win32gui.DrawIconEx(
                        hdc_bitmap.GetHandleOutput(),
                        0, 0,
                        shfi.hIcon,
                        icon_size, icon_size,
                        0, 0,
                        win32con.DI_NORMAL,
                    )

                    # Convert to PIL Image
                    bmp_info = bmp.GetInfo()
                    bmp_bits = bmp.GetBitmapBits(True)

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
                    # If win32gui not available, return empty
                    return ""
                finally:
                    # Clean up
                    ctypes.windll.user32.DestroyIcon(shfi.hIcon)

        except Exception as e:
            logger.error(f"Error getting icon for {path}: {e}")

        return ""

    @staticmethod
    async def get_context_menu(paths: list[str]) -> list[dict[str, Any]]:
        """Get context menu items for files."""
        # Basic context menu items - full implementation would use IContextMenu
        items = []

        if len(paths) == 1:
            path = paths[0]
            is_dir = os.path.isdir(path)

            items.extend([
                {"id": "open", "label": "Open", "default": True},
                {"id": "separator"},
            ])

            if is_dir:
                items.append({"id": "open_terminal", "label": "Open in Terminal"})

            items.extend([
                {"id": "cut", "label": "Cut", "shortcut": "Ctrl+X"},
                {"id": "copy", "label": "Copy", "shortcut": "Ctrl+C"},
                {"id": "separator"},
                {"id": "delete", "label": "Delete", "shortcut": "Del"},
                {"id": "rename", "label": "Rename", "shortcut": "F2"},
                {"id": "separator"},
                {"id": "properties", "label": "Properties", "shortcut": "Alt+Enter"},
            ])

        else:
            items.extend([
                {"id": "cut", "label": "Cut", "shortcut": "Ctrl+X"},
                {"id": "copy", "label": "Copy", "shortcut": "Ctrl+C"},
                {"id": "separator"},
                {"id": "delete", "label": "Delete", "shortcut": "Del"},
            ])

        return items

    @staticmethod
    async def execute(path: str, verb: str = "open", args: str | None = None, directory: str | None = None) -> dict[str, Any]:
        """Execute a shell verb on a file."""
        try:
            import asyncio

            def do_execute():
                result = ctypes.windll.shell32.ShellExecuteW(
                    None,       # hwnd
                    verb,       # verb
                    path,       # file
                    args,       # params
                    directory,  # directory
                    1,          # SW_SHOWNORMAL
                )

                if result <= 32:
                    raise OSError(f"ShellExecute failed with code {result}")

                return {"success": True, "path": path, "verb": verb}

            loop = asyncio.get_event_loop()
            return await loop.run_in_executor(_executor, do_execute)

        except Exception as e:
            logger.error(f"Error executing {verb} on {path}: {e}")
            return {"success": False, "error": str(e)}

    @staticmethod
    async def show_properties(path: str) -> dict[str, Any]:
        """Show properties dialog for a file."""
        import asyncio

        def do_show_properties():
            try:
                # Use SHObjectProperties via ctypes
                # SHOP_FILEPATH = 0x2
                SHOP_FILEPATH = 0x2

                # Load shell32 and call SHObjectProperties
                shell32 = ctypes.windll.shell32

                # SHObjectProperties(HWND hwnd, DWORD shopObjectType, LPCWSTR pszObjectName, LPCWSTR pszPropertyPage)
                result = shell32.SHObjectProperties(
                    None,           # hwnd
                    SHOP_FILEPATH,  # shopObjectType - file path
                    path,           # pszObjectName
                    None            # pszPropertyPage - default page
                )

                if result:
                    return {"success": True, "path": path}
                else:
                    raise OSError("SHObjectProperties failed")

            except Exception as e:
                logger.error(f"Error showing properties for {path}: {e}")
                return {"success": False, "error": str(e)}

        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(_executor, do_show_properties)

    @staticmethod
    async def open_file(path: str) -> dict[str, Any]:
        """Open file with default application."""
        return await ShellService.execute(path, "open")

    @staticmethod
    async def create_shortcut(target_path: str, shortcut_path: str) -> dict[str, Any]:
        """Create a Windows shortcut (.lnk) file."""
        import asyncio

        def do_create():
            try:
                import win32com.client
                import pythoncom

                pythoncom.CoInitialize()
                try:
                    shell = win32com.client.Dispatch("WScript.Shell")
                    shortcut = shell.CreateShortCut(shortcut_path)
                    shortcut.Targetpath = target_path
                    shortcut.WorkingDirectory = os.path.dirname(target_path)
                    shortcut.save()
                    return {"success": True, "path": shortcut_path}
                finally:
                    pythoncom.CoUninitialize()
            except ImportError:
                logger.warning("win32com not available for creating shortcuts")
                return {"success": False, "error": "win32com not available"}
            except Exception as e:
                logger.error(f"Error creating shortcut: {e}")
                return {"success": False, "error": str(e)}

        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(_executor, do_create)

    @staticmethod
    async def get_recent_files(limit: int = 20) -> list[dict[str, Any]]:
        """
        Get recent files from Windows shell:recent folder.

        This reads .lnk shortcut files from %APPDATA%/Microsoft/Windows/Recent
        and resolves them to get the actual file paths.

        Args:
            limit: Maximum number of recent files to return

        Returns:
            List of recent file info dicts with path, name, and accessedAt
        """
        import asyncio

        def get_recent():
            recent_files = []

            if not os.path.exists(RECENT_FOLDER):
                logger.warning(f"Recent folder not found: {RECENT_FOLDER}")
                return recent_files

            try:
                import win32com.client
                import pythoncom

                pythoncom.CoInitialize()
                try:
                    shell = win32com.client.Dispatch("WScript.Shell")

                    # Get all .lnk files in Recent folder, sorted by modification time (newest first)
                    lnk_files = []
                    for entry in os.scandir(RECENT_FOLDER):
                        if entry.name.endswith('.lnk') and entry.is_file():
                            try:
                                stat = entry.stat()
                                lnk_files.append((entry.path, stat.st_mtime))
                            except OSError:
                                continue

                    # Sort by modification time, newest first
                    lnk_files.sort(key=lambda x: x[1], reverse=True)

                    for lnk_path, mtime in lnk_files[:limit * 2]:  # Get extra in case some fail
                        if len(recent_files) >= limit:
                            break

                        try:
                            shortcut = shell.CreateShortCut(lnk_path)
                            target_path = shortcut.TargetPath

                            # Skip if target doesn't exist or is a directory
                            if not target_path or not os.path.exists(target_path):
                                continue

                            # Skip directories - we only want files
                            if os.path.isdir(target_path):
                                continue

                            # Get file name from target
                            file_name = os.path.basename(target_path)

                            # Convert mtime to milliseconds for JS
                            accessed_at = int(mtime * 1000)

                            recent_files.append({
                                "path": target_path,
                                "name": file_name,
                                "accessedAt": accessed_at,
                            })
                        except Exception as e:
                            logger.debug(f"Failed to resolve shortcut {lnk_path}: {e}")
                            continue

                finally:
                    pythoncom.CoUninitialize()

            except ImportError:
                logger.warning("win32com not available, falling back to basic implementation")
                # Fallback without shortcut resolution - just list the lnk files
                try:
                    lnk_files = []
                    for entry in os.scandir(RECENT_FOLDER):
                        if entry.name.endswith('.lnk') and entry.is_file():
                            try:
                                stat = entry.stat()
                                lnk_files.append((entry, stat.st_mtime))
                            except OSError:
                                continue

                    lnk_files.sort(key=lambda x: x[1], reverse=True)

                    for entry, mtime in lnk_files[:limit]:
                        # Remove .lnk extension to get original name
                        name = entry.name[:-4] if entry.name.endswith('.lnk') else entry.name
                        recent_files.append({
                            "path": entry.path,  # Path to .lnk file
                            "name": name,
                            "accessedAt": int(mtime * 1000),
                        })
                except Exception as e:
                    logger.error(f"Error reading recent folder: {e}")

            except Exception as e:
                logger.error(f"Error getting recent files: {e}")

            return recent_files

        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(_executor, get_recent)

    @staticmethod
    async def get_known_folder_paths() -> dict[str, str]:
        """
        Get the actual paths for Windows known folders (libraries).

        These may differ from the default locations if the user has
        moved their Documents, Pictures, etc. to different locations.

        Returns:
            Dictionary mapping folder names to their actual paths
        """
        import asyncio

        def get_paths():
            paths = {}

            try:
                # GUID structure for SHGetKnownFolderPath
                class GUID(ctypes.Structure):
                    _fields_ = [
                        ("Data1", ctypes.c_ulong),
                        ("Data2", ctypes.c_ushort),
                        ("Data3", ctypes.c_ushort),
                        ("Data4", ctypes.c_ubyte * 8),
                    ]

                # Get SHGetKnownFolderPath function
                shell32 = ctypes.windll.shell32
                ole32 = ctypes.windll.ole32

                for name, guid_str in KNOWN_FOLDER_GUIDS.items():
                    try:
                        # Parse GUID string to struct
                        guid_uuid = uuid.UUID(guid_str)
                        guid = GUID()
                        guid.Data1 = guid_uuid.time_low
                        guid.Data2 = guid_uuid.time_mid
                        guid.Data3 = guid_uuid.time_hi_version
                        for i, b in enumerate(guid_uuid.node.to_bytes(6, 'big')):
                            guid.Data4[i + 2] = b
                        guid.Data4[0] = (guid_uuid.clock_seq_hi_variant)
                        guid.Data4[1] = (guid_uuid.clock_seq_low)

                        # Call SHGetKnownFolderPath
                        path_ptr = ctypes.c_wchar_p()
                        result = shell32.SHGetKnownFolderPath(
                            ctypes.byref(guid),
                            0,  # dwFlags
                            None,  # hToken (current user)
                            ctypes.byref(path_ptr)
                        )

                        if result == 0 and path_ptr.value:  # S_OK
                            paths[name] = path_ptr.value
                            # Free the memory allocated by SHGetKnownFolderPath
                            ole32.CoTaskMemFree(path_ptr)
                        else:
                            logger.debug(f"Failed to get path for {name}: HRESULT {result}")

                    except Exception as e:
                        logger.debug(f"Error getting path for {name}: {e}")

            except Exception as e:
                logger.error(f"Error getting known folder paths: {e}")

            return paths

        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(_executor, get_paths)
