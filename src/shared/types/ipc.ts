/**
 * IPC Protocol types for XPLORER
 * Used for ZeroMQ communication between Electron and Python backend
 */

export interface XPRequest {
  id: string;
  action: string;
  params: Record<string, unknown>;
}

export interface XPResponse {
  id: string;
  success: boolean;
  data?: unknown;
  error?: XPError;
}

export interface XPError {
  code: string;
  message: string;
  details?: unknown;
}

export interface XPEvent {
  type: string;
  path: string;
  data: unknown;
  timestamp: number;
}

// File System Actions
export type FSAction =
  | 'fs.list'
  | 'fs.info'
  | 'fs.copy'
  | 'fs.move'
  | 'fs.delete'
  | 'fs.rename'
  | 'fs.mkdir'
  | 'fs.drives'
  | 'fs.watch'
  | 'fs.unwatch'
  | 'fs.search';

// Clipboard Actions
export type ClipboardAction =
  | 'clipboard.copy'
  | 'clipboard.cut'
  | 'clipboard.paste'
  | 'clipboard.get'
  | 'clipboard.clear';

// Shell Actions
export type ShellAction =
  | 'shell.thumbnail'
  | 'shell.icon'
  | 'shell.contextmenu'
  | 'shell.execute'
  | 'shell.properties'
  | 'shell.open';

// Theme Actions
export type ThemeAction =
  | 'theme.list'
  | 'theme.get'
  | 'theme.save'
  | 'theme.delete';

export type XPAction = FSAction | ClipboardAction | ShellAction | ThemeAction;

// File System Event Types
export enum FSEventType {
  Created = 'created',
  Deleted = 'deleted',
  Modified = 'modified',
  Renamed = 'renamed',
  Overflow = 'overflow',
}

export interface FSChangeEvent extends XPEvent {
  type: 'fs.changed';
  data: {
    eventType: FSEventType;
    oldPath?: string;  // For rename events
  };
}

// Operation Progress Event
export interface OperationProgressEvent extends XPEvent {
  type: 'operation.progress';
  data: {
    operationId: string;
    progress: number;
    currentFile: string;
    bytesProcessed: number;
    bytesTotal: number;
  };
}

// Error Codes
export enum ErrorCode {
  // File System Errors
  PathNotFound = 'PATH_NOT_FOUND',
  AccessDenied = 'ACCESS_DENIED',
  FileExists = 'FILE_EXISTS',
  DirectoryNotEmpty = 'DIRECTORY_NOT_EMPTY',
  InvalidPath = 'INVALID_PATH',
  DiskFull = 'DISK_FULL',

  // Operation Errors
  OperationCancelled = 'OPERATION_CANCELLED',
  OperationFailed = 'OPERATION_FAILED',

  // IPC Errors
  ConnectionFailed = 'CONNECTION_FAILED',
  Timeout = 'TIMEOUT',
  InvalidRequest = 'INVALID_REQUEST',

  // General Errors
  Unknown = 'UNKNOWN',
}
