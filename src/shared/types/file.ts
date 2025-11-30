/**
 * Shared file system types for XPLORER
 */

export interface FileInfo {
  name: string;
  path: string;
  isDirectory: boolean;
  isHidden: boolean;
  isSystem: boolean;
  isReadOnly: boolean;
  size: number;
  createdAt: number;  // Unix timestamp
  modifiedAt: number; // Unix timestamp
  accessedAt: number; // Unix timestamp
  extension: string;
  mimeType?: string;
}

export interface DriveInfo {
  letter: string;
  name: string;
  type: DriveType;
  totalSize: number;
  freeSpace: number;
  fileSystem: string;
  isReady: boolean;
}

export enum DriveType {
  Unknown = 0,
  NoRootDirectory = 1,
  Removable = 2,
  Fixed = 3,
  Network = 4,
  CDRom = 5,
  Ram = 6,
}

export interface FileOperation {
  id: string;
  type: 'copy' | 'move' | 'delete';
  sources: string[];
  destination?: string;
  progress: number;
  currentFile: string;
  bytesProcessed: number;
  bytesTotal: number;
  status: 'pending' | 'running' | 'paused' | 'completed' | 'error' | 'cancelled';
  error?: string;
}

export interface SearchResult {
  path: string;
  name: string;
  isDirectory: boolean;
  size: number;
  modifiedAt: number;
  matchType: 'name' | 'content';
  snippet?: string;
}

export interface SearchOptions {
  query: string;
  path: string;
  recursive: boolean;
  includeHidden: boolean;
  fileTypes?: string[];
  minSize?: number;
  maxSize?: number;
  modifiedAfter?: number;
  modifiedBefore?: number;
}

export type ViewMode = 'details' | 'thumbnails' | 'icons';

export type SortField = 'name' | 'size' | 'type' | 'modifiedAt' | 'createdAt';

export type SortDirection = 'asc' | 'desc';

export interface SortConfig {
  field: SortField;
  direction: SortDirection;
  foldersFirst: boolean;
}
