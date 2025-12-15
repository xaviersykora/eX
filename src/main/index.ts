import { app, BrowserWindow, shell, ipcMain, nativeImage, Tray, Menu } from 'electron';
import { join } from 'path';
import { existsSync } from 'fs';
import { spawn, ChildProcess } from 'child_process';
import { WindowManager, setCloseToTrayEnabled, setTrayVisibilityCallback } from './window/WindowManager';
import { ZmqBridge } from './ipc/ZmqBridge';
import { GlobalState } from './state/GlobalState';

let windowManager: WindowManager;
let zmqBridge: ZmqBridge;
let backendProcess: ChildProcess | null = null;
let tray: Tray | null = null;
let closeToTrayEnabled = false;
let trayRestoreBehavior: 'restore' | 'newWindow' = 'newWindow';

// Pre-cached drag icon for better performance
let cachedDragIcon: Electron.NativeImage | null = null;

// Check if we're in development mode
const isDev = !app.isPackaged;

// Request single instance lock - prevents multiple instances when app is in tray
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  // Another instance is already running, quit this one
  // The running instance will receive 'second-instance' event and show its window
  app.quit();
} else {
  // Handle when a second instance tries to start
  app.on('second-instance', () => {
    // Someone tried to run a second instance - show existing window instead
    const windows = BrowserWindow.getAllWindows();

    if (windows.length > 0) {
      // Find a visible window, or use the first one
      const targetWindow = windows.find(w => w.isVisible()) || windows[0];

      // Show and focus the window
      if (!targetWindow.isVisible()) {
        targetWindow.show();
      }
      if (targetWindow.isMinimized()) {
        targetWindow.restore();
      }
      targetWindow.focus();

      // Update tray visibility since we now have a visible window
      updateTrayVisibility();
    } else if (windowManager) {
      // No windows exist (shouldn't happen, but handle it)
      windowManager.createMainWindow();
    }
  });
}

function getBackendPath(): string {
  if (isDev) {
    // In development, backend is started separately via npm run dev
    return '';
  }

  // In production, look for the compiled backend in resources
  const possiblePaths = [
    // Nuitka output (main.py entry point)
    join(process.resourcesPath, 'backend', 'main.dist', 'xplorer-server.exe'),
    // Nuitka output (legacy server.py entry point)
    join(process.resourcesPath, 'backend', 'server.dist', 'xplorer-server.exe'),
    // PyInstaller output
    join(process.resourcesPath, 'backend', 'xplorer-server', 'xplorer-server.exe'),
  ];

  for (const p of possiblePaths) {
    if (existsSync(p)) {
      return p;
    }
  }

  console.error('Backend executable not found in:', possiblePaths);
  return '';
}

async function startBackend(): Promise<boolean> {
  const backendPath = getBackendPath();

  if (!backendPath) {
    if (isDev) {
      // In dev mode, backend should already be running
      console.log('Development mode: expecting backend to be running');
      return true;
    }
    console.error('Backend executable not found');
    return false;
  }

  // Set working directory to the backend dist folder so it can find its dependencies
  const backendDir = join(backendPath, '..');
  console.log('Starting backend:', backendPath);
  console.log('Backend working directory:', backendDir);

  return new Promise((resolve) => {
    backendProcess = spawn(backendPath, [], {
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd: backendDir,
      detached: false,
      windowsHide: true,
    });

    backendProcess.stdout?.on('data', (data) => {
      console.log(`[backend] ${data.toString().trim()}`);
    });

    backendProcess.stderr?.on('data', (data) => {
      console.error(`[backend] ${data.toString().trim()}`);
    });

    backendProcess.on('error', (err) => {
      console.error('Failed to start backend:', err);
      resolve(false);
    });

    backendProcess.on('exit', (code, signal) => {
      console.log(`Backend exited with code ${code}, signal ${signal}`);
      backendProcess = null;
    });

    // Give the backend a moment to start
    setTimeout(() => resolve(true), 2000);
  });
}

