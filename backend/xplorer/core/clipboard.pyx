# cython: language_level=3
# cython: boundscheck=False
# cython: wraparound=False
"""
Windows clipboard operations for file copy/paste.
"""

cimport cython
from libc.stdlib cimport malloc, free
from libc.string cimport memcpy, memset
from libc.stddef cimport wchar_t
from cpython.mem cimport PyMem_Malloc, PyMem_Free

cdef extern from "windows.h":
    ctypedef unsigned long DWORD
    ctypedef int BOOL
    ctypedef void* HANDLE
    ctypedef void* HWND
    ctypedef void* HGLOBAL

    ctypedef struct POINT:
        long x
        long y

    BOOL OpenClipboard(HWND hWndNewOwner) nogil
    BOOL CloseClipboard() nogil
    BOOL EmptyClipboard() nogil
    HANDLE GetClipboardData(DWORD uFormat) nogil
    HANDLE SetClipboardData(DWORD uFormat, HANDLE hMem) nogil
    DWORD RegisterClipboardFormatW(wchar_t* lpszFormat) nogil

    HGLOBAL GlobalAlloc(DWORD uFlags, size_t dwBytes) nogil
    void* GlobalLock(HGLOBAL hMem) nogil
    BOOL GlobalUnlock(HGLOBAL hMem) nogil
    HGLOBAL GlobalFree(HGLOBAL hMem) nogil
    size_t GlobalSize(HGLOBAL hMem) nogil

    DWORD GetLastError() nogil


# DROPFILES is in shlobj.h
cdef extern from "shlobj.h":
    ctypedef struct DROPFILES:
        DWORD pFiles
        POINT pt
        BOOL fNC
        BOOL fWide


# Shell32 functions
cdef extern from "shellapi.h":
    DWORD DragQueryFileW(HANDLE hDrop, DWORD iFile, wchar_t* lpszFile, DWORD cch) nogil


# Constants
cdef DWORD CF_HDROP = 15
cdef DWORD GMEM_MOVEABLE = 0x0002
cdef DWORD GMEM_ZEROINIT = 0x0040

cdef DWORD DROPEFFECT_COPY = 1
cdef DWORD DROPEFFECT_MOVE = 2


cdef wchar_t* get_dropeffect_format_name():
    """Return the Preferred DropEffect format name as wchar_t*."""
    cdef wchar_t[32] name
    # "Preferred DropEffect"
    name[0] = ord('P')
    name[1] = ord('r')
    name[2] = ord('e')
    name[3] = ord('f')
    name[4] = ord('e')
    name[5] = ord('r')
    name[6] = ord('r')
    name[7] = ord('e')
    name[8] = ord('d')
    name[9] = ord(' ')
    name[10] = ord('D')
    name[11] = ord('r')
    name[12] = ord('o')
    name[13] = ord('p')
    name[14] = ord('E')
    name[15] = ord('f')
    name[16] = ord('f')
    name[17] = ord('e')
    name[18] = ord('c')
    name[19] = ord('t')
    name[20] = 0
    return name


cdef str wchar_array_to_str(wchar_t* arr, Py_ssize_t max_len):
    """Convert wchar_t array to Python string."""
    cdef str result = ""
    cdef Py_ssize_t i
    for i in range(max_len):
        if arr[i] == 0:
            break
        result += chr(arr[i])
    return result


