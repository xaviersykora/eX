import { BrowserWindow, screen, nativeTheme, ipcMain, app, systemPreferences } from 'electron';
import { join } from 'path';
import { ZmqBridge } from '../ipc/ZmqBridge';
import { v4 as uuidv4 } from 'uuid';
import { GlobalState } from '../state/GlobalState';

// UI style for glass effect
let currentUIStyle: 'classic' | 'glass' = 'classic';

// These will be set by the main process
let closeToTrayEnabled = false;
let onTrayVisibilityUpdate: (() => void) | null = null;

export function setCloseToTrayEnabled(enabled: boolean): void {
  closeToTrayEnabled = enabled;
}

export function setTrayVisibilityCallback(callback: () => void): void {
  onTrayVisibilityUpdate = callback;
}

export interface TabData {
  id: string;
  path: string;
  title: string;
  history: string[];
  historyIndex: number;
}

// Track which windows are being actively resized by user and monitor moves
interface WindowResizeState {
  timeout: NodeJS.Timeout | null;
  expectedSize: { width: number; height: number };
  lastMoveTime: number;
  isUserResizing: boolean;
}
const userResizingWindows = new WeakMap<BrowserWindow, WindowResizeState>();

export class WindowManager {
  private windows: Map<string, BrowserWindow> = new Map();
  private zmqBridge: ZmqBridge;
  private dragPreviewWindow: BrowserWindow | null = null;

  constructor(zmqBridge: ZmqBridge) {
    this.zmqBridge = zmqBridge;
    this.setupIpcHandlers();
  }

  // --- Drag Preview Overlay Window ---
  private createDragPreviewWindow(): BrowserWindow {
    if (this.dragPreviewWindow && !this.dragPreviewWindow.isDestroyed()) {
      return this.dragPreviewWindow;
    }

    this.dragPreviewWindow = new BrowserWindow({
      width: 200,
      height: 40,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      focusable: false,
      resizable: false,
      movable: false,
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      },
    });

    // Ignore mouse events so they pass through to windows below
    this.dragPreviewWindow.setIgnoreMouseEvents(true);