function stopBackend(): void {
  if (backendProcess) {
    console.log('Stopping backend...');
    backendProcess.kill();
    backendProcess = null;
  }
}

// Embedded 32x32 eX logo as base64 PNG (tray icon)
const TRAY_ICON_BASE64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAHH0lEQVR4nM1XDUyT6R3/vV8tlFIBKS0o33fRIh8NH9G7QGoQ5EbYgXI4F4RBpJWy9UABFU/p0DOOYHG5YxAWcy5s45BMc7nocrd5zB7zvMwwdWYKZk5vzp5WRXJOLaVvn+Wpba+HH9w5k/lL3uZ987z////3e/4fT1/gBQGDFwAMIeR5EGEB8E+7KioquG9YtLW1KX33jyzOIukN8LQLLMOA51jwLAuGoc8sOJYDy3qWPRgeHvbE4enP1NRUbUNDQ15ra2tVYmLilE6n461WqwiAzCJAwDCEoV7pA3m47H92uyEAGTOELHKLxO0jROD2eWLlcrlTr9cvtVqt4wAOeAgAeDAyMlJy7ty5f1oslnXNzc2/9zmmdszXwRQgJJI8fPCny7vGSwHXNNCe/XLc6qzkOIhugkOfjWFhxGJo41MwSaZwW5zEyZMnodVqf+LfAVEUQ+x2u31iYuLQ3bt3j9bV1fXu3r17i0ql+s9DBaDbRXfkh9LQ8B65KsHFEMLfvfEFIYLLLYuJpizw4Np1RuZ4wL7+appYm78MMyLIuO2Ka82ra0Vteo50zwd7+dMnTv9ZIVekZmZmMn4CMpnsnlqtjpqcnDx+5syZI3a7fejy5cvVmpSUS/+2T3LO+18xcBPicjrmRy1+hc+p7uBZnsfnfdtcrMbNZre3CIwoko82bHevmefkKtZk4OrkTchDOOzdvg6DI38L6njbgtvXb7YCeI8P52+IoijzEDCbzWxsbOyvpqenY4KDgw+eP3/+Nzab7ZWpO3d2aDSaH2zYtgvpq9/ALzs6cesP76LPpCEOcphhWYZU1ydyjASQXhjxZGxddRYbEcRDLmURHhvhPnd1BpZff84fO37itNTpqKEpnB85/4I2Q/tlTEzMnzxZDqywnp6e3KNHj75/9uzZEJvNVg0gIjoqsqfc0BiqURNn6ORf+cLcDNbpdIJlAIbjPfkhLhfNABieB88D92YE18Hj1/iegY/x5bUrHSFAr4PjOjQaTX1WVtagyWRqzM7OvhVIgNHpdJzVanURQqQGg8Fy6tSpH4+Pj/c7HI7f8kB74Yrcgs11BXhZKbofTLtYN2FoQ/haAyzckAUJ7gs2N/YN/oX96NiJCwK5v8HhAqtUKg+lp6dzK1eu/NGWLVs+pDZ05zs6OminfI3AGdDd3V1QWFhoV6ujrwEooeMiKjrW9fZWA7nyx10z//q4jVw80kYmjrQRev/FsV0zXe1GEhufTFl1BgMLOI77RVpaGqmtrRkghIT5Ysw18Bg6B7ztFVJTU/Neeno6CZJKuwEU81L5WOn3XyOfvr9DtH2yXbR9skMcHWp3rS4tJkKQ/BIP5AHIV0ZF3VyxYsVkZ2dnyeMEzomKgJepk/z8/DsqleoigHIAlqSXFpH+n71J+vaYSGLyIqr6nXlAkiAIfZRwbW3tAUKI4tuqfiyokY8I3cKqqqqDqalpRCpwe+hMCA4Juxgkm/cPAK8DKFKp1HcKCwpudXV1fe+ZVD8Js2sjLy/PFRQU9E4WIGRlQRAEYa1GoyHr16+3fFfVPL4F7Ha7x5EgCLDZbIkOh4M6d4wBMxgDeJ7EhIeH0/FqZRjmK58d42uTZ4XZbKaHiSf44cOHNatWrTqVnOyp8noAaQqF4kxUVNRtAGsBvJWSkkIqKys/tNlsyv8p9xS+TpBIJNi0adPmZcuWEYVCcQLASwAMSUlJpKysbISeG1qtlgiC8C6tA6VS+ffly5ff27lz5xvPVAfmANVDQ0OpZWVlYwkJCVS1HkCCXC4foWRaWlpaeDr2AOzbt6+Itpy3SwoYhtmdmppKqqurhwL7f85/XjqvaqlUiqampm1Lly4lISEhnwJIBFAZFxdHSktLz1JiXhM2YGaEVVZW/o6mgaaDzgKVSnUpPz9/as5ZYA5QPTg4mF5WVnY6Pj6eOqoDoAoODj6Sk5NDTCbTTym5QLKznba3t1fl5uaKYWFhnwHIEgRhL50LdKARQuQBtv7dYLwKuKamph1UtUwmo6pjAayOiYmZKS4uvrh///5s3/tewt+At9g8REZHR+MqKipGaZ14ReSr1errBQUFdtrGjxiazebF5eXlJ+kWew3CJRLJcGZmJmloaOgihPCzVc+VRlofzc3Nrd40fgBAI5FI+mnBGgyGn/f398/zCzEajW8tXLiQBo+mRaRSqe4VFRVd7e3tzXtq7p4Ar2OP84GBgYySkpKJBQsW3KdnCb3o0GpsbDT6DfR6/ebIyMgbDMMcoAz1en0fIST4cfn6LggoUK6+vr6b7ijHcQciIyPtBoOhyf9iQ0PDm7R6dTqd3WKxvPYsqp+EwHqh+acxlixZQlO7wf+S0WhsMZlMw4SQ0ADmz/NrKfCIDzWZTIeMRmOjf3Xr1q3hz/X0egICfW/cuDHiEZbP6dPsqfDGYF6Ej1Pm/xDzUfwXV1f2eUmTPksAAAAASUVORK5CYII=';

