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
    // Check if window is maximized
    isMaximized: (): Promise<boolean> => ipcRenderer.invoke('window:isMaximized'),
    // Unmaximize and reposition for drag
    dragUnmaximize: (mouseX: number, mouseY: number): Promise<{ x: number; y: number; width: number; height: number } | null> =>
      ipcRenderer.invoke('window:dragUnmaximize', mouseX, mouseY),
    // Listen for maximize state changes
    onMaximizeChange: (callback: (isMaximized: boolean) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, isMaximized: boolean) => callback(isMaximized);
      ipcRenderer.on('window:maximizeChange', handler);
      return () => ipcRenderer.removeListener('window:maximizeChange', handler);
    },
    // Get window position
    getPosition: (): Promise<{ x: number; y: number } | null> => ipcRenderer.invoke('window:getPosition'),
    // Set window position
    setPosition: (x: number, y: number): void => ipcRenderer.send('window:setPosition', x, y),
    // Get window bounds (position and size)
    getBoundsLocal: (): Promise<{ x: number; y: number; width: number; height: number } | null> =>
      ipcRenderer.invoke('window:getBoundsLocal'),
    // Set window bounds (position and size)
    setBounds: (bounds: { x?: number; y?: number; width?: number; height?: number }): void =>
      ipcRenderer.send('window:setBounds', bounds),
    // Get minimum window size
    getMinimumSize: (): Promise<{ width: number; height: number }> => ipcRenderer.invoke('window:getMinimumSize'),
  },

  // Tab operations from other windows
  tabs: {
    // Tab state actions
    create: (path?: string): void => ipcRenderer.send('tabs:create', path),
    close: (id: string): void => ipcRenderer.send('tabs:close', id),
    setActive: (id: string): void => ipcRenderer.send('tabs:setActive', id),
    navigateTo: (path: string): void => ipcRenderer.send('tabs:navigateTo', path),
    // Navigate a specific tab by ID (tab-safe navigation)
    navigateTab: (tabId: string, path: string): void => ipcRenderer.send('tabs:navigateTab', tabId, path),
    goBack: (): void => ipcRenderer.send('tabs:goBack'),
    // Go back in a specific tab's history (tab-safe navigation)
    goBackTab: (tabId: string): void => ipcRenderer.send('tabs:goBackTab', tabId),
    goForward: (): void => ipcRenderer.send('tabs:goForward'),
    // Go forward in a specific tab's history (tab-safe navigation)
    goForwardTab: (tabId: string): void => ipcRenderer.send('tabs:goForwardTab', tabId),
    // Tab transfer methods (for inter-window drag and drop)
    addTab: (tab: TabData): void => ipcRenderer.send('tabs:addTab', tab),
    removeTab: (id: string): void => ipcRenderer.send('tabs:removeTab', id),
    transferTab: (tabId: string, targetWindowId: string): void => ipcRenderer.send('tabs:transferTab', tabId, targetWindowId),
    getTab: (id: string): Promise<TabData | null> => ipcRenderer.invoke('tabs:getTab', id),
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

  // Drag preview overlay (visible outside window bounds)
  dragPreview: {
    show: (title: string, x: number, y: number): void => ipcRenderer.send('dragPreview:show', title, x, y),
    update: (x: number, y: number): void => ipcRenderer.send('dragPreview:update', x, y),
    hide: (): void => ipcRenderer.send('dragPreview:hide'),
  },

  // State subscriptions
  state: {
    // Subscribe to tab state changes from main process
    onTabsChange: (callback: (state: { tabs: TabData[]; activeTabId: string | null }) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, state: { tabs: TabData[]; activeTabId: string | null }) => callback(state);
      ipcRenderer.on('state:update:tabs', handler);
      return () => ipcRenderer.removeListener('state:update:tabs', handler);
    },
    // Get current tab state
    getTabState: (): Promise<{ tabs: TabData[]; activeTabId: string | null }> =>
      ipcRenderer.invoke('tabs:getState'),
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
    setStartOnLogin: (enabled: boolean): void => {
      ipcRenderer.send('settings:startOnLogin', enabled);
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
        isMaximized: () => Promise<boolean>;
        dragUnmaximize: (mouseX: number, mouseY: number) => Promise<{ x: number; y: number; width: number; height: number } | null>;
        onMaximizeChange: (callback: (isMaximized: boolean) => void) => () => void;
        getPosition: () => Promise<{ x: number; y: number } | null>;
        setPosition: (x: number, y: number) => void;
        getBoundsLocal: () => Promise<{ x: number; y: number; width: number; height: number } | null>;
        setBounds: (bounds: { x?: number; y?: number; width?: number; height?: number }) => void;
        getMinimumSize: () => Promise<{ width: number; height: number }>;
      };
      tabs: {
        create: (path?: string) => void;
        close: (id: string) => void;
        setActive: (id: string) => void;
        navigateTo: (path: string) => void;
        navigateTab: (tabId: string, path: string) => void;
        goBack: () => void;
        goBackTab: (tabId: string) => void;
        goForward: () => void;
        goForwardTab: (tabId: string) => void;
        addTab: (tab: TabData) => void;
        removeTab: (id: string) => void;
        transferTab: (tabId: string, targetWindowId: string) => void;
        getTab: (id: string) => Promise<TabData | null>;
        onInitWithData: (callback: (tabData: TabData) => void) => () => void;
        onReceive: (callback: (tabData: TabData) => void) => () => void;
        onDropIndicator: (callback: (show: boolean) => void) => () => void;
      };
      dragPreview: {
        show: (title: string, x: number, y: number) => void;
        update: (x: number, y: number) => void;
        hide: () => void;
      };
      state: {
        onTabsChange: (callback: (state: { tabs: TabData[]; activeTabId: string | null }) => void) => () => void;
        getTabState: () => Promise<{ tabs: TabData[]; activeTabId: string | null }>;
      };
      platform: NodeJS.Platform;
      getUserHome: () => Promise<string>;
      startDrag: (filePaths: string[]) => void;
      settings: {
        setCloseToTray: (enabled: boolean) => void;
        setTrayRestoreBehavior: (behavior: 'restore' | 'newWindow') => void;
        setStartOnLogin: (enabled: boolean) => void;
      };
    };
  }
}
