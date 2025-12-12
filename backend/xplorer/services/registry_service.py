"""
Windows Registry service for shell integration.
"""

import winreg
import os
import sys
import logging
from typing import Any

logger = logging.getLogger(__name__)


def get_exe_path() -> str:
    """Get the path to the X-Plorer executable."""
    if getattr(sys, "frozen", False):
        # Running as compiled executable
        return sys.executable
    else:
        # Running from source
        return os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", "X-Plorer.exe"))


class RegistryService:
    """Service for Windows Registry operations."""

    APP_NAME = "eX"
    PROG_ID = "eX.Folder"

    @classmethod
    def register_shell_integration(cls) -> dict[str, Any]:
        """
        Register eX as a folder handler in Windows.
        Adds context menu entries and file associations.

        Returns:
            Result dictionary with success status
        """
        try:
            exe_path = get_exe_path()

            # Register the ProgID
            cls._register_prog_id(exe_path)

            # Add "Open with X-Plorer" to folder context menu
            cls._register_folder_context_menu(exe_path)

            # Add "Open with X-Plorer" to directory background context menu
            cls._register_directory_background_menu(exe_path)

            # Add "Open with X-Plorer" to drive context menu
            cls._register_drive_context_menu(exe_path)

            logger.info("Shell integration registered successfully")
            return {"success": True}

        except Exception as e:
            logger.error(f"Failed to register shell integration: {e}")
            return {"success": False, "error": str(e)}

    @classmethod
    def unregister_shell_integration(cls) -> dict[str, Any]:
        """
        Remove X-Plorer shell integration from Windows.

        Returns:
            Result dictionary with success status
        """
        try:
            # Remove ProgID
            cls._delete_key_recursive(winreg.HKEY_CLASSES_ROOT, cls.PROG_ID)

            # Remove folder context menu
            cls._delete_key_recursive(
                winreg.HKEY_CLASSES_ROOT,
                f"Folder\\shell\\{cls.APP_NAME}"
            )

            # Remove directory background menu
            cls._delete_key_recursive(
                winreg.HKEY_CLASSES_ROOT,
                f"Directory\\Background\\shell\\{cls.APP_NAME}"
            )

            # Remove drive context menu
            cls._delete_key_recursive(
                winreg.HKEY_CLASSES_ROOT,
                f"Drive\\shell\\{cls.APP_NAME}"
            )

            logger.info("Shell integration unregistered successfully")
            return {"success": True}

        except Exception as e:
            logger.error(f"Failed to unregister shell integration: {e}")
            return {"success": False, "error": str(e)}

    @classmethod
    def is_default_file_manager(cls) -> bool:
        """Check if X-Plorer is set as the default file manager."""
        try:
            key = winreg.OpenKey(
                winreg.HKEY_CURRENT_USER,
                r"Software\Classes\Folder\shell\open\command"
            )
            value, _ = winreg.QueryValueEx(key, "")
            winreg.CloseKey(key)

            return cls.APP_NAME.lower() in value.lower()

        except Exception:
            return False

    @classmethod
    def set_as_default_file_manager(cls) -> dict[str, Any]:
        """
        Set X-Plorer as the default file manager.
        WARNING: This modifies system behavior.

        Returns:
            Result dictionary with success status
        """
        try:
            exe_path = get_exe_path()

            # Back up original values first
            cls._backup_default_handler()

            # Set as default folder handler
            key = winreg.CreateKey(
                winreg.HKEY_CURRENT_USER,
                r"Software\Classes\Folder\shell\open\command"
            )
            winreg.SetValueEx(key, "", 0, winreg.REG_SZ, f'"{exe_path}" "%1"')
            winreg.CloseKey(key)

            logger.info("Set as default file manager")
            return {"success": True}

        except Exception as e:
            logger.error(f"Failed to set as default: {e}")
            return {"success": False, "error": str(e)}

    @classmethod
    def restore_default_file_manager(cls) -> dict[str, Any]:
        """
        Restore the original Windows Explorer as default.

        Returns:
            Result dictionary with success status
        """
        try:
            # Delete our override
            cls._delete_key_recursive(
                winreg.HKEY_CURRENT_USER,
                r"Software\Classes\Folder\shell\open\command"
            )

            logger.info("Restored default file manager")
            return {"success": True}

        except Exception as e:
            logger.error(f"Failed to restore default: {e}")
            return {"success": False, "error": str(e)}

    @classmethod
    def _register_prog_id(cls, exe_path: str):
        """Register the application ProgID."""
        key = winreg.CreateKey(winreg.HKEY_CLASSES_ROOT, cls.PROG_ID)
        winreg.SetValueEx(key, "", 0, winreg.REG_SZ, cls.APP_NAME)
        winreg.CloseKey(key)

        # Default icon
        key = winreg.CreateKey(winreg.HKEY_CLASSES_ROOT, f"{cls.PROG_ID}\\DefaultIcon")
        winreg.SetValueEx(key, "", 0, winreg.REG_SZ, f'"{exe_path}",0')
        winreg.CloseKey(key)

        # Shell open command
        key = winreg.CreateKey(winreg.HKEY_CLASSES_ROOT, f"{cls.PROG_ID}\\shell\\open\\command")
        winreg.SetValueEx(key, "", 0, winreg.REG_SZ, f'"{exe_path}" "%1"')
        winreg.CloseKey(key)

    @classmethod
    def _register_folder_context_menu(cls, exe_path: str):
        """Add context menu entry for folders."""
        base_key = f"Folder\\shell\\{cls.APP_NAME}"

        key = winreg.CreateKey(winreg.HKEY_CLASSES_ROOT, base_key)
        winreg.SetValueEx(key, "", 0, winreg.REG_SZ, f"Open with {cls.APP_NAME}")
        winreg.SetValueEx(key, "Icon", 0, winreg.REG_SZ, exe_path)
        winreg.CloseKey(key)

        key = winreg.CreateKey(winreg.HKEY_CLASSES_ROOT, f"{base_key}\\command")
        winreg.SetValueEx(key, "", 0, winreg.REG_SZ, f'"{exe_path}" "%1"')
        winreg.CloseKey(key)

    @classmethod
    def _register_directory_background_menu(cls, exe_path: str):
        """Add context menu entry for directory backgrounds."""
        base_key = f"Directory\\Background\\shell\\{cls.APP_NAME}"

        key = winreg.CreateKey(winreg.HKEY_CLASSES_ROOT, base_key)
        winreg.SetValueEx(key, "", 0, winreg.REG_SZ, f"Open with {cls.APP_NAME}")
        winreg.SetValueEx(key, "Icon", 0, winreg.REG_SZ, exe_path)
        winreg.CloseKey(key)

        key = winreg.CreateKey(winreg.HKEY_CLASSES_ROOT, f"{base_key}\\command")
        winreg.SetValueEx(key, "", 0, winreg.REG_SZ, f'"{exe_path}" "%V"')
        winreg.CloseKey(key)

    @classmethod
    def _register_drive_context_menu(cls, exe_path: str):
        """Add context menu entry for drives."""
        base_key = f"Drive\\shell\\{cls.APP_NAME}"

        key = winreg.CreateKey(winreg.HKEY_CLASSES_ROOT, base_key)
        winreg.SetValueEx(key, "", 0, winreg.REG_SZ, f"Open with {cls.APP_NAME}")
        winreg.SetValueEx(key, "Icon", 0, winreg.REG_SZ, exe_path)
        winreg.CloseKey(key)

        key = winreg.CreateKey(winreg.HKEY_CLASSES_ROOT, f"{base_key}\\command")
        winreg.SetValueEx(key, "", 0, winreg.REG_SZ, f'"{exe_path}" "%1"')
        winreg.CloseKey(key)

    @classmethod
    def _backup_default_handler(cls):
        """Backup the default folder handler."""
        try:
            key = winreg.OpenKey(
                winreg.HKEY_LOCAL_MACHINE,
                r"Software\Classes\Folder\shell\open\command"
            )
            value, _ = winreg.QueryValueEx(key, "")
            winreg.CloseKey(key)

            # Store backup
            backup_key = winreg.CreateKey(
                winreg.HKEY_CURRENT_USER,
                f"Software\\{cls.APP_NAME}\\Backup"
            )
            winreg.SetValueEx(backup_key, "DefaultFolderHandler", 0, winreg.REG_SZ, value)
            winreg.CloseKey(backup_key)

        except Exception as e:
            logger.warning(f"Could not backup default handler: {e}")

    @classmethod
    def _delete_key_recursive(cls, root, path: str):
        """Recursively delete a registry key."""
        try:
            key = winreg.OpenKey(root, path, 0, winreg.KEY_ALL_ACCESS)

            # Delete subkeys first
            while True:
                try:
                    subkey_name = winreg.EnumKey(key, 0)
                    cls._delete_key_recursive(key, subkey_name)
                except OSError:
                    break

            winreg.CloseKey(key)
            winreg.DeleteKey(root, path)

        except FileNotFoundError:
            pass
        except Exception as e:
            logger.error(f"Error deleting key {path}: {e}")
