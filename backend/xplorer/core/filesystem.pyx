# cython: language_level=3
# cython: boundscheck=False
# cython: wraparound=False
"""
High-performance file system operations using Windows API.
"""

cimport cython
from libc.stdlib cimport malloc, free
from libc.string cimport memcpy
from libc.stddef cimport wchar_t
from cpython.mem cimport PyMem_Malloc, PyMem_Free

cdef extern from "windows.h":
    ctypedef unsigned long DWORD
    ctypedef int BOOL
    ctypedef void* HANDLE
    ctypedef unsigned long long ULONGLONG

    ctypedef struct FILETIME:
        DWORD dwLowDateTime
        DWORD dwHighDateTime

    ctypedef struct WIN32_FIND_DATAW:
        DWORD dwFileAttributes
        FILETIME ftCreationTime
        FILETIME ftLastAccessTime
        FILETIME ftLastWriteTime
        DWORD nFileSizeHigh
        DWORD nFileSizeLow
        DWORD dwReserved0
        DWORD dwReserved1
        wchar_t cFileName[260]
        wchar_t cAlternateFileName[14]

    HANDLE FindFirstFileW(wchar_t* lpFileName, WIN32_FIND_DATAW* lpFindFileData) nogil
    BOOL FindNextFileW(HANDLE hFindFile, WIN32_FIND_DATAW* lpFindFileData) nogil
    BOOL FindClose(HANDLE hFindFile) nogil
    DWORD GetFileAttributesW(wchar_t* lpFileName) nogil
    DWORD GetLogicalDrives() nogil
    DWORD GetDriveTypeW(wchar_t* lpRootPathName) nogil

    BOOL GetVolumeInformationW(
        wchar_t* lpRootPathName,
        wchar_t* lpVolumeNameBuffer,
        DWORD nVolumeNameSize,
        DWORD* lpVolumeSerialNumber,
        DWORD* lpMaximumComponentLength,
        DWORD* lpFileSystemFlags,
        wchar_t* lpFileSystemNameBuffer,
        DWORD nFileSystemNameSize
    ) nogil

    BOOL GetDiskFreeSpaceExW(
        wchar_t* lpDirectoryName,
        ULONGLONG* lpFreeBytesAvailableToCaller,
        ULONGLONG* lpTotalNumberOfBytes,
        ULONGLONG* lpTotalNumberOfFreeBytes
    ) nogil

    DWORD GetLastError() nogil


# Constants
cdef DWORD INVALID_FILE_ATTRIBUTES = 0xFFFFFFFF
cdef HANDLE INVALID_HANDLE_VALUE = <HANDLE>(<long long>-1)

cdef DWORD FILE_ATTRIBUTE_READONLY = 0x1
cdef DWORD FILE_ATTRIBUTE_HIDDEN = 0x2
cdef DWORD FILE_ATTRIBUTE_SYSTEM = 0x4
cdef DWORD FILE_ATTRIBUTE_DIRECTORY = 0x10


