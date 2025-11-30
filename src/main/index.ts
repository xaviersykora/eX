import { app, BrowserWindow, shell, ipcMain, nativeImage, Tray, Menu } from 'electron';
import { join } from 'path';
import { existsSync } from 'fs';
import { spawn, ChildProcess } from 'child_process';
import { WindowManager, setCloseToTrayEnabled, setTrayVisibilityCallback } from './window/WindowManager';
import { ZmqBridge } from './ipc/ZmqBridge';

let windowManager: WindowManager;
let zmqBridge: ZmqBridge;
let backendProcess: ChildProcess | null = null;
let tray: Tray | null = null;
let closeToTrayEnabled = false;
let trayRestoreBehavior: 'restore' | 'newWindow' = 'newWindow';

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

// Embedded 32x32 XPLORER logo as base64 PNG (tray icon)
const TRAY_ICON_BASE64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAWqSURBVFhHvZdLTJVXEMcn3+L25uaCAiIoxgcL0ehCfIv4FhTEB/LQqCvigsZHxKTFECwB4kLjwphUDK6IyoIVwZWBva6174e1TZNWa2tbHwhcM81vcs7tlwte7sL2JJPv3O/M+c//m5kzc67Iv6NURJpF5MMppElEPgjp/iejU0RURP4WkZchee2kMHXD+x6tzvgDEfksJF+KyA//B4GPReSViPwoIj+F5Gf3jKRueN+jUkR6RKR3CvlURGpFpDpDqUkjrBenGmfgAWL+OMUDCF75U0TeuDxJJ+j85eRFivAOnU9SjTPIAZSI+xdOPne/H4nI0yAIXkSj0TfxeHwiLy8vkZOT8xZhHo/Hx1lzGE9E5Du3FwyPx2/WsTVpeAIofuWSj+evnIJ4PJ6YPXu2FhcX69q1a7WoqEgPHz6shw4d0nnz5mlpaakuWLBA0YnFYgmXT7+kYIGdEQE2fC0iv0cikXFAly5dqkuWLNGNGzea4YqKCj1+/LgJc4hs2LDB9JYtW6b5+fkaiUTGROSZwwIzIwK4zIxHo9HxwsJCnTt3ru7YsUP3799vUlVVpXV1dbpixQoT5tXV1bbW0NBg63PmzFH2guFIZOwBCDzhy73hyspK3bt3r+7Zs8eeSG1tra5atcqEuX8PEZ54ZfXq1UbEeYJwTJsDZOmjIAhe43biXFNTY1+4c+dO3bZtmxnYt2+fCcQQ/5s1dHh38OBB3b17t2EQDpcT3zsb7yRAJfyNhCspKTEwb6i1tVU7OzvNzd6oD4nX4dnV1aVnzpwxwqxt3bpVFy9e7BOT04GNKQlQB8aCIHhZUFCgy5cvN9fidsJw/vx5ZTx8+FC3b9+uu3btSn45c96xxjh9+rQRYC+eICnxqHM/RxVbk8ZHFIloNDo2f/58y2i+gHhipKyszLzAuHfvnm7atMlcjjC/f/++rTU3N2t5eXlyL0+wwATbFSJsTRqw0qysrAmS58iRI8l4exIAEQbG3bt3dd26dbp+/XodHh62dy0tLXZMvXGflOTQypUrlQLmCEzpAeKis2bNSixatMhiimtJJA8GCQxevHjRDPb19enNmzdtfu7cOSPoCSPsRzgRCxcuVCqmIzBlDhiB3NzcBKzPnj2rp06dMpdyEsIkOHpXrlwxw4yOjg5ds2ZN8svRR+/EiRN68uRJw6I25OTkTE8AJdx/4cIFA+bLPAFAAdq8ebOOjIzo6OioJhIJvXPnjsXd1wD0IdPe3m4YYFEpZ86cOT2B/Pz8BAnDESSTEf/1ZDXJiHFGU1OTGWEMDQ1ZCNCBKCT8frDAnC4EloTZ2dkTJAwlNZyEABL/wcFBM9jW1mZkMNrT02Pvbt++bTqesE/C+vp6K9kkeLokTB5DOh4F5MCBA0kggG/dumWGLl26ZL89OU7DwMCArV2/ft1++31gEDIwMzmG40EQvKIQ0dWIoy9E/f39ZqC3t9cMhLM9NTQ3btywwuRzgS4KJkWOYvcuD/hm9Cw7O/stm3wTwti1a9e0u7vbPBM+FX6d5OTIXr58Wa9evWqkfB6AlZWVRfyfpivFvhk9DoJglFZK4gCKgS1btpjxsGFvxJPgN3oIrqcGcFlxX8/VnptV2mbk2/FT+jitlFj74+WfCN6h8tF4vKc8KT8n9qE7AY0I7LTtOHwh+SMWi03QTvkKjHMyvLupbtQI+gNz3hFvvpycYQ/3CTDAcpgZEfAXyG9F5Dns6WQcI+59fNXRo0eTHZI6wPzYsWPWlOiitHLc7r78ucPyuBkR8Nenb7gfkBMkEUToE5RdajvVrbGx0eacDJ64fMaMGQn2sNdhhDGnJZB6LUf4r/CMIxqLxcYoVlTM3Nzctwhz3rGGjrsDssfv93hpr2QdrkhwTFAKi/+T4StZOkEnvCcsYKODrUmjRETqRKThHVLv1jMRdFP3e2EdWzb+AUt7ePb9x6T9AAAAAElFTkSuQmCC';