function createTray(): void {
  if (tray) return;

  // Use embedded icon for reliability
  const trayIcon = nativeImage.createFromDataURL(TRAY_ICON_BASE64);

  tray = new Tray(trayIcon.resize({ width: 16, height: 16 }));
  tray.setToolTip('eX');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open eX',
      click: () => {
        handleTrayClick();
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        // Force quit - don't minimize to tray
        closeToTrayEnabled = false;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    handleTrayClick();
  });

  tray.on('double-click', () => {
    handleTrayClick();
  });
}

function handleTrayClick(): void {
  const windows = BrowserWindow.getAllWindows();
  const visibleWindows = windows.filter(w => w.isVisible());

  if (trayRestoreBehavior === 'restore' && visibleWindows.length > 0) {
    // Restore the first visible window
    const window = visibleWindows[0];
    if (window.isMinimized()) {
      window.restore();
    }
    window.show();
    window.focus();
  } else if (trayRestoreBehavior === 'restore' && windows.length > 0) {
    // Restore hidden window
    const window = windows[0];
    window.show();
    window.focus();
  } else {
    // Open a new window
    windowManager.createMainWindow();
  }

  // Hide tray when a window is visible (only show when no windows)
  updateTrayVisibility();
}

export function updateTrayVisibility(): void {
  if (!closeToTrayEnabled) {
    destroyTray();
    return;
  }

  const windows = BrowserWindow.getAllWindows();
  const visibleWindows = windows.filter(w => w.isVisible() && !w.isMinimized());

  if (visibleWindows.length === 0) {
    // No visible windows - show tray
    createTray();
  } else {
    // Has visible windows - hide tray
    destroyTray();
  }
}

function destroyTray(): void {
  if (tray) {
    tray.destroy();
    tray = null;
  }
}

