# cython: language_level=3
"""
Type definitions for Windows API calls.
"""

from libc.stdint cimport uint32_t, uint64_t, int64_t

# Windows type definitions
ctypedef unsigned long DWORD
ctypedef unsigned short WORD
ctypedef int BOOL
ctypedef void* HANDLE
ctypedef void* HWND
ctypedef void* HICON
ctypedef wchar_t* LPCWSTR
ctypedef wchar_t* LPWSTR
ctypedef unsigned long long ULONGLONG

# Constants
cdef extern from *:
    """
    #define INVALID_HANDLE_VALUE ((HANDLE)(long long)-1)
    #define MAX_PATH 260

    // File attributes
    #define FILE_ATTRIBUTE_READONLY 0x1
    #define FILE_ATTRIBUTE_HIDDEN 0x2
    #define FILE_ATTRIBUTE_SYSTEM 0x4
    #define FILE_ATTRIBUTE_DIRECTORY 0x10
    #define FILE_ATTRIBUTE_ARCHIVE 0x20
    #define FILE_ATTRIBUTE_NORMAL 0x80

    // Drive types
    #define DRIVE_UNKNOWN 0
    #define DRIVE_NO_ROOT_DIR 1
    #define DRIVE_REMOVABLE 2
    #define DRIVE_FIXED 3
    #define DRIVE_REMOTE 4
    #define DRIVE_CDROM 5
    #define DRIVE_RAMDISK 6

    // Generic access rights
    #define GENERIC_READ 0x80000000
    #define GENERIC_WRITE 0x40000000

    // File share modes
    #define FILE_SHARE_READ 0x1
    #define FILE_SHARE_WRITE 0x2
    #define FILE_SHARE_DELETE 0x4

    // Creation disposition
    #define OPEN_EXISTING 3

    // File flags
    #define FILE_FLAG_BACKUP_SEMANTICS 0x02000000
    #define FILE_FLAG_OVERLAPPED 0x40000000

    // File notify changes
    #define FILE_NOTIFY_CHANGE_FILE_NAME 0x1
    #define FILE_NOTIFY_CHANGE_DIR_NAME 0x2
    #define FILE_NOTIFY_CHANGE_ATTRIBUTES 0x4
    #define FILE_NOTIFY_CHANGE_SIZE 0x8
    #define FILE_NOTIFY_CHANGE_LAST_WRITE 0x10
    #define FILE_NOTIFY_CHANGE_CREATION 0x40

    // File actions
    #define FILE_ACTION_ADDED 0x1
    #define FILE_ACTION_REMOVED 0x2
    #define FILE_ACTION_MODIFIED 0x3
    #define FILE_ACTION_RENAMED_OLD_NAME 0x4
    #define FILE_ACTION_RENAMED_NEW_NAME 0x5
    """
    HANDLE INVALID_HANDLE_VALUE
    int MAX_PATH

    DWORD FILE_ATTRIBUTE_READONLY
    DWORD FILE_ATTRIBUTE_HIDDEN
    DWORD FILE_ATTRIBUTE_SYSTEM
    DWORD FILE_ATTRIBUTE_DIRECTORY
    DWORD FILE_ATTRIBUTE_ARCHIVE
    DWORD FILE_ATTRIBUTE_NORMAL

    DWORD DRIVE_UNKNOWN
    DWORD DRIVE_NO_ROOT_DIR
    DWORD DRIVE_REMOVABLE
    DWORD DRIVE_FIXED
    DWORD DRIVE_REMOTE
    DWORD DRIVE_CDROM
    DWORD DRIVE_RAMDISK

    DWORD GENERIC_READ
    DWORD GENERIC_WRITE
    DWORD FILE_SHARE_READ
    DWORD FILE_SHARE_WRITE
    DWORD FILE_SHARE_DELETE
    DWORD OPEN_EXISTING
    DWORD FILE_FLAG_BACKUP_SEMANTICS
    DWORD FILE_FLAG_OVERLAPPED

    DWORD FILE_NOTIFY_CHANGE_FILE_NAME
    DWORD FILE_NOTIFY_CHANGE_DIR_NAME
    DWORD FILE_NOTIFY_CHANGE_ATTRIBUTES
    DWORD FILE_NOTIFY_CHANGE_SIZE
    DWORD FILE_NOTIFY_CHANGE_LAST_WRITE
    DWORD FILE_NOTIFY_CHANGE_CREATION

    DWORD FILE_ACTION_ADDED
    DWORD FILE_ACTION_REMOVED
    DWORD FILE_ACTION_MODIFIED
    DWORD FILE_ACTION_RENAMED_OLD_NAME
    DWORD FILE_ACTION_RENAMED_NEW_NAME


# Windows structures
cdef extern from "windows.h":
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
        wchar_t cFileName[MAX_PATH]
        wchar_t cAlternateFileName[14]

    ctypedef struct FILE_NOTIFY_INFORMATION:
        DWORD NextEntryOffset
        DWORD Action
        DWORD FileNameLength
        wchar_t FileName[1]


# Windows API functions
cdef extern from "windows.h":
    HANDLE FindFirstFileW(LPCWSTR lpFileName, WIN32_FIND_DATAW* lpFindFileData) nogil
    BOOL FindNextFileW(HANDLE hFindFile, WIN32_FIND_DATAW* lpFindFileData) nogil
    BOOL FindClose(HANDLE hFindFile) nogil

    DWORD GetFileAttributesW(LPCWSTR lpFileName) nogil
    DWORD GetLogicalDrives() nogil
    DWORD GetDriveTypeW(LPCWSTR lpRootPathName) nogil

    BOOL GetVolumeInformationW(
        LPCWSTR lpRootPathName,
        LPWSTR lpVolumeNameBuffer,
        DWORD nVolumeNameSize,
        DWORD* lpVolumeSerialNumber,
        DWORD* lpMaximumComponentLength,
        DWORD* lpFileSystemFlags,
        LPWSTR lpFileSystemNameBuffer,
        DWORD nFileSystemNameSize
    ) nogil

    BOOL GetDiskFreeSpaceExW(
        LPCWSTR lpDirectoryName,
        ULONGLONG* lpFreeBytesAvailableToCaller,
        ULONGLONG* lpTotalNumberOfBytes,
        ULONGLONG* lpTotalNumberOfFreeBytes
    ) nogil

    HANDLE CreateFileW(
        LPCWSTR lpFileName,
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
    DWORD GetLastError() nogil