    return this.dragPreviewWindow;
  }

  public showDragPreview(title: string, x: number, y: number): void {
    const preview = this.createDragPreviewWindow();

    // Create HTML content for the preview
    const isDark = nativeTheme.shouldUseDarkColors;
    const bgColor = isDark ? 'rgba(30, 30, 30, 0.95)' : 'rgba(255, 255, 255, 0.95)';
    const textColor = isDark ? '#cccccc' : '#1e1e1e';
    const borderColor = isDark ? '#0078d4' : '#0078d4';

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            background: transparent;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            -webkit-app-region: no-drag;
            overflow: hidden;
          }
          .preview {
            padding: 8px 16px;
            background: ${bgColor};
            border: 1px solid ${borderColor};
            border-radius: 6px;
            color: ${textColor};
            font-size: 13px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
            backdrop-filter: blur(10px);
          }
        </style>
      </head>
      <body>
        <div class="preview">${title.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
      </body>
      </html>
    `;

    preview.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);

    // Position slightly offset from cursor
    preview.setPosition(x + 10, y + 10);
    preview.showInactive();
  }

  public updateDragPreviewPosition(x: number, y: number): void {
    if (this.dragPreviewWindow && !this.dragPreviewWindow.isDestroyed()) {
      this.dragPreviewWindow.setPosition(x + 10, y + 10);
    }
  }

  public hideDragPreview(): void {
    if (this.dragPreviewWindow && !this.dragPreviewWindow.isDestroyed()) {
      this.dragPreviewWindow.hide();
    }
  }

  private setupIpcHandlers(): void {
    // Handle creating new window with tab data
    ipcMain.handle('window:createWithTab', async (_event, tabData: TabData, screenX: number, screenY: number) => {
      const window = await this.createWindow({
        x: screenX - 100,
        y: screenY - 20,
        tabData,
      });
      return window.id;
    });

    // Handle getting all window IDs
    ipcMain.handle('window:getAllIds', () => {
      return Array.from(this.windows.keys());
    });

    // Handle getting window bounds for drop detection
    ipcMain.handle('window:getBounds', (_event, windowId: string) => {
      const window = this.windows.get(windowId);
      if (window) {
        return window.getBounds();
      }
      return null;
    });

    // Handle transferring tab to another window
    ipcMain.on('window:transferTab', (_event, targetWindowId: string, tabData: TabData) => {
      const targetWindow = this.windows.get(targetWindowId);
      if (targetWindow) {
        targetWindow.webContents.send('tab:receive', tabData);
      }
    });

    // Handle showing/hiding drop indicator on target window
    ipcMain.on('window:showDropIndicator', (_event, targetWindowId: string, show: boolean) => {
      const targetWindow = this.windows.get(targetWindowId);
      if (targetWindow) {
        targetWindow.webContents.send('tab:dropIndicator', show);
      }
    });

    // Drag preview overlay handlers
    ipcMain.on('dragPreview:show', (_event, title: string, x: number, y: number) => {
      this.showDragPreview(title, x, y);
    });

    ipcMain.on('dragPreview:update', (_event, x: number, y: number) => {
      this.updateDragPreviewPosition(x, y);
    });

    ipcMain.on('dragPreview:hide', () => {
      this.hideDragPreview();
    });

    // Get the current window ID for a renderer
    ipcMain.handle('window:getId', (event) => {
      const window = BrowserWindow.fromWebContents(event.sender);
      if (window) {
        for (const [id, win] of this.windows.entries()) {
          if (win === window) {
            return id;
          }
        }
      }
      return null;
    });

    // Focus a window
    ipcMain.on('window:focus', (_event, windowId: string) => {
      const window = this.windows.get(windowId);
      if (window) {
        window.focus();
      }
    });

    // Handle UI style changes
    ipcMain.on('window:setUIStyle', (_event, style: 'classic' | 'glass') => {
      const previousStyle = currentUIStyle;
      currentUIStyle = style;

      // Update all windows with the new style
      this.windows.forEach((window) => {
        this.applyWindowStyle(window, style);
      });

      // Note: If switching to/from glass, the window may need to be recreated
      // for full transparency support (transparent: true must be set at creation)
      // For now, we'll apply what we can dynamically
      if (previousStyle !== style) {
        console.log(`UI style changed from ${previousStyle} to ${style}`);
      }
    });

    // Window control handlers
    ipcMain.on('window:minimize', (event) => {
      const window = BrowserWindow.fromWebContents(event.sender);
      if (window) {
        window.minimize();
      }
    });

    ipcMain.on('window:maximize', (event) => {
      const window = BrowserWindow.fromWebContents(event.sender);
      if (window) {
        if (window.isMaximized()) {
          window.unmaximize();
        } else {
          window.maximize();
        }
      }
    });

    ipcMain.on('window:close', (event) => {
      const window = BrowserWindow.fromWebContents(event.sender);
      if (window) {
        window.close();
      }
    });

    // Check if window is maximized
    ipcMain.handle('window:isMaximized', (event) => {
      const window = BrowserWindow.fromWebContents(event.sender);
      return window ? window.isMaximized() : false;
    });

    // Unmaximize and reposition for drag (called when user starts dragging while maximized)
    ipcMain.handle('window:dragUnmaximize', (event, mouseX: number, mouseY: number) => {
      const window = BrowserWindow.fromWebContents(event.sender);
      if (window && window.isMaximized()) {
        // Get the bounds before unmaximizing to calculate proportional position
        const maximizedBounds = window.getBounds();

        // Unmaximize
        window.unmaximize();

        // Get the new (restored) bounds
        const restoredBounds = window.getBounds();

        // Calculate where the mouse should be on the restored window
        // Keep the mouse at the same proportional X position on the title bar
        const proportionX = mouseX / maximizedBounds.width;
        const newX = mouseX - (restoredBounds.width * proportionX);
        const newY = mouseY - 20; // Keep mouse near top of title bar

        // Set new position
        window.setPosition(Math.round(newX), Math.round(Math.max(0, newY)));

        return {
          x: Math.round(newX),
          y: Math.round(Math.max(0, newY)),
          width: restoredBounds.width,
          height: restoredBounds.height
        };
      }
      return null;
    });

    // Get window position
    ipcMain.handle('window:getPosition', (event) => {
      const window = BrowserWindow.fromWebContents(event.sender);
      if (window) {
        const [x, y] = window.getPosition();
        return { x, y };
      }
      return null;
    });

    // Set window position
    ipcMain.on('window:setPosition', (event, x: number, y: number) => {
      const window = BrowserWindow.fromWebContents(event.sender);
      if (window) {
        window.setPosition(Math.round(x), Math.round(y));
      }
    });

    // Get window bounds (position and size)
    ipcMain.handle('window:getBoundsLocal', (event) => {
      const window = BrowserWindow.fromWebContents(event.sender);
      if (window) {
        return window.getBounds();
      }
      return null;
    });

    // Set window bounds (position and size)
    ipcMain.on('window:setBounds', (event, bounds: { x?: number; y?: number; width?: number; height?: number }) => {
      const window = BrowserWindow.fromWebContents(event.sender);
      if (window) {
        // Mark this window as being user-resized
        const state = userResizingWindows.get(window) || { timeout: null, expectedSize: { width: 0, height: 0 } };
        if (state.timeout) clearTimeout(state.timeout);
        state.timeout = setTimeout(() => {
          const newBounds = window.getBounds();
          state.expectedSize = { width: newBounds.width, height: newBounds.height };
          state.timeout = null;
        }, 100);
        userResizingWindows.set(window, state);

        const currentBounds = window.getBounds();
        window.setBounds({
          x: Math.round(bounds.x ?? currentBounds.x),
          y: Math.round(bounds.y ?? currentBounds.y),
          width: Math.round(bounds.width ?? currentBounds.width),
          height: Math.round(bounds.height ?? currentBounds.height),
        });
      }
    });

    // Get minimum window size
    ipcMain.handle('window:getMinimumSize', (event) => {
      const window = BrowserWindow.fromWebContents(event.sender);
      if (window) {
        const [width, height] = window.getMinimumSize();
        return { width, height };
      }
      return { width: 800, height: 600 };
    });
  }

  async createMainWindow(): Promise<BrowserWindow> {
    return this.createWindow({});
  }

  async createWindow(options: {
    x?: number;
    y?: number;
    tabData?: TabData;
  } = {}): Promise<BrowserWindow> {
    const { width, height } = screen.getPrimaryDisplay().workAreaSize;
    const windowId = uuidv4();

    // Always create windows with transparency enabled on Windows
    // This allows dynamic switching between classic and glass modes
    const isWindows = process.platform === 'win32';

    const window = new BrowserWindow({
      width: Math.min(1400, width * 0.8),
      height: Math.min(900, height * 0.8),
      x: options.x,
      y: options.y,
      minWidth: 800,
      minHeight: 600,
      frame: false,
      title: 'eX', // Explicitly set the window title
      titleBarStyle: 'hidden',
      // Enable transparency for potential glass effect (Windows only)
      transparent: isWindows,
      // Start with solid background - glass effect applied via applyWindowStyle
      backgroundColor: isWindows ? '#00000000' : (nativeTheme.shouldUseDarkColors ? '#1e1e1e' : '#ffffff'),
      show: false,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: false,
        webSecurity: true,
      },
    });

    this.windows.set(windowId, window);

    // Register window with GlobalState for state broadcasting
    GlobalState.addWindow(windowId, window);

    // Create initial tab for this window
    if (options.tabData) {
      // Window created from dragged tab - add the tab with this window's ID
      GlobalState.tabState.addTab({
        ...options.tabData,
        windowId,
      });
    } else {
      // New window - create default tab
      GlobalState.tabState.createInitialTabForWindow(windowId);
    }

    // Show window when ready
    window.once('ready-to-show', () => {
      window.show();
    });

    // Forward file system events to all windows
    this.zmqBridge.onEvent((event) => {
      this.windows.forEach((win) => {
        win.webContents.send('xp:event', event);
      });
    });

    // Load the renderer
    if (process.env.NODE_ENV === 'development') {
      await window.loadURL('http://localhost:5173');
      window.webContents.openDevTools();
    } else {
      await window.loadFile(join(__dirname, '../renderer/index.html'));
    }

    // Handle window close - check if we should minimize to tray instead
    window.on('close', (event) => {
      // If close-to-tray is enabled and this is the last window, hide instead of close
      if (closeToTrayEnabled && this.windows.size === 1) {
        event.preventDefault();
        window.hide();
        // Update tray visibility when window is hidden
        if (onTrayVisibilityUpdate) {
          onTrayVisibilityUpdate();
        }
      }
    });

    // Handle window closed
    window.on('closed', () => {
      this.windows.delete(windowId);
      // Unregister window from GlobalState
      GlobalState.removeWindow(window);
      // Update tray visibility when window is closed
      if (onTrayVisibilityUpdate) {
        onTrayVisibilityUpdate();
      }
    });

    // Handle window show - hide tray when window becomes visible
    window.on('show', () => {
      if (onTrayVisibilityUpdate) {
        onTrayVisibilityUpdate();
      }
    });

    // Broadcast maximize state changes to renderer
    window.on('maximize', () => {
      window.webContents.send('window:maximizeChange', true);
    });

    window.on('unmaximize', () => {
      window.webContents.send('window:maximizeChange', false);
    });

    // Initialize resize tracking for this window
    const initExpectedSize = () => {
      const bounds = window.getBounds();
      userResizingWindows.set(window, {
        timeout: null,
        expectedSize: { width: bounds.width, height: bounds.height },
        lastMoveTime: 0,
        isUserResizing: false,
      });
    };

    // Initialize expected size after window shows
    window.once('ready-to-show', initExpectedSize);

    // Track when window is being moved (potential DPI change when crossing monitors)
    window.on('move', () => {
      const state = userResizingWindows.get(window);
      if (state) {
        state.lastMoveTime = Date.now();
      }
    });

    // Track user-initiated resize start (from window edge dragging)
    window.on('will-resize', (event, newBounds, details) => {
      // Allow if window is being maximized/restored
      if (window.isMaximized()) return;

      const state = userResizingWindows.get(window);
      if (!state) return;

      // Check if this resize is from user dragging an edge
      // The details object contains 'edge' property on Windows/Linux
      const isEdgeDrag = details && (details as any).edge;

      if (isEdgeDrag) {
        // User is dragging an edge - allow it and update expected size
        state.isUserResizing = true;
        return;
      }

      // Allow if user is actively resizing via our custom handler or edge drag
      if (state.timeout || state.isUserResizing) return;

      // Check if this is a DPI-related resize (happens shortly after moving across monitors)
      const timeSinceMove = Date.now() - state.lastMoveTime;
      const isDPIResize = timeSinceMove < 500; // Resize within 500ms of move is likely DPI scaling

      if (isDPIResize) {
        // Prevent DPI scaling resize
        if (state.expectedSize.width > 0 && state.expectedSize.height > 0) {
          const expectedWidthDiff = Math.abs(newBounds.width - state.expectedSize.width);
          const expectedHeightDiff = Math.abs(newBounds.height - state.expectedSize.height);
          // If size is changing significantly, it's DPI scaling - prevent it
          if (expectedWidthDiff > 10 || expectedHeightDiff > 10) {
            event.preventDefault();
            return;
          }
        }
      }

      // For non-move-related resizes, check if it's unexpected
      const currentBounds = window.getBounds();
      const widthDiff = Math.abs(newBounds.width - currentBounds.width);
      const heightDiff = Math.abs(newBounds.height - currentBounds.height);

      if (widthDiff > 10 || heightDiff > 10) {
        if (state.expectedSize.width > 0) {
          const expectedWidthDiff = Math.abs(newBounds.width - state.expectedSize.width);
          const expectedHeightDiff = Math.abs(newBounds.height - state.expectedSize.height);
          if (expectedWidthDiff > 50 || expectedHeightDiff > 50) {
            event.preventDefault();
          }
        }
      }
    });

    // Clear user resizing flag when resize ends
    window.on('resized', () => {
      const state = userResizingWindows.get(window);
      if (state) {
        state.isUserResizing = false;
        // Update expected size to the new user-chosen size
        if (!window.isMaximized()) {
          const bounds = window.getBounds();
          state.expectedSize = { width: bounds.width, height: bounds.height };
        }
      }
    });

    // Backup: catch resize events and revert if they happen right after a move
    window.on('resize', () => {
      // Don't interfere while maximized
      if (window.isMaximized()) return;

      const state = userResizingWindows.get(window);
      if (!state) return;

      // Allow if user is actively resizing
      if (state.timeout || state.isUserResizing) return;

      // Check if this is likely a DPI resize (shortly after moving)
      const timeSinceMove = Date.now() - state.lastMoveTime;
      if (timeSinceMove > 500) return; // Only intervene if resize happens shortly after move

      const currentBounds = window.getBounds();

      // Check against expected size
      if (state.expectedSize.width > 0 && state.expectedSize.height > 0) {
        const widthDiff = Math.abs(currentBounds.width - state.expectedSize.width);
        const heightDiff = Math.abs(currentBounds.height - state.expectedSize.height);

        // If significantly different from expected, revert
        if (widthDiff > 20 || heightDiff > 20) {
          // Revert to expected size while keeping current position
          window.setBounds({
            x: currentBounds.x,
            y: currentBounds.y,
            width: state.expectedSize.width,
            height: state.expectedSize.height,
          });
        }
      }
    });

    // Update expected size after user finishes maximizing/unmaximizing
    window.on('maximize', () => {
      const state = userResizingWindows.get(window);
      if (state) {
        state.isUserResizing = false;
      }
    });
    window.on('unmaximize', () => {
      // Small delay to let unmaximize complete
      setTimeout(() => {
        const state = userResizingWindows.get(window);
        if (state && !window.isMaximized()) {
          const bounds = window.getBounds();
          state.expectedSize = { width: bounds.width, height: bounds.height };
          state.isUserResizing = false;
        }
      }, 100);
    });

    return window;
  }

  getMainWindow(): BrowserWindow | null {
    // Return the first window or null
    const windows = Array.from(this.windows.values());
    return windows.length > 0 ? windows[0] : null;
  }

  getWindow(id: string): BrowserWindow | null {
    return this.windows.get(id) || null;
  }

  closeAllWindows(): void {
    this.windows.forEach((window) => window.close());
  }

  /**
   * Apply visual style to a window (classic or glass).
   * For glass style, enables transparency and native blur effects.
   */
  private applyWindowStyle(window: BrowserWindow, style: 'classic' | 'glass'): void {
    if (process.platform !== 'win32') {
      // Non-Windows platforms: glass effect not supported the same way
      return;
    }

    try {
      if (style === 'glass') {
        // Enable transparency for glass effect
        window.setBackgroundColor('#00000000');

        // Try to use Windows 11 Mica/Acrylic effect
        // backgroundMaterial is available in Electron 30+ on Windows 11
        // @ts-ignore - backgroundMaterial may not be in types yet
        if (typeof window.setBackgroundMaterial === 'function') {
          // Options: 'none', 'auto', 'mica', 'acrylic', 'tabbed'
          // 'acrylic' provides the translucent blur effect
          // @ts-ignore
          window.setBackgroundMaterial('acrylic');
          console.log('Applied acrylic background material for glass effect');
        } else {
          console.log('setBackgroundMaterial not available - using CSS-only glass effect');
        }
      } else {
        // Classic style - solid background
        // Since window was created with transparent: true, we need to use
        // a solid color via the web content's CSS
        window.setBackgroundColor('#00000001'); // Nearly transparent but not fully

        // @ts-ignore
        if (typeof window.setBackgroundMaterial === 'function') {
          // @ts-ignore
          window.setBackgroundMaterial('none');
        }
      }
    } catch (error) {
      console.error('Failed to apply window style:', error);
    }
  }
}
