import React, { useEffect } from 'react';
import { Sidebar } from './components/layout/Sidebar';
import { Toolbar } from './components/layout/Toolbar';
import { AddressBar } from './components/layout/AddressBar';
import { StatusBar } from './components/layout/StatusBar';
import { InfoPanel } from './components/layout/InfoPanel';
import { TabBar } from './components/tabs/TabBar';
import { ExplorerPane } from './components/explorer/ExplorerPane';
import { ResizeBorder } from './components/layout/ResizeBorder';
import { useSharedState } from './contexts/StateProvider';
import { useThemeStore } from './store/themeStore';
import { useFileStore } from './store/fileStore';
import { useSettingsStore } from './store/settingsStore';
import './styles/App.css';

function App() {
  const { tabState } = useSharedState();
  const { tabs, activeTabId } = tabState;
  const { theme, initTheme } = useThemeStore();
  const { showInfoPanel } = useFileStore();
  const { accentColor, iconColors, closeToTray, trayRestoreBehavior, uiStyle } = useSettingsStore();

  // Check if this is the child window
  const urlParams = new URLSearchParams(window.location.search);
  const isChildWindow = urlParams.get('isChild') === 'true';

  useEffect(() => {
    initTheme();
  }, [initTheme]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.setAttribute('data-ui-style', uiStyle);
    window.xplorer.window.setUIStyle(uiStyle);
  }, [uiStyle]);

  useEffect(() => {
    document.documentElement.style.setProperty('--accent-color', accentColor);
    document.documentElement.style.setProperty('--accent-color-alpha', `${accentColor}33`);
  }, [accentColor]);

  useEffect(() => {
    Object.entries(iconColors).forEach(([type, color]) => {
      document.documentElement.style.setProperty(`--icon-color-${type}`, color);
    });
  }, [iconColors]);

  useEffect(() => {
    window.xplorer.settings.setCloseToTray(closeToTray);
    window.xplorer.settings.setTrayRestoreBehavior(trayRestoreBehavior);
  }, [closeToTray, trayRestoreBehavior]);

  const activeTab = tabs.find((t) => t.id === activeTabId);

  return (
    <div className={`app ${isChildWindow ? 'child-window' : ''}`}>
      {!isChildWindow && (
        <div className="app-titlebar">
          <TabBar />
        </div>
      )}

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

      <ResizeBorder />
    </div>
  );
}

export default App;