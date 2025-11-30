# cython: language_level=3
# cython: boundscheck=False
# cython: wraparound=False
"""
Windows Shell operations.
"""

cimport cython
from libc.stdlib cimport malloc, free
from libc.stddef cimport wchar_t
from cpython.mem cimport PyMem_Malloc, PyMem_Free

cdef extern from "windows.h":
    ctypedef unsigned long DWORD
    ctypedef int BOOL
    ctypedef void* HANDLE
    ctypedef void* HWND
    ctypedef void* HINSTANCE

    ctypedef struct POINT:
        long x
        long y

    ctypedef struct SHFILEOPSTRUCTW:
        HWND hwnd
        DWORD wFunc
        wchar_t* pFrom
        wchar_t* pTo
        DWORD fFlags
        BOOL fAnyOperationsAborted
        void* hNameMappings
        wchar_t* lpszProgressTitle

    HINSTANCE ShellExecuteW(
        HWND hwnd,
        wchar_t* lpOperation,
        wchar_t* lpFile,
        wchar_t* lpParameters,
        wchar_t* lpDirectory,
        int nShowCmd
    ) nogil

    int SHFileOperationW(SHFILEOPSTRUCTW* lpFileOp) nogil

    DWORD GetLastError() nogil


# Constants
cdef int SW_SHOWNORMAL = 1
cdef int SW_HIDE = 0

cdef DWORD FO_MOVE = 1
cdef DWORD FO_COPY = 2
cdef DWORD FO_DELETE = 3
cdef DWORD FO_RENAME = 4

cdef DWORD FOF_MULTIDESTFILES = 0x1
cdef DWORD FOF_SILENT = 0x4
cdef DWORD FOF_RENAMEONCOLLISION = 0x8
cdef DWORD FOF_NOCONFIRMATION = 0x10
cdef DWORD FOF_ALLOWUNDO = 0x40
cdef DWORD FOF_NOERRORUI = 0x400
cdef DWORD FOF_NOCONFIRMMKDIR = 0x200


cdef wchar_t* str_to_wchar(str s):
    """Convert Python string to wide char. Caller must free with PyMem_Free."""
    cdef Py_ssize_t length = len(s)
    cdef wchar_t* result = <wchar_t*>PyMem_Malloc((length + 1) * sizeof(wchar_t))
    if result == NULL:
        return NULL
    for i in range(length):
        result[i] = <wchar_t>ord(s[i])
    result[length] = 0
    return result


def shell_execute(str path, str verb="open", str parameters=None, str directory=None, bint show=True):
    """
    Execute a shell command on a file.

    Args:
        path: File path
        verb: Shell verb (open, edit, print, properties, etc.)
        parameters: Command line parameters
        directory: Working directory
        show: Show window

    Returns:
        True if successful (return value > 32)
    """
    cdef:
        HINSTANCE result
        int show_cmd = SW_SHOWNORMAL if show else SW_HIDE
        wchar_t* path_w = NULL
        wchar_t* verb_w = NULL
        wchar_t* params_w = NULL
        wchar_t* dir_w = NULL

    # Convert strings to wide chars
    path_w = str_to_wchar(path)
    if path_w == NULL:
        return False

    if verb:
        verb_w = str_to_wchar(verb)

    if parameters:
        params_w = str_to_wchar(parameters)

    if directory:
        dir_w = str_to_wchar(directory)

    try:
        with nogil:
            result = ShellExecuteW(
                NULL,
                verb_w,
                path_w,
                params_w,
                dir_w,
                show_cmd
            )

        # ShellExecute returns > 32 on success
        return <long long>result > 32
    finally:
        PyMem_Free(path_w)
        if verb_w != NULL:
            PyMem_Free(verb_w)
        if params_w != NULL:
            PyMem_Free(params_w)
        if dir_w != NULL:
            PyMem_Free(dir_w)


def shell_open(str path):
    """Open a file with its default application."""
    return shell_execute(path, "open")


def shell_edit(str path):
    """Open a file for editing."""
    return shell_execute(path, "edit")


def shell_print(str path):
    """Print a file."""
    return shell_execute(path, "print")


def shell_properties(str path):
    """Show properties dialog for a file."""
    return shell_execute(path, "properties")


def shell_explore(str path):
    """Open folder in Explorer."""
    return shell_execute(path, "explore")


