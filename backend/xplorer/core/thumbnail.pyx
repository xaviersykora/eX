# cython: language_level=3
# cython: boundscheck=False
# cython: wraparound=False
"""
Thumbnail and icon extraction using Windows Shell.
"""

cimport cython
from libc.stdlib cimport malloc, free
from libc.string cimport memset
from libc.stddef cimport wchar_t
from cpython.mem cimport PyMem_Malloc, PyMem_Free

cdef extern from "windows.h":
    ctypedef unsigned long DWORD
    ctypedef unsigned short WORD
    ctypedef int BOOL
    ctypedef void* HANDLE
    ctypedef void* HICON

    ctypedef struct SHFILEINFOW:
        HICON hIcon
        int iIcon
        DWORD dwAttributes
        wchar_t szDisplayName[260]
        wchar_t szTypeName[80]

    DWORD SHGetFileInfoW(
        wchar_t* pszPath,
        DWORD dwFileAttributes,
        SHFILEINFOW* psfi,
        DWORD cbFileInfo,
        DWORD uFlags
    ) nogil

    BOOL DestroyIcon(HICON hIcon) nogil


# Constants
cdef DWORD SHGFI_ICON = 0x100
cdef DWORD SHGFI_SMALLICON = 0x1
cdef DWORD SHGFI_LARGEICON = 0x0
cdef DWORD SHGFI_TYPENAME = 0x400
cdef DWORD SHGFI_DISPLAYNAME = 0x200


cdef class IconExtractor:
    """Extract icons from files using Windows Shell."""

    @staticmethod
    def get_icon_handle(str path, bint large=False):
        """
        Get icon handle for a file.

        Args:
            path: File path
            large: If True, get large icon (32x32), else small (16x16)

        Returns:
            Icon handle as integer, or 0 if failed
        """
        cdef:
            SHFILEINFOW shfi
            DWORD flags
            DWORD result
            Py_ssize_t path_len
            wchar_t* path_wstr

        memset(&shfi, 0, sizeof(SHFILEINFOW))

        flags = SHGFI_ICON | (SHGFI_LARGEICON if large else SHGFI_SMALLICON)

        # Convert path to wide string
        path_len = len(path)
        path_wstr = <wchar_t*>PyMem_Malloc((path_len + 1) * sizeof(wchar_t))
        if path_wstr == NULL:
            return 0

        try:
            for i in range(path_len):
                path_wstr[i] = <wchar_t>ord(path[i])
            path_wstr[path_len] = 0

            with nogil:
                result = SHGetFileInfoW(
                    path_wstr,
                    0,
                    &shfi,
                    sizeof(SHFILEINFOW),
                    flags
                )

            if result == 0:
                return 0

            return <long long>shfi.hIcon
        finally:
            PyMem_Free(path_wstr)

    @staticmethod
    def destroy_icon(long long icon_handle):
        """Destroy an icon handle."""
        if icon_handle != 0:
            with nogil:
                DestroyIcon(<HICON>icon_handle)

    @staticmethod
    def get_file_type(str path):
        """
        Get the file type description.

        Args:
            path: File path

        Returns:
            File type string
        """
        cdef:
            SHFILEINFOW shfi
            DWORD result
            Py_ssize_t path_len
            wchar_t* path_wstr
            str type_name

        memset(&shfi, 0, sizeof(SHFILEINFOW))

        # Convert path to wide string
        path_len = len(path)
        path_wstr = <wchar_t*>PyMem_Malloc((path_len + 1) * sizeof(wchar_t))
        if path_wstr == NULL:
            return "File"

        try:
            for i in range(path_len):
                path_wstr[i] = <wchar_t>ord(path[i])
            path_wstr[path_len] = 0

            with nogil:
                result = SHGetFileInfoW(
                    path_wstr,
                    0,
                    &shfi,
                    sizeof(SHFILEINFOW),
                    SHGFI_TYPENAME
                )

            if result == 0:
                return "File"

            # Convert type name to Python string
            type_name = ""
            for i in range(80):
                if shfi.szTypeName[i] == 0:
                    break
                type_name += chr(shfi.szTypeName[i])

            return type_name
        finally:
            PyMem_Free(path_wstr)

    @staticmethod
    def get_display_name(str path):
        """
        Get the display name for a file.

        Args:
            path: File path

        Returns:
            Display name string
        """
        cdef:
            SHFILEINFOW shfi
            DWORD result
            Py_ssize_t path_len
            wchar_t* path_wstr
            str display_name

        memset(&shfi, 0, sizeof(SHFILEINFOW))

        # Convert path to wide string
        path_len = len(path)
        path_wstr = <wchar_t*>PyMem_Malloc((path_len + 1) * sizeof(wchar_t))
        if path_wstr == NULL:
            return path.split("\\")[-1]

        try:
            for i in range(path_len):
                path_wstr[i] = <wchar_t>ord(path[i])
            path_wstr[path_len] = 0

            with nogil:
                result = SHGetFileInfoW(
                    path_wstr,
                    0,
                    &shfi,
                    sizeof(SHFILEINFOW),
                    SHGFI_DISPLAYNAME
                )

            if result == 0:
                return path.split("\\")[-1]

            # Convert display name to Python string
            display_name = ""
            for i in range(260):
                if shfi.szDisplayName[i] == 0:
                    break
                display_name += chr(shfi.szDisplayName[i])

            return display_name
        finally:
            PyMem_Free(path_wstr)


def get_icon(str path, int size=16):
    """
    Get icon for a file.

    Args:
        path: File path
        size: Icon size (16 for small, 32 for large)

    Returns:
        Icon handle as integer
    """
    return IconExtractor.get_icon_handle(path, size > 16)


def get_file_type(str path):
    """
    Get file type description.

    Args:
        path: File path

    Returns:
        File type string
    """
    return IconExtractor.get_file_type(path)


def get_display_name(str path):
    """
    Get display name for a file.

    Args:
        path: File path

    Returns:
        Display name string
    """
    return IconExtractor.get_display_name(path)
