import { v4 as uuidv4 } from 'uuid';

export interface Tab {
  id: string;
  path: string;
  title: string;
  history: string[];
  historyIndex: number;
  windowId?: string; // Which window this tab belongs to
}

export interface TabStateShape {
  tabs: Tab[];
  activeTabId: string | null;
}

// Per-window state (filtered view of global state)
export interface WindowTabState {
  tabs: Tab[];
  activeTabId: string | null;
}

// Special path for Home page
export const HOME_PATH = 'Home';

const getDefaultPath = () => {
  return HOME_PATH;
};

const createDefaultTab = (path?: string, windowId?: string): Tab => {
  const tabPath = path || getDefaultPath();
  return {
    id: uuidv4(),
    path: tabPath,
    title: tabPath.split('\\').pop() || tabPath,
    history: [tabPath],
    historyIndex: 0,
    windowId,
  };
};

export class TabState {
  private state: TabStateShape;
  private broadcaster: (state: TabStateShape) => void;
  // Track active tab per window
  private activeTabPerWindow: Map<string, string> = new Map();

  constructor(broadcaster: (state: TabStateShape) => void) {
    // Start with empty state - tabs are created per-window
    this.state = {
      tabs: [],
      activeTabId: null,
    };
    this.broadcaster = broadcaster;
  }

  // --- Public method to get current state ---
  public getState = (): TabStateShape => {
    return { ...this.state };
  }

  // --- Private method to update and broadcast state ---
  private setState = (newState: Partial<TabStateShape>) => {
    this.state = { ...this.state, ...newState };
    this.broadcaster(this.state);
  }

  // --- Actions ---
  public createTab = (path?: string, windowId?: string) => {
    const newTab = createDefaultTab(path, windowId);
    if (windowId) {
      this.activeTabPerWindow.set(windowId, newTab.id);
    }
    this.setState({
      tabs: [...this.state.tabs, newTab],
      activeTabId: newTab.id,
    });
    return newTab;
  };

  // Create initial tab for a new window
  public createInitialTabForWindow = (windowId: string, path?: string) => {
    return this.createTab(path, windowId);
  };

  public closeTab = (id: string) => {
    const { tabs } = this.state;
    const tab = tabs.find((t) => t.id === id);
    if (!tab) return;

    // Only count tabs in the same window
    const windowTabs = tabs.filter((t) => t.windowId === tab.windowId);
    if (windowTabs.length <= 1) return; // Don't close last tab in window

    const tabIndex = windowTabs.findIndex((t) => t.id === id);
    const newTabs = tabs.filter((t) => t.id !== id);
    const remainingWindowTabs = newTabs.filter((t) => t.windowId === tab.windowId);

    // Update active tab for this window
    const currentActive = this.activeTabPerWindow.get(tab.windowId || '');
    if (currentActive === id && remainingWindowTabs.length > 0) {
      const newIndex = Math.max(0, tabIndex - 1);
      const newActiveId = remainingWindowTabs[newIndex]?.id || remainingWindowTabs[0]?.id || null;
      if (newActiveId && tab.windowId) {
        this.activeTabPerWindow.set(tab.windowId, newActiveId);
      }
    }

    this.setState({ tabs: newTabs, activeTabId: this.state.activeTabId });
  };

  public setActiveTab = (id: string) => {
    const tab = this.state.tabs.find((t) => t.id === id);
    if (tab && tab.windowId) {
      this.activeTabPerWindow.set(tab.windowId, id);
    }
    this.setState({ activeTabId: id });
  };

  public getActiveTabForWindow = (windowId: string): string | null => {
    return this.activeTabPerWindow.get(windowId) || null;
  };

  public navigateTo = (path: string) => {
    const { activeTabId } = this.state;
    if (!activeTabId) return;
    // Delegate to navigateTab with the active tab
    this.navigateTab(activeTabId, path);
  };

  // Navigate a specific tab by ID (tab-safe navigation)
  public navigateTab = (tabId: string, path: string) => {
    const { tabs } = this.state;
    const tabIndex = tabs.findIndex((t) => t.id === tabId);
    if (tabIndex === -1) return;

    const tab = tabs[tabIndex];
    const newHistory = [...tab.history.slice(0, tab.historyIndex + 1), path];

    const updatedTab: Tab = {
      ...tab,
      path,
      title: path.split('\\').pop() || path,
      history: newHistory,
      historyIndex: newHistory.length - 1,
    };

    const newTabs = [...tabs];
    newTabs[tabIndex] = updatedTab;

    this.setState({ tabs: newTabs });
  };

  public goBack = () => {
    const { activeTabId } = this.state;
    if (!activeTabId) return;
    // Delegate to tab-specific method
    this.goBackTab(activeTabId);
  };