async function createWindow(): Promise<void> {
  // Start backend if in production mode
  if (!isDev) {
    const backendStarted = await startBackend();
    if (!backendStarted) {
      console.error('Failed to start backend, app may not function correctly');
    }
  }

  // Initialize ZeroMQ bridge to Python backend
  zmqBridge = new ZmqBridge();
  await zmqBridge.connect();

  // Create window manager
  windowManager = new WindowManager(zmqBridge);

  // Set up tray visibility callback
  setTrayVisibilityCallback(updateTrayVisibility);

  await windowManager.createMainWindow();
}

// Check if started with --start-minimized flag (from login item)
const startMinimized = process.argv.includes('--start-minimized');

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
app.whenReady().then(async () => {
  // Pre-cache the drag icon for better performance during drag operations
  cachedDragIcon = nativeImage.createFromDataURL(
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAAdgAAAHYBTnsmCAAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAADcSURBVDiNpZMxDoJAEEXfLoReQGNlZ2ejNdhR0NCQeAIvYekNPIKlrY2VHsBGE2NB4QkstLGy0Z9wwLjsJmx4YTKZ/+fP7gwYaUAE3IGN8PcGNEAt/RvYABuwk/4TmI4JuIgAMBRB4CBtGSB0gKBwdQi4AvOhACCDwMIAMvg6iRBCAa8RoFfgCqy8BLwBn6c7E/AA1l4CO0AAj6drBniJt0ng5O0CroB3FXAC3kL/G6iNBEJgB+yBnQiEwB54CoED8B4B6jXwA5w/AT/gVK8B/4Dz1wB/oFKvgZ/A5QuSUEu7jj2KLwAAAABJRU5ErkJggg=='
  );

  if (startMinimized) {
    // Start minimized to tray - initialize backend and tray but don't create window
    console.log('Starting minimized to tray...');

    // Start backend if in production mode
    if (!isDev) {
      const backendStarted = await startBackend();
      if (!backendStarted) {
        console.error('Failed to start backend, app may not function correctly');
      }
    }

    // Initialize ZeroMQ bridge to Python backend
    zmqBridge = new ZmqBridge();
    await zmqBridge.connect();

    // Create window manager (but don't create window yet)
    windowManager = new WindowManager(zmqBridge);

    // Set up tray visibility callback and create tray
    setTrayVisibilityCallback(updateTrayVisibility);
    createTray();
  } else {
    // Normal startup - create window
    await createWindow();
  }

  app.on('activate', async () => {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) {
      await windowManager.createMainWindow();
    }
  });
});

// Quit when all windows are closed, except on macOS.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    // If close-to-tray is enabled, show tray and keep running
    if (closeToTrayEnabled) {
      updateTrayVisibility();
    } else {
      zmqBridge?.disconnect();
      stopBackend();
      app.quit();
    }
  }
});

// Ensure backend is stopped on app quit
app.on('will-quit', () => {
  stopBackend();
});

// Handle IPC messages from renderer
ipcMain.handle('xp:request', async (_event, request) => {
  return zmqBridge.sendRequest(request);
});

ipcMain.on('xp:subscribe', (_event, path: string) => {
  zmqBridge.subscribe(path);
});

ipcMain.on('xp:unsubscribe', (_event, path: string) => {
  zmqBridge.unsubscribe(path);
});

// Handle settings updates from renderer
ipcMain.on('settings:closeToTray', (_event, enabled: boolean) => {
  closeToTrayEnabled = enabled;
  setCloseToTrayEnabled(enabled);
  updateTrayVisibility();
});

ipcMain.on('settings:trayRestoreBehavior', (_event, behavior: 'restore' | 'newWindow') => {
  trayRestoreBehavior = behavior;
});

ipcMain.on('settings:startOnLogin', (_event, enabled: boolean) => {
  // Only actually set login item in production (packaged) mode
  if (app.isPackaged) {
    app.setLoginItemSettings({
      openAtLogin: enabled,
      // Start minimized to tray
      args: ['--start-minimized'],
    });
    console.log(`Start on login ${enabled ? 'enabled' : 'disabled'}`);
  } else {
    console.log(`[DEV] Start on login would be ${enabled ? 'enabled' : 'disabled'} (skipped in dev mode)`);
  }
});