def copy_to_clipboard(list paths, bint cut=False):
    """
    Copy file paths to clipboard.

    Args:
        paths: List of file paths
        cut: If True, mark as cut operation

    Returns:
        True if successful
    """
    cdef:
        str file_list
        bytes file_list_bytes
        size_t buffer_size
        HGLOBAL h_global
        void* p_global
        DROPFILES* drop_files
        DWORD cf_preferred
        HGLOBAL h_effect
        DWORD* p_effect
        BOOL open_result
        wchar_t[32] format_name

    if not paths:
        return False

    # Build null-separated file list (double null terminated)
    file_list = "\0".join(paths) + "\0\0"
    file_list_bytes = file_list.encode("utf-16-le")

    # Calculate buffer size
    buffer_size = sizeof(DROPFILES) + len(file_list_bytes)

    # Open clipboard (with GIL since we may return early)
    with nogil:
        open_result = OpenClipboard(NULL)

    if not open_result:
        return False

    try:
        with nogil:
            # Empty clipboard
            EmptyClipboard()

            # Allocate memory
            h_global = GlobalAlloc(GMEM_MOVEABLE | GMEM_ZEROINIT, buffer_size)

        if h_global == NULL:
            return False

        with nogil:
            p_global = GlobalLock(h_global)

        if p_global == NULL:
            with nogil:
                GlobalFree(h_global)
            return False

        # Fill DROPFILES structure
        drop_files = <DROPFILES*>p_global
        drop_files.pFiles = sizeof(DROPFILES)
        drop_files.pt.x = 0
        drop_files.pt.y = 0
        drop_files.fNC = False
        drop_files.fWide = True

        # Copy file list after structure
        memcpy(<char*>p_global + sizeof(DROPFILES), <char*>file_list_bytes, len(file_list_bytes))

        with nogil:
            GlobalUnlock(h_global)

            # Set clipboard data
            if SetClipboardData(CF_HDROP, h_global) == NULL:
                GlobalFree(h_global)
                h_global = NULL

        if h_global == NULL:
            return False

        # Set drop effect for cut
        if cut:
            # Build format name
            format_name[0] = ord('P')
            format_name[1] = ord('r')
            format_name[2] = ord('e')
            format_name[3] = ord('f')
            format_name[4] = ord('e')
            format_name[5] = ord('r')
            format_name[6] = ord('r')
            format_name[7] = ord('e')
            format_name[8] = ord('d')
            format_name[9] = ord(' ')
            format_name[10] = ord('D')
            format_name[11] = ord('r')
            format_name[12] = ord('o')
            format_name[13] = ord('p')
            format_name[14] = ord('E')
            format_name[15] = ord('f')
            format_name[16] = ord('f')
            format_name[17] = ord('e')
            format_name[18] = ord('c')
            format_name[19] = ord('t')
            format_name[20] = 0

            with nogil:
                cf_preferred = RegisterClipboardFormatW(format_name)

            if cf_preferred:
                with nogil:
                    h_effect = GlobalAlloc(GMEM_MOVEABLE, sizeof(DWORD))

                if h_effect != NULL:
                    with nogil:
                        p_effect = <DWORD*>GlobalLock(h_effect)

                    if p_effect != NULL:
                        p_effect[0] = DROPEFFECT_MOVE
                        with nogil:
                            GlobalUnlock(h_effect)
                            SetClipboardData(cf_preferred, h_effect)

        return True

    finally:
        with nogil:
            CloseClipboard()


def get_clipboard_files():
    """
    Get list of file paths from clipboard.

    Returns:
        List of file paths or empty list if no files
    """
    cdef:
        HANDLE h_drop
        DWORD count
        DWORD i
        wchar_t[260] buffer  # MAX_PATH
        DWORD length
        BOOL open_result
        list files = []
        str filename

    with nogil:
        open_result = OpenClipboard(NULL)

    if not open_result:
        return files

    try:
        with nogil:
            h_drop = GetClipboardData(CF_HDROP)

        if h_drop == NULL:
            return files

        with nogil:
            count = DragQueryFileW(h_drop, 0xFFFFFFFF, NULL, 0)

        for i in range(count):
            with nogil:
                length = DragQueryFileW(h_drop, i, buffer, 260)

            if length > 0:
                filename = wchar_array_to_str(buffer, length)
                files.append(filename)

        return files

    finally:
        with nogil:
            CloseClipboard()


def clear_clipboard():
    """Clear the clipboard."""
    cdef BOOL open_result

    with nogil:
        open_result = OpenClipboard(NULL)

    if not open_result:
        return False

    try:
        with nogil:
            EmptyClipboard()
        return True
    finally:
        with nogil:
            CloseClipboard()


def is_cut_operation():
    """
    Check if clipboard contains a cut operation.

    Returns:
        True if cut, False if copy or unknown
    """
    cdef:
        DWORD cf_preferred
        HANDLE h_data
        DWORD* p_data
        DWORD effect = 0
        BOOL open_result
        wchar_t[32] format_name

    with nogil:
        open_result = OpenClipboard(NULL)

    if not open_result:
        return False

    try:
        # Build format name
        format_name[0] = ord('P')
        format_name[1] = ord('r')
        format_name[2] = ord('e')
        format_name[3] = ord('f')
        format_name[4] = ord('e')
        format_name[5] = ord('r')
        format_name[6] = ord('r')
        format_name[7] = ord('e')
        format_name[8] = ord('d')
        format_name[9] = ord(' ')
        format_name[10] = ord('D')
        format_name[11] = ord('r')
        format_name[12] = ord('o')
        format_name[13] = ord('p')
        format_name[14] = ord('E')
        format_name[15] = ord('f')
        format_name[16] = ord('f')
        format_name[17] = ord('e')
        format_name[18] = ord('c')
        format_name[19] = ord('t')
        format_name[20] = 0

        with nogil:
            cf_preferred = RegisterClipboardFormatW(format_name)

        if cf_preferred == 0:
            return False

        with nogil:
            h_data = GetClipboardData(cf_preferred)

        if h_data == NULL:
            return False

        with nogil:
            p_data = <DWORD*>GlobalLock(h_data)

        if p_data != NULL:
            effect = p_data[0]
            with nogil:
                GlobalUnlock(h_data)

        return (effect & DROPEFFECT_MOVE) != 0

    finally:
        with nogil:
            CloseClipboard()
