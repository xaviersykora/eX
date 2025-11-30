import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';

export interface Tab {
  id: string;
  path: string;
  title: string;
  history: string[];
  historyIndex: number;
}

interface TabState {
  tabs: Tab[];
  activeTabId: string | null;
}

interface TabActions {
  createTab: (path?: string) => void;
  closeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  navigateTo: (path: string) => void;
  goBack: () => void;
  goForward: () => void;
  canGoBack: () => boolean;
  canGoForward: () => boolean;
  updateTabTitle: (id: string, title: string) => void;
  refresh: () => void;
  getCurrentPath: () => string;
  // Tab drag and drop operations
  getTab: (id: string) => Tab | undefined;
  removeTab: (id: string) => void;
  addTab: (tab: Tab) => void;
  replaceAllTabs: (tab: Tab) => void;
}

// Special path for Home page
export const HOME_PATH = 'Home';

const getDefaultPath = () => {
  // Default to Home page
  return HOME_PATH;
};

const createDefaultTab = (path?: string): Tab => {
  const tabPath = path || getDefaultPath();
  return {
    id: uuidv4(),
    path: tabPath,
    title: tabPath.split('\\').pop() || tabPath,
    history: [tabPath],
    historyIndex: 0,
  };
};

// Create the initial tab once so we can reference its ID
const initialTab = createDefaultTab();

export const useTabStore = create<TabState & TabActions>()((set, get) => ({
  tabs: [initialTab],
  activeTabId: initialTab.id,

  createTab: (path?: string) => {
    const newTab = createDefaultTab(path);
    set((state) => ({
      tabs: [...state.tabs, newTab],
      activeTabId: newTab.id,
    }));
  },

  closeTab: (id: string) => {
    const { tabs, activeTabId } = get();

    if (tabs.length === 1) {
      // Don't close the last tab, just reset it
      const defaultTab = createDefaultTab();
      set({ tabs: [defaultTab], activeTabId: defaultTab.id });
      return;
    }

    const tabIndex = tabs.findIndex((t) => t.id === id);
    const newTabs = tabs.filter((t) => t.id !== id);

    let newActiveId = activeTabId;
    if (activeTabId === id) {
      // If closing active tab, activate the previous tab or next one
      const newIndex = Math.min(tabIndex, newTabs.length - 1);
      newActiveId = newTabs[newIndex]?.id || null;
    }

    set({ tabs: newTabs, activeTabId: newActiveId });
  },

  setActiveTab: (id: string) => {
    set({ activeTabId: id });
  },

  navigateTo: (path: string) => {
    const { tabs, activeTabId } = get();
    if (!activeTabId) return;

    const tabIndex = tabs.findIndex((t) => t.id === activeTabId);
    if (tabIndex === -1) return;

    const tab = tabs[tabIndex];
    const newHistory = [...tab.history.slice(0, tab.historyIndex + 1), path];
    const newHistoryIndex = newHistory.length - 1;

    const updatedTab: Tab = {
      ...tab,
      path,
      title: path.split('\\').pop() || path,
      history: newHistory,
      historyIndex: newHistoryIndex,
    };

    const newTabs = [...tabs];
    newTabs[tabIndex] = updatedTab;

    set({ tabs: newTabs });
  },

  goBack: () => {
    const { tabs, activeTabId } = get();
    if (!activeTabId) return;

    const tabIndex = tabs.findIndex((t) => t.id === activeTabId);
    if (tabIndex === -1) return;

    const tab = tabs[tabIndex];
    if (tab.historyIndex <= 0) return;

    const newIndex = tab.historyIndex - 1;
    const newPath = tab.history[newIndex];

    const updatedTab: Tab = {
      ...tab,
      path: newPath,
      title: newPath.split('\\').pop() || newPath,
      historyIndex: newIndex,
    };

    const newTabs = [...tabs];
    newTabs[tabIndex] = updatedTab;

    set({ tabs: newTabs });
  },

  goForward: () => {
    const { tabs, activeTabId } = get();
    if (!activeTabId) return;

    const tabIndex = tabs.findIndex((t) => t.id === activeTabId);
    if (tabIndex === -1) return;

    const tab = tabs[tabIndex];
    if (tab.historyIndex >= tab.history.length - 1) return;

    const newIndex = tab.historyIndex + 1;
    const newPath = tab.history[newIndex];

    const updatedTab: Tab = {
      ...tab,
      path: newPath,
      title: newPath.split('\\').pop() || newPath,
      historyIndex: newIndex,
    };

    const newTabs = [...tabs];
    newTabs[tabIndex] = updatedTab;

    set({ tabs: newTabs });
  },

  canGoBack: () => {
    const { tabs, activeTabId } = get();
    const tab = tabs.find((t) => t.id === activeTabId);
    return tab ? tab.historyIndex > 0 : false;
  },

  canGoForward: () => {
    const { tabs, activeTabId } = get();
    const tab = tabs.find((t) => t.id === activeTabId);
    return tab ? tab.historyIndex < tab.history.length - 1 : false;
  },

  updateTabTitle: (id: string, title: string) => {
    set((state) => ({
      tabs: state.tabs.map((t) => (t.id === id ? { ...t, title } : t)),
    }));
  },

  refresh: () => {
    // Force a refresh by updating a timestamp or triggering re-render
    // This doesn't add to history, just triggers a reload
    const { tabs, activeTabId } = get();
    if (!activeTabId) return;

    const tabIndex = tabs.findIndex((t) => t.id === activeTabId);
    if (tabIndex === -1) return;

    // Create a new reference to trigger useEffect in ExplorerPane
    const newTabs = [...tabs];
    newTabs[tabIndex] = { ...tabs[tabIndex] };
    set({ tabs: newTabs });
  },

  getCurrentPath: () => {
    const { tabs, activeTabId } = get();
    const tab = tabs.find((t) => t.id === activeTabId);
    return tab?.path || '';
  },

  getTab: (id: string) => {
    const { tabs } = get();
    return tabs.find((t) => t.id === id);
  },

  removeTab: (id: string) => {
    const { tabs, activeTabId } = get();

    // Don't remove if it's the last tab - close window instead
    if (tabs.length === 1) {
      window.xplorer.window.close();
      return;
    }

    const tabIndex = tabs.findIndex((t) => t.id === id);
    const newTabs = tabs.filter((t) => t.id !== id);

    let newActiveId = activeTabId;
    if (activeTabId === id) {
      const newIndex = Math.min(tabIndex, newTabs.length - 1);
      newActiveId = newTabs[newIndex]?.id || null;
    }

    set({ tabs: newTabs, activeTabId: newActiveId });
  },

  addTab: (tab: Tab) => {
    // Generate a new ID to avoid conflicts with existing tabs
    const newTab = { ...tab, id: uuidv4() };
    set((state) => ({
      tabs: [...state.tabs, newTab],
      activeTabId: newTab.id,
    }));
  },

  replaceAllTabs: (tab: Tab) => {
    set({
      tabs: [tab],
      activeTabId: tab.id,
    });
  },
}));
