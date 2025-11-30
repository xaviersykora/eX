import React, { useEffect } from 'react';
import { Sidebar } from './components/layout/Sidebar';
import { Toolbar } from './components/layout/Toolbar';
import { AddressBar } from './components/layout/AddressBar';
import { StatusBar } from './components/layout/StatusBar';
import { InfoPanel } from './components/layout/InfoPanel';
import { TabBar } from './components/tabs/TabBar';
import { ExplorerPane } from './components/explorer/ExplorerPane';
import { useTabStore } from './store/tabStore';
import { useThemeStore } from './store/themeStore';
import { useFileStore } from './store/fileStore';
import { useSettingsStore } from './store/settingsStore';
import './styles/App.css';

function App() {
  const { tabs, activeTabId } = useTabStore();
  const { theme, initTheme } = useThemeStore();
  const { showInfoPanel } = useFileStore();
  const { accentColor, iconColors, closeToTray, trayRestoreBehavior, uiStyle } = useSettingsStore();

  useEffect(() => {
    initTheme();
  }, [initTheme]);

  useEffect(() => {
    // Apply theme class to document
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // Apply UI style on load and when it changes
  useEffect(() => {
    document.documentElement.setAttribute('data-ui-style', uiStyle);
    // Sync with main process for window transparency
    window.xplorer.window.setUIStyle(uiStyle);
  }, [uiStyle]);

  // Apply accent color on load and when it changes
  useEffect(() => {
    document.documentElement.style.setProperty('--accent-color', accentColor);
    // Also set alpha version for backgrounds
    document.documentElement.style.setProperty('--accent-color-alpha', `${accentColor}33`);
  }, [accentColor]);

  // Apply icon colors as CSS variables
  useEffect(() => {
    Object.entries(iconColors).forEach(([type, color]) => {
      document.documentElement.style.setProperty(`--icon-color-${type}`, color);
    });
  }, [iconColors]);

  // Sync tray settings with main process on load
  useEffect(() => {
    window.xplorer.settings.setCloseToTray(closeToTray);
    window.xplorer.settings.setTrayRestoreBehavior(trayRestoreBehavior);
  }, []); // Only on initial load

  const activeTab = tabs.find((t) => t.id === activeTabId);

  return (
    <div className="app">
      <div className="app-titlebar">
        <TabBar />
      </div>

      <div className="app-toolbar">
        <Toolbar />
      </div>

      <div className="app-addressbar">
        <AddressBar path={activeTab?.path || ''} />
      </div>

      <div className="app-content">
        <Sidebar />
        <main className="app-main">
          <ExplorerPane />
        </main>
        {showInfoPanel && <InfoPanel />}
      </div>

      <div className="app-statusbar">
        <StatusBar />
      </div>
    </div>
  );
}

export default App;
