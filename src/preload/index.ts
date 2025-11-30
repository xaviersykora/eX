import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type { XPRequest, XPResponse, XPEvent } from '../shared/types';

// Get user home directory - available in preload context
const userHome = process.env.USERPROFILE || process.env.HOME || 'C:\\Users';

// Tab data interface for window operations
interface TabData {
  id: string;
  path: string;
  title: string;
  history: string[];
  historyIndex: number;
}

// Expose protected methods that allow the renderer process to use
// ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('xplorer', {
  // Send request to Python backend
  request: (action: string, params: Record<string, unknown> = {}): Promise<XPResponse> => {
    return ipcRenderer.invoke('xp:request', { action, params });
  },

  // Subscribe to file system events for a path
  subscribe: (path: string): void => {
    ipcRenderer.send('xp:subscribe', path);
  },

  // Unsubscribe from file system events
  unsubscribe: (path: string): void => {
    ipcRenderer.send('xp:unsubscribe', path);
  },

  // Listen for events from backend
  onEvent: (callback: (event: XPEvent) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: XPEvent) => callback(data);
    ipcRenderer.on('xp:event', handler);
    return () => ipcRenderer.removeListener('xp:event', handler);
  },

  // Window controls
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close: () => ipcRenderer.send('window:close'),
    setUIStyle: (style: 'classic' | 'glass') => ipcRenderer.send('window:setUIStyle', style),
    // Get current window ID
    getId: (): Promise<string | null> => ipcRenderer.invoke('window:getId'),
    // Get all window IDs
    getAllIds: (): Promise<string[]> => ipcRenderer.invoke('window:getAllIds'),
    // Get window bounds
    getBounds: (windowId: string): Promise<{ x: number; y: number; width: number; height: number } | null> =>
      ipcRenderer.invoke('window:getBounds', windowId),
    // Create new window with tab
    createWithTab: (tabData: TabData, screenX: number, screenY: number): Promise<number> =>
      ipcRenderer.invoke('window:createWithTab', tabData, screenX, screenY),
    // Transfer tab to another window
    transferTab: (targetWindowId: string, tabData: TabData): void =>
      ipcRenderer.send('window:transferTab', targetWindowId, tabData),
    // Focus a window
    focus: (windowId: string): void => ipcRenderer.send('window:focus', windowId),
    // Show/hide drop indicator on target window
    showDropIndicator: (targetWindowId: string, show: boolean): void =>
      ipcRenderer.send('window:showDropIndicator', targetWindowId, show),
  },

  // Tab operations from other windows
  tabs: {
    // Listen for tab data when window is created with a tab
    onInitWithData: (callback: (tabData: TabData) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: TabData) => callback(data);
      ipcRenderer.on('tab:initWithData', handler);
      return () => ipcRenderer.removeListener('tab:initWithData', handler);
    },
    // Listen for tab received from another window
    onReceive: (callback: (tabData: TabData) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: TabData) => callback(data);
      ipcRenderer.on('tab:receive', handler);
      return () => ipcRenderer.removeListener('tab:receive', handler);
    },
    // Listen for drop indicator show/hide
    onDropIndicator: (callback: (show: boolean) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, show: boolean) => callback(show);
      ipcRenderer.on('tab:dropIndicator', handler);
      return () => ipcRenderer.removeListener('tab:dropIndicator', handler);
    },
  },

  // Platform info
  platform: process.platform,

  // Get user home directory
  getUserHome: (): Promise<string> => Promise.resolve(userHome),

  // Native file drag operations
  startDrag: (filePaths: string[]): void => {
    ipcRenderer.send('drag:start', filePaths);
  },

  // Settings sync with main process
  settings: {
    setCloseToTray: (enabled: boolean): void => {
      ipcRenderer.send('settings:closeToTray', enabled);
    },
    setTrayRestoreBehavior: (behavior: 'restore' | 'newWindow'): void => {
      ipcRenderer.send('settings:trayRestoreBehavior', behavior);
    },
  },
});

// Type definitions for the exposed API
declare global {
  interface Window {
    xplorer: {
      request: (action: string, params?: Record<string, unknown>) => Promise<XPResponse>;
      subscribe: (path: string) => void;
      unsubscribe: (path: string) => void;
      onEvent: (callback: (event: XPEvent) => void) => () => void;
      window: {
        minimize: () => void;
        maximize: () => void;
        close: () => void;
        setUIStyle: (style: 'classic' | 'glass') => void;
        getId: () => Promise<string | null>;
        getAllIds: () => Promise<string[]>;
        getBounds: (windowId: string) => Promise<{ x: number; y: number; width: number; height: number } | null>;
        createWithTab: (tabData: TabData, screenX: number, screenY: number) => Promise<number>;
        transferTab: (targetWindowId: string, tabData: TabData) => void;
        focus: (windowId: string) => void;
        showDropIndicator: (targetWindowId: string, show: boolean) => void;
      };
      tabs: {
        onInitWithData: (callback: (tabData: TabData) => void) => () => void;
        onReceive: (callback: (tabData: TabData) => void) => () => void;
        onDropIndicator: (callback: (show: boolean) => void) => () => void;
      };
      platform: NodeJS.Platform;
      getUserHome: () => Promise<string>;
      startDrag: (filePaths: string[]) => void;
      settings: {
        setCloseToTray: (enabled: boolean) => void;
        setTrayRestoreBehavior: (behavior: 'restore' | 'newWindow') => void;
      };
    };
  }
}