cdef inline long long filetime_to_unix(FILETIME ft) nogil:
    """Convert Windows FILETIME to Unix timestamp."""
    cdef unsigned long long time = (<unsigned long long>ft.dwHighDateTime << 32) | ft.dwLowDateTime
    # Convert from 100-nanosecond intervals since 1601 to seconds since 1970
    return <long long>((time - 116444736000000000ULL) // 10000000)


cdef inline unsigned long long get_file_size(WIN32_FIND_DATAW* data) nogil:
    """Get file size from WIN32_FIND_DATAW."""
    return (<unsigned long long>data.nFileSizeHigh << 32) | data.nFileSizeLow


def list_directory(str path):
    """
    List contents of a directory.

    Args:
        path: Directory path to list

    Returns:
        List of file info dictionaries
    """
    cdef:
        WIN32_FIND_DATAW find_data
        HANDLE h_find
        list results = []
        str search_path
        str name
        str full_path
        str ext
        bint is_dir
        DWORD attrs
        bytes search_path_bytes
        BOOL has_next

    # Prepare search path
    if not path.endswith("\\"):
        search_path = path + "\\*"
    else:
        search_path = path + "*"

    # Convert to wide string for Windows API
    cdef Py_ssize_t search_len = len(search_path)
    cdef wchar_t* search_wstr = <wchar_t*>PyMem_Malloc((search_len + 1) * sizeof(wchar_t))
    if search_wstr == NULL:
        raise MemoryError("Failed to allocate search path")

    try:
        # Copy Python string to wchar_t buffer
        for i in range(search_len):
            search_wstr[i] = <wchar_t>ord(search_path[i])
        search_wstr[search_len] = 0

        # Find first file
        with nogil:
            h_find = FindFirstFileW(search_wstr, &find_data)

        if h_find == INVALID_HANDLE_VALUE:
            raise FileNotFoundError(f"Cannot access directory: {path}")

        try:
            while True:
                # Convert wchar_t filename to Python string
                name = ""
                for i in range(260):
                    if find_data.cFileName[i] == 0:
                        break
                    name += chr(find_data.cFileName[i])

                # Skip . and ..
                if name != "." and name != "..":
                    is_dir = (find_data.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY) != 0

                    if path.endswith("\\"):
                        full_path = path + name
                    else:
                        full_path = path + "\\" + name

                    # Get extension
                    if is_dir:
                        ext = ""
                    else:
                        dot_pos = name.rfind(".")
                        ext = name[dot_pos:] if dot_pos > 0 else ""

                    results.append({
                        "name": name,
                        "path": full_path,
                        "isDirectory": is_dir,
                        "isHidden": (find_data.dwFileAttributes & FILE_ATTRIBUTE_HIDDEN) != 0,
                        "isSystem": (find_data.dwFileAttributes & FILE_ATTRIBUTE_SYSTEM) != 0,
                        "isReadOnly": (find_data.dwFileAttributes & FILE_ATTRIBUTE_READONLY) != 0,
                        "size": 0 if is_dir else get_file_size(&find_data),
                        "createdAt": filetime_to_unix(find_data.ftCreationTime),
                        "modifiedAt": filetime_to_unix(find_data.ftLastWriteTime),
                        "accessedAt": filetime_to_unix(find_data.ftLastAccessTime),
                        "extension": ext,
                    })

                # Find next file
                with nogil:
                    has_next = FindNextFileW(h_find, &find_data)

                if not has_next:
                    break

        finally:
            with nogil:
                FindClose(h_find)

    finally:
        PyMem_Free(search_wstr)

    return results


def get_file_info(str path):
    """
    Get information about a single file or directory.

    Args:
        path: File or directory path

    Returns:
        File info dictionary
    """
    cdef:
        WIN32_FIND_DATAW find_data
        HANDLE h_find
        str name
        str ext
        bint is_dir
        Py_ssize_t path_len = len(path)

    # Convert to wide string
    cdef wchar_t* path_wstr = <wchar_t*>PyMem_Malloc((path_len + 1) * sizeof(wchar_t))
    if path_wstr == NULL:
        raise MemoryError("Failed to allocate path")

    try:
        for i in range(path_len):
            path_wstr[i] = <wchar_t>ord(path[i])
        path_wstr[path_len] = 0

        with nogil:
            h_find = FindFirstFileW(path_wstr, &find_data)

        if h_find == INVALID_HANDLE_VALUE:
            raise FileNotFoundError(f"File not found: {path}")

        try:
            # Convert filename
            name = ""
            for i in range(260):
                if find_data.cFileName[i] == 0:
                    break
                name += chr(find_data.cFileName[i])

            is_dir = (find_data.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY) != 0

            if is_dir:
                ext = ""
            else:
                dot_pos = name.rfind(".")
                ext = name[dot_pos:] if dot_pos > 0 else ""

            return {
                "name": name,
                "path": path,
                "isDirectory": is_dir,
                "isHidden": (find_data.dwFileAttributes & FILE_ATTRIBUTE_HIDDEN) != 0,
                "isSystem": (find_data.dwFileAttributes & FILE_ATTRIBUTE_SYSTEM) != 0,
                "isReadOnly": (find_data.dwFileAttributes & FILE_ATTRIBUTE_READONLY) != 0,
                "size": 0 if is_dir else get_file_size(&find_data),
                "createdAt": filetime_to_unix(find_data.ftCreationTime),
                "modifiedAt": filetime_to_unix(find_data.ftLastWriteTime),
                "accessedAt": filetime_to_unix(find_data.ftLastAccessTime),
                "extension": ext,
            }

        finally:
            with nogil:
                FindClose(h_find)

    finally:
        PyMem_Free(path_wstr)


def get_drives():
    """
    Get list of available drives.

    Returns:
        List of drive info dictionaries
    """
    cdef:
        DWORD drive_mask
        DWORD drive_type
        int i
        str letter
        str drive_path
        wchar_t[4] drive_wstr
        wchar_t[256] name_buffer
        wchar_t[256] fs_buffer
        ULONGLONG free_bytes
        ULONGLONG total_bytes
        ULONGLONG total_free
        BOOL success
        list drives = []

    with nogil:
        drive_mask = GetLogicalDrives()

    for i in range(26):
        if drive_mask & (1 << i):
            letter = chr(ord('A') + i) + ":"
            drive_path = letter + "\\"

            # Build wide string for drive path
            drive_wstr[0] = <wchar_t>(ord('A') + i)
            drive_wstr[1] = <wchar_t>ord(':')
            drive_wstr[2] = <wchar_t>ord('\\')
            drive_wstr[3] = 0

            with nogil:
                drive_type = GetDriveTypeW(drive_wstr)

                success = GetVolumeInformationW(
                    drive_wstr,
                    name_buffer,
                    256,
                    NULL,
                    NULL,
                    NULL,
                    fs_buffer,
                    256
                )

                free_bytes = 0
                total_bytes = 0
                GetDiskFreeSpaceExW(
                    drive_wstr,
                    NULL,
                    &total_bytes,
                    &free_bytes
                )

            # Convert name buffer to Python string
            drive_name = ""
            if success:
                for j in range(256):
                    if name_buffer[j] == 0:
                        break
                    drive_name += chr(name_buffer[j])

            # Convert filesystem buffer to Python string
            fs_name = ""
            if success:
                for j in range(256):
                    if fs_buffer[j] == 0:
                        break
                    fs_name += chr(fs_buffer[j])

            drives.append({
                "letter": letter,
                "name": drive_name,
                "type": <int>drive_type,
                "totalSize": <long long>total_bytes,
                "freeSpace": <long long>free_bytes,
                "fileSystem": fs_name,
                "isReady": <bint>success,
            })

    return drives