def delete_to_recycle_bin(list paths):
    """
    Delete files to recycle bin.

    Args:
        paths: List of file paths to delete

    Returns:
        0 on success, error code on failure
    """
    cdef:
        SHFILEOPSTRUCTW fileop
        str path_list
        wchar_t* path_list_w = NULL
        int result
        Py_ssize_t total_len

    if not paths:
        return 0

    # Build double-null terminated path list
    path_list = "\0".join(paths) + "\0\0"
    total_len = len(path_list)

    path_list_w = <wchar_t*>PyMem_Malloc((total_len + 1) * sizeof(wchar_t))
    if path_list_w == NULL:
        return -1

    try:
        for i in range(total_len):
            path_list_w[i] = <wchar_t>ord(path_list[i])
        path_list_w[total_len] = 0

        fileop.hwnd = NULL
        fileop.wFunc = FO_DELETE
        fileop.pFrom = path_list_w
        fileop.pTo = NULL
        fileop.fFlags = FOF_ALLOWUNDO | FOF_NOCONFIRMATION | FOF_SILENT | FOF_NOERRORUI
        fileop.fAnyOperationsAborted = False
        fileop.hNameMappings = NULL
        fileop.lpszProgressTitle = NULL

        with nogil:
            result = SHFileOperationW(&fileop)

        return result
    finally:
        PyMem_Free(path_list_w)


def shell_copy(list sources, str destination):
    """
    Copy files using Shell.

    Args:
        sources: List of source paths
        destination: Destination directory

    Returns:
        0 on success, error code on failure
    """
    cdef:
        SHFILEOPSTRUCTW fileop
        str source_list
        wchar_t* source_list_w = NULL
        wchar_t* dest_w = NULL
        int result
        Py_ssize_t source_len
        Py_ssize_t dest_len

    if not sources:
        return 0

    # Build double-null terminated source list
    source_list = "\0".join(sources) + "\0\0"
    source_len = len(source_list)

    source_list_w = <wchar_t*>PyMem_Malloc((source_len + 1) * sizeof(wchar_t))
    if source_list_w == NULL:
        return -1

    dest_len = len(destination) + 2  # +2 for double null
    dest_w = <wchar_t*>PyMem_Malloc((dest_len + 1) * sizeof(wchar_t))
    if dest_w == NULL:
        PyMem_Free(source_list_w)
        return -1

    try:
        for i in range(source_len):
            source_list_w[i] = <wchar_t>ord(source_list[i])
        source_list_w[source_len] = 0

        for i in range(len(destination)):
            dest_w[i] = <wchar_t>ord(destination[i])
        dest_w[len(destination)] = 0
        dest_w[len(destination) + 1] = 0  # Double null

        fileop.hwnd = NULL
        fileop.wFunc = FO_COPY
        fileop.pFrom = source_list_w
        fileop.pTo = dest_w
        fileop.fFlags = FOF_NOCONFIRMATION | FOF_NOERRORUI | FOF_RENAMEONCOLLISION | FOF_NOCONFIRMMKDIR
        fileop.fAnyOperationsAborted = False
        fileop.hNameMappings = NULL
        fileop.lpszProgressTitle = NULL

        with nogil:
            result = SHFileOperationW(&fileop)

        return result
    finally:
        PyMem_Free(source_list_w)
        PyMem_Free(dest_w)


def shell_move(list sources, str destination):
    """
    Move files using Shell.

    Args:
        sources: List of source paths
        destination: Destination directory

    Returns:
        0 on success, error code on failure
    """
    cdef:
        SHFILEOPSTRUCTW fileop
        str source_list
        wchar_t* source_list_w = NULL
        wchar_t* dest_w = NULL
        int result
        Py_ssize_t source_len
        Py_ssize_t dest_len

    if not sources:
        return 0

    # Build double-null terminated source list
    source_list = "\0".join(sources) + "\0\0"
    source_len = len(source_list)

    source_list_w = <wchar_t*>PyMem_Malloc((source_len + 1) * sizeof(wchar_t))
    if source_list_w == NULL:
        return -1

    dest_len = len(destination) + 2  # +2 for double null
    dest_w = <wchar_t*>PyMem_Malloc((dest_len + 1) * sizeof(wchar_t))
    if dest_w == NULL:
        PyMem_Free(source_list_w)
        return -1

    try:
        for i in range(source_len):
            source_list_w[i] = <wchar_t>ord(source_list[i])
        source_list_w[source_len] = 0

        for i in range(len(destination)):
            dest_w[i] = <wchar_t>ord(destination[i])
        dest_w[len(destination)] = 0
        dest_w[len(destination) + 1] = 0  # Double null

        fileop.hwnd = NULL
        fileop.wFunc = FO_MOVE
        fileop.pFrom = source_list_w
        fileop.pTo = dest_w
        fileop.fFlags = FOF_NOCONFIRMATION | FOF_NOERRORUI | FOF_RENAMEONCOLLISION | FOF_NOCONFIRMMKDIR
        fileop.fAnyOperationsAborted = False
        fileop.hNameMappings = NULL
        fileop.lpszProgressTitle = NULL

        with nogil:
            result = SHFileOperationW(&fileop)

        return result
    finally:
        PyMem_Free(source_list_w)
        PyMem_Free(dest_w)