function createTray(): void {
  if (tray) return;

  // Use embedded icon for reliability
  const trayIcon = nativeImage.createFromDataURL(TRAY_ICON_BASE64);

  tray = new Tray(trayIcon.resize({ width: 16, height: 16 }));
  tray.setToolTip('XPLORER');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open XPLORER',
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

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
app.whenReady().then(async () => {
  await createWindow();

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

// Handle getting current settings (for init)
ipcMain.handle('settings:getCloseToTray', () => closeToTrayEnabled);
ipcMain.handle('settings:getTrayRestoreBehavior', () => trayRestoreBehavior);

// Handle native file drag
ipcMain.on('drag:start', (event, filePaths: string[]) => {
  // Filter to valid files that exist
  const validPaths = filePaths.filter((p) => existsSync(p));
  if (validPaths.length === 0) return;

  // Try to create a drag icon, fall back to a generated one
  let icon = nativeImage.createFromPath(join(__dirname, '../resources/file-drag.png'));

  if (icon.isEmpty()) {
    // Create a simple placeholder icon (16x16 transparent with a file shape)
    icon = nativeImage.createEmpty();
  }

  try {
    // Use type assertion as 'files' is valid but TypeScript definitions may be outdated
    event.sender.startDrag({
      file: validPaths[0],
      files: validPaths,
      icon: icon.isEmpty() ? nativeImage.createFromDataURL('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAAdgAAAHYBTnsmCAAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAADcSURBVDiNpZMxDoJAEEXfLoReQGNlZ2ejNdhR0NCQeAIvYekNPIKlrY2VHsBGE2NB4QkstLGy0Z9wwLjsJmx4YTKZ/+fP7gwYaUAE3IGN8PcGNEAt/RvYABuwk/4TmI4JuIgAMBRB4CBtGSB0gKBwdQi4AvOhACCDwMIAMvg6iRBCAa8RoFfgCqy8BLwBn6c7E/AA1l4CO0AAj6drBniJt0ng5O0CroB3FXAC3kL/G6iNBEJgB+yBnQiEwB54CoED8B4B6jXwA5w/AT/gVK8B/4Dz1wB/oFKvgZ/A5QuSUEu7jj2KLwAAAABJRU5ErkJggg==') : icon,
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
