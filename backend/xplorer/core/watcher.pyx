# cython: language_level=3
# cython: boundscheck=False
# cython: wraparound=False
"""
File system watcher using ReadDirectoryChangesW.
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

    ctypedef struct FILE_NOTIFY_INFORMATION:
        DWORD NextEntryOffset
        DWORD Action
        DWORD FileNameLength
        wchar_t FileName[1]

    HANDLE CreateFileW(
        wchar_t* lpFileName,
        DWORD dwDesiredAccess,
        DWORD dwShareMode,
        void* lpSecurityAttributes,
        DWORD dwCreationDisposition,
        DWORD dwFlagsAndAttributes,
        HANDLE hTemplateFile
    ) nogil

    BOOL ReadDirectoryChangesW(
        HANDLE hDirectory,
        void* lpBuffer,
        DWORD nBufferLength,
        BOOL bWatchSubtree,
        DWORD dwNotifyFilter,
        DWORD* lpBytesReturned,
        void* lpOverlapped,
        void* lpCompletionRoutine
    ) nogil

    BOOL CloseHandle(HANDLE hObject) nogil
    BOOL CancelIo(HANDLE hFile) nogil
    DWORD GetLastError() nogil


# Constants
cdef HANDLE INVALID_HANDLE_VALUE = <HANDLE>(<long long>-1)

cdef DWORD FILE_LIST_DIRECTORY = 0x1
cdef DWORD FILE_SHARE_READ = 0x1
cdef DWORD FILE_SHARE_WRITE = 0x2
cdef DWORD FILE_SHARE_DELETE = 0x4
cdef DWORD OPEN_EXISTING = 3
cdef DWORD FILE_FLAG_BACKUP_SEMANTICS = 0x02000000

cdef DWORD FILE_NOTIFY_CHANGE_FILE_NAME = 0x1
cdef DWORD FILE_NOTIFY_CHANGE_DIR_NAME = 0x2
cdef DWORD FILE_NOTIFY_CHANGE_ATTRIBUTES = 0x4
cdef DWORD FILE_NOTIFY_CHANGE_SIZE = 0x8
cdef DWORD FILE_NOTIFY_CHANGE_LAST_WRITE = 0x10
cdef DWORD FILE_NOTIFY_CHANGE_CREATION = 0x40

cdef DWORD FILE_ACTION_ADDED = 0x1
cdef DWORD FILE_ACTION_REMOVED = 0x2
cdef DWORD FILE_ACTION_MODIFIED = 0x3
cdef DWORD FILE_ACTION_RENAMED_OLD_NAME = 0x4
cdef DWORD FILE_ACTION_RENAMED_NEW_NAME = 0x5


cdef class DirectoryWatcher:
    """
    Watch a directory for changes using ReadDirectoryChangesW.
    """
    cdef:
        HANDLE _handle
        str _path
        bint _recursive
        bint _running
        char* _buffer
        DWORD _buffer_size
        object _callback

    def __cinit__(self):
        self._handle = INVALID_HANDLE_VALUE
        self._buffer = NULL
        self._buffer_size = 64 * 1024  # 64KB buffer

    def __init__(self, str path, bint recursive=True):
        self._path = path
        self._recursive = recursive
        self._running = False
        self._callback = None

        # Allocate buffer
        self._buffer = <char*>malloc(self._buffer_size)
        if self._buffer == NULL:
            raise MemoryError("Failed to allocate watch buffer")

    def __dealloc__(self):
        self.stop()
        if self._buffer != NULL:
            free(self._buffer)
            self._buffer = NULL

    cpdef void start(self, callback) except *:
        """Start watching the directory."""
        cdef:
            HANDLE h
            Py_ssize_t path_len
            wchar_t* path_wstr

        if self._running:
            return

        self._callback = callback

        # Convert path to wide string
        path_len = len(self._path)
        path_wstr = <wchar_t*>PyMem_Malloc((path_len + 1) * sizeof(wchar_t))
        if path_wstr == NULL:
            raise MemoryError("Failed to allocate path")

        try:
            for i in range(path_len):
                path_wstr[i] = <wchar_t>ord(self._path[i])
            path_wstr[path_len] = 0

            with nogil:
                h = CreateFileW(
                    path_wstr,
                    FILE_LIST_DIRECTORY,
                    FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
                    NULL,
                    OPEN_EXISTING,
                    FILE_FLAG_BACKUP_SEMANTICS,
                    NULL
                )
        finally:
            PyMem_Free(path_wstr)

        if h == INVALID_HANDLE_VALUE:
            raise OSError(f"Failed to open directory: {self._path}")

        self._handle = h
        self._running = True

    cpdef void stop(self) except *:
        """Stop watching the directory."""
        self._running = False

        if self._handle != INVALID_HANDLE_VALUE:
            with nogil:
                CancelIo(self._handle)
                CloseHandle(self._handle)
            self._handle = INVALID_HANDLE_VALUE

    cpdef list read_changes(self):
        """
        Read pending directory changes.

        Returns:
            List of change dictionaries with 'action' and 'path' keys.
        """
        cdef:
            DWORD bytes_returned = 0
            DWORD notify_filter
            BOOL result
            FILE_NOTIFY_INFORMATION* info
            DWORD offset = 0
            str filename
            str full_path
            list changes = []
            Py_ssize_t name_len

        if not self._running or self._handle == INVALID_HANDLE_VALUE:
            return changes

        notify_filter = (
            FILE_NOTIFY_CHANGE_FILE_NAME |
            FILE_NOTIFY_CHANGE_DIR_NAME |
            FILE_NOTIFY_CHANGE_ATTRIBUTES |
            FILE_NOTIFY_CHANGE_SIZE |
            FILE_NOTIFY_CHANGE_LAST_WRITE |
            FILE_NOTIFY_CHANGE_CREATION
        )

        with nogil:
            result = ReadDirectoryChangesW(
                self._handle,
                self._buffer,
                self._buffer_size,
                self._recursive,
                notify_filter,
                &bytes_returned,
                NULL,
                NULL
            )

        if not result:
            error = GetLastError()
            if error == 995:  # ERROR_OPERATION_ABORTED
                return changes
            raise OSError(f"ReadDirectoryChangesW failed with error {error}")

        if bytes_returned == 0:
            return changes

        # Parse changes
        while offset < bytes_returned:
            info = <FILE_NOTIFY_INFORMATION*>(self._buffer + offset)

            # Get filename (length is in bytes, convert to characters)
            name_len = info.FileNameLength // sizeof(wchar_t)
            filename = ""
            for i in range(name_len):
                filename += chr(info.FileName[i])

            if self._path.endswith("\\"):
                full_path = self._path + filename
            else:
                full_path = self._path + "\\" + filename

            changes.append({
                "action": <int>info.Action,
                "path": full_path,
            })

            if info.NextEntryOffset == 0:
                break

            offset += info.NextEntryOffset

        return changes

    @property
    def path(self):
        return self._path

    @property
    def running(self):
        return self._running


# Action type mapping
ACTION_NAMES = {
    FILE_ACTION_ADDED: "created",
    FILE_ACTION_REMOVED: "deleted",
    FILE_ACTION_MODIFIED: "modified",
    FILE_ACTION_RENAMED_OLD_NAME: "renamed_old",
    FILE_ACTION_RENAMED_NEW_NAME: "renamed_new",
}


def get_action_name(int action):
    """Get the name for a file action code."""
    return ACTION_NAMES.get(action, "unknown")