  // Go back in a specific tab's history (tab-safe navigation)
  public goBackTab = (tabId: string) => {
    const { tabs } = this.state;
    const tabIndex = tabs.findIndex((t) => t.id === tabId);
    if (tabIndex === -1 || tabs[tabIndex].historyIndex <= 0) return;

    const tab = tabs[tabIndex];
    const newIndex = tab.historyIndex - 1;
    const newPath = tab.history[newIndex];

    const updatedTab: Tab = { ...tab, path: newPath, title: newPath.split('\\').pop() || newPath, historyIndex: newIndex };
    const newTabs = [...tabs];
    newTabs[tabIndex] = updatedTab;

    this.setState({ tabs: newTabs });
  };

  public goForward = () => {
    const { activeTabId } = this.state;
    if (!activeTabId) return;
    // Delegate to tab-specific method
    this.goForwardTab(activeTabId);
  };

  // Go forward in a specific tab's history (tab-safe navigation)
  public goForwardTab = (tabId: string) => {
    const { tabs } = this.state;
    const tabIndex = tabs.findIndex((t) => t.id === tabId);
    if (tabIndex === -1 || tabs[tabIndex].historyIndex >= tabs[tabIndex].history.length - 1) return;

    const tab = tabs[tabIndex];
    const newIndex = tab.historyIndex + 1;
    const newPath = tab.history[newIndex];

    const updatedTab: Tab = { ...tab, path: newPath, title: newPath.split('\\').pop() || newPath, historyIndex: newIndex };
    const newTabs = [...tabs];
    newTabs[tabIndex] = updatedTab;

    this.setState({ tabs: newTabs });
  };

  // --- Tab Transfer Methods (for inter-window drag and drop) ---

  // Add an existing tab to a specific window
  public addTab = (tab: Tab, windowId?: string) => {
    const newTab = { ...tab, windowId: windowId || tab.windowId };
    if (newTab.windowId) {
      this.activeTabPerWindow.set(newTab.windowId, newTab.id);
    }
    this.setState({
      tabs: [...this.state.tabs, newTab],
      activeTabId: newTab.id,
    });
  };

  // Remove a tab by ID (for transferring to another window)
  // Unlike closeTab, this allows removing the last tab (window will close)
  public removeTab = (id: string): Tab | null => {
    const { tabs } = this.state;
    const tabIndex = tabs.findIndex((t) => t.id === id);
    if (tabIndex === -1) return null;

    const removedTab = tabs[tabIndex];
    const windowId = removedTab.windowId;
    const newTabs = tabs.filter((t) => t.id !== id);

    // Update active tab for the source window
    if (windowId) {
      const remainingWindowTabs = newTabs.filter((t) => t.windowId === windowId);
      if (remainingWindowTabs.length > 0) {
        const windowTabIndex = tabs.filter((t) => t.windowId === windowId).findIndex((t) => t.id === id);
        const newIndex = Math.max(0, windowTabIndex - 1);
        const newActiveId = remainingWindowTabs[newIndex]?.id || remainingWindowTabs[0]?.id;
        if (newActiveId) {
          this.activeTabPerWindow.set(windowId, newActiveId);
        }
      } else {
        this.activeTabPerWindow.delete(windowId);
      }
    }

    this.setState({ tabs: newTabs, activeTabId: this.state.activeTabId });
    return removedTab;
  };

  // Transfer a tab from one window to another
  public transferTab = (tabId: string, targetWindowId: string): boolean => {
    const { tabs } = this.state;
    const tabIndex = tabs.findIndex((t) => t.id === tabId);
    if (tabIndex === -1) return false;

    const tab = tabs[tabIndex];
    const sourceWindowId = tab.windowId;

    // Update tab's windowId
    const updatedTab = { ...tab, windowId: targetWindowId };
    const newTabs = [...tabs];
    newTabs[tabIndex] = updatedTab;

    // Update active tab tracking
    if (sourceWindowId) {
      const remainingSourceTabs = newTabs.filter((t) => t.windowId === sourceWindowId);
      if (remainingSourceTabs.length > 0) {
        const currentActive = this.activeTabPerWindow.get(sourceWindowId);
        if (currentActive === tabId) {
          this.activeTabPerWindow.set(sourceWindowId, remainingSourceTabs[0].id);
        }
      } else {
        this.activeTabPerWindow.delete(sourceWindowId);
      }
    }

    // Set as active in target window
    this.activeTabPerWindow.set(targetWindowId, tabId);

    this.setState({ tabs: newTabs, activeTabId: tabId });
    return true;
  };

  // Remove all tabs for a specific window (called when window closes)
  public removeTabsForWindow = (windowId: string) => {
    const newTabs = this.state.tabs.filter((t) => t.windowId !== windowId);
    this.activeTabPerWindow.delete(windowId);
    this.setState({ tabs: newTabs, activeTabId: this.state.activeTabId });
  };

  // Get a specific tab by ID
  public getTab = (id: string): Tab | null => {
    return this.state.tabs.find((t) => t.id === id) || null;
  };

  // Get tabs for a specific window
  public getTabsForWindow = (windowId: string): Tab[] => {
    return this.state.tabs.filter((t) => t.windowId === windowId);
  };
}
