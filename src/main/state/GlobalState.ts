import { BrowserWindow } from 'electron';
import { TabState, TabStateShape, Tab, WindowTabState } from './TabState';

class GlobalStateManager {
  private static instance: GlobalStateManager;

  public tabState: TabState;

  // Map of windowId -> BrowserWindow
  private windows: Map<string, BrowserWindow> = new Map();

  private constructor() {
    this.tabState = new TabState(this.broadcastTabState);
  }

  public static getInstance(): GlobalStateManager {
    if (!GlobalStateManager.instance) {
      GlobalStateManager.instance = new GlobalStateManager();
    }
    return GlobalStateManager.instance;
  }

  // --- Window Management ---
  public addWindow(windowId: string, window: BrowserWindow) {
    this.windows.set(windowId, window);
    // Send initial state filtered for this window
    this.broadcastToWindow(windowId, window);
  }

  public removeWindow(window: BrowserWindow) {
    // Find and remove window by value
    for (const [id, win] of this.windows.entries()) {
      if (win === window) {
        this.windows.delete(id);
        // Also remove tabs belonging to this window
        this.tabState.removeTabsForWindow(id);
        break;
      }
    }
  }

  public getWindowId(window: BrowserWindow): string | null {
    for (const [id, win] of this.windows.entries()) {
      if (win === window) {
        return id;
      }
    }
    return null;
  }

  // --- Broadcasters ---
  private broadcastToWindow(windowId: string, window: BrowserWindow) {
    if (window.isDestroyed()) return;

    const state = this.tabState.getState();
    const windowTabs = state.tabs.filter(tab => tab.windowId === windowId);

    // Find active tab for this window
    let activeTabId = state.activeTabId;
    if (activeTabId && !windowTabs.some(t => t.id === activeTabId)) {
      // Active tab doesn't belong to this window, find first tab
      activeTabId = windowTabs.length > 0 ? windowTabs[0].id : null;
    }

    const windowState: WindowTabState = {
      tabs: windowTabs,
      activeTabId,
    };

    window.webContents.send('state:update:tabs', windowState);
  }

  private broadcastTabState = (_state: TabStateShape) => {
    // Broadcast filtered state to each window
    this.windows.forEach((win, windowId) => {
      this.broadcastToWindow(windowId, win);
    });
  };
}

export const GlobalState = GlobalStateManager.getInstance();
