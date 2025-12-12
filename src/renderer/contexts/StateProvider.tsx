import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import type { TabStateShape } from '../../main/state/TabState';

// --- Context Shape ---
interface StateContextType {
  tabState: TabStateShape;
  // Actions - we can expand this to include other state actions later
  tabs: {
    create: (path?: string) => void;
    close: (id: string) => void;
    setActive: (id: string) => void;
    navigateTo: (path: string) => void;
    goBack: () => void;
    goForward: () => void;
  };
}

const StateContext = createContext<StateContextType | undefined>(undefined);

// --- Provider Component ---
export const StateProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [tabState, setTabState] = useState<TabStateShape>({ tabs: [], activeTabId: null });
  // Track if we've ever had tabs (to avoid closing on initial empty state)
  const hadTabsRef = useRef(false);

  // Fetch initial state and subscribe to changes from the main process
  useEffect(() => {
    // Fetch initial state (handles race condition where state was sent before we subscribed)
    window.xplorer.state.getTabState().then((initialState) => {
      if (initialState.tabs.length > 0) {
        hadTabsRef.current = true;
      }
      setTabState(initialState);
    });

    // Subscribe to future state changes
    const unsubscribe = window.xplorer.state.onTabsChange((newState) => {
      // Track if we've ever had tabs
      if (newState.tabs.length > 0) {
        hadTabsRef.current = true;
      }

      setTabState(newState);

      // Close window if no tabs remain (after a tab was transferred away)
      // Only close if we previously had tabs to avoid closing on initial empty state
      if (newState.tabs.length === 0 && hadTabsRef.current) {
        window.xplorer.window.close();
      }
    });

    // Cleanup subscription on unmount
    return () => unsubscribe();
  }, []);

  // Define action dispatchers
  const tabActions = {
    create: (path?: string) => window.xplorer.tabs.create(path),
    close: (id: string) => window.xplorer.tabs.close(id),
    setActive: (id: string) => window.xplorer.tabs.setActive(id),
    navigateTo: (path: string) => window.xplorer.tabs.navigateTo(path),
    goBack: () => window.xplorer.tabs.goBack(),
    goForward: () => window.xplorer.tabs.goForward(),
  };

  const value = {
    tabState,
    tabs: tabActions,
  };

  return (
    <StateContext.Provider value={value}>
      {children}
    </StateContext.Provider>
  );
};

// --- Custom Hook ---
export const useSharedState = () => {
  const context = useContext(StateContext);
  if (context === undefined) {
    throw new Error('useSharedState must be used within a StateProvider');
  }
  return context;
};