// Handle getting current settings (for init)
ipcMain.handle('settings:getCloseToTray', () => closeToTrayEnabled);
ipcMain.handle('settings:getTrayRestoreBehavior', () => trayRestoreBehavior);

// Helper to get windowId from event sender
const getWindowIdFromEvent = (event: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent): string | null => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return null;
  return GlobalState.getWindowId(win);
};

// Handle tab state actions from renderer
ipcMain.on('tabs:create', (event, path?: string) => {
  const windowId = getWindowIdFromEvent(event);
  if (windowId) {
    GlobalState.tabState.createTab(path, windowId);
  }
});

ipcMain.on('tabs:close', (_event, id: string) => {
  GlobalState.tabState.closeTab(id);
});

ipcMain.on('tabs:setActive', (_event, id: string) => {
  GlobalState.tabState.setActiveTab(id);
});

ipcMain.on('tabs:navigateTo', (_event, path: string) => {
  GlobalState.tabState.navigateTo(path);
});

// Navigate a specific tab by ID (tab-safe navigation)
ipcMain.on('tabs:navigateTab', (_event, tabId: string, path: string) => {
  GlobalState.tabState.navigateTab(tabId, path);
});

ipcMain.on('tabs:goBack', () => {
  GlobalState.tabState.goBack();
});

// Go back in a specific tab's history (tab-safe navigation)
ipcMain.on('tabs:goBackTab', (_event, tabId: string) => {
  GlobalState.tabState.goBackTab(tabId);
});

ipcMain.on('tabs:goForward', () => {
  GlobalState.tabState.goForward();
});

// Go forward in a specific tab's history (tab-safe navigation)
ipcMain.on('tabs:goForwardTab', (_event, tabId: string) => {
  GlobalState.tabState.goForwardTab(tabId);
});

ipcMain.handle('tabs:getState', (event) => {
  const windowId = getWindowIdFromEvent(event);
  if (!windowId) return { tabs: [], activeTabId: null };

  const tabs = GlobalState.tabState.getTabsForWindow(windowId);
  const activeTabId = GlobalState.tabState.getActiveTabForWindow(windowId);
  return { tabs, activeTabId };
});

// Tab transfer handlers (for inter-window drag and drop)
ipcMain.on('tabs:addTab', (event, tab: { id: string; path: string; title: string; history: string[]; historyIndex: number }) => {
  const windowId = getWindowIdFromEvent(event);
  if (windowId) {
    GlobalState.tabState.addTab(tab, windowId);
  }
});

ipcMain.on('tabs:removeTab', (_event, id: string) => {
  GlobalState.tabState.removeTab(id);
});

ipcMain.on('tabs:transferTab', (_event, tabId: string, targetWindowId: string) => {
  GlobalState.tabState.transferTab(tabId, targetWindowId);
});

ipcMain.handle('tabs:getTab', (_event, id: string) => {
  return GlobalState.tabState.getTab(id);
});

// Handle native file drag
ipcMain.on('drag:start', (event, filePaths: string[]) => {
  // Filter to valid files that exist
  const validPaths = filePaths.filter((p) => existsSync(p));
  if (validPaths.length === 0) return;

  // Use the pre-cached icon for immediate drag start (no async delay)
  const icon = cachedDragIcon || nativeImage.createEmpty();

  try {
    // Start native drag immediately with cached icon
    event.sender.startDrag({
      file: validPaths[0],
      files: validPaths,
      icon: icon,
    } as Electron.Item);
  } catch (error) {
    console.error('Failed to start drag:', error);
  }
});

// Handle external links
app.on('web-contents-created', (_event, contents) => {
  contents.setWindowOpenHandler(({ url }) => {
    // Open URLs in user's browser
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });
});

// Security: Disable navigation to external URLs
app.on('web-contents-created', (_event, contents) => {
  contents.on('will-navigate', (event, _url) => {
    event.preventDefault();
  });
});
