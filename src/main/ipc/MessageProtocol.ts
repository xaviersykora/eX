/**
 * Message protocol constants and utilities for ZeroMQ communication
 */

export const PROTOCOL = {
  // Endpoints
  DEALER_ENDPOINT: 'tcp://127.0.0.1:5555',
  PUB_ENDPOINT: 'tcp://127.0.0.1:5556',

  // Timeouts
  REQUEST_TIMEOUT: 30000,
  CONNECT_TIMEOUT: 5000,

  // Actions
  actions: {
    // File System
    FS_LIST: 'fs.list',
    FS_INFO: 'fs.info',
    FS_COPY: 'fs.copy',
    FS_MOVE: 'fs.move',
    FS_DELETE: 'fs.delete',
    FS_RENAME: 'fs.rename',
    FS_MKDIR: 'fs.mkdir',
    FS_DRIVES: 'fs.drives',
    FS_WATCH: 'fs.watch',
    FS_UNWATCH: 'fs.unwatch',
    FS_SEARCH: 'fs.search',

    // Clipboard
    CLIPBOARD_COPY: 'clipboard.copy',
    CLIPBOARD_CUT: 'clipboard.cut',
    CLIPBOARD_PASTE: 'clipboard.paste',
    CLIPBOARD_GET: 'clipboard.get',
    CLIPBOARD_CLEAR: 'clipboard.clear',

    // Shell
    SHELL_THUMBNAIL: 'shell.thumbnail',
    SHELL_ICON: 'shell.icon',
    SHELL_CONTEXT_MENU: 'shell.contextmenu',
    SHELL_EXECUTE: 'shell.execute',
    SHELL_PROPERTIES: 'shell.properties',
    SHELL_OPEN: 'shell.open',

    // Theme
    THEME_LIST: 'theme.list',
    THEME_GET: 'theme.get',
    THEME_SAVE: 'theme.save',
    THEME_DELETE: 'theme.delete',
  },

  // Event Types
  events: {
    FS_CHANGED: 'fs.changed',
    OPERATION_PROGRESS: 'operation.progress',
    OPERATION_COMPLETE: 'operation.complete',
    OPERATION_ERROR: 'operation.error',
  },
} as const;

export type ActionType = typeof PROTOCOL.actions[keyof typeof PROTOCOL.actions];
export type EventType = typeof PROTOCOL.events[keyof typeof PROTOCOL.events];
