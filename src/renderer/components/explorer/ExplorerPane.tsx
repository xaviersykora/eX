import React, { useEffect, useCallback } from 'react';
import { FileList } from './FileList';
import { HomePage } from '../home/HomePage';
import { useTabStore, HOME_PATH } from '../../store/tabStore';
import { useFileStore } from '../../store/fileStore';
import { useSettingsStore } from '../../store/settingsStore';
import type { FileInfo, FSChangeEvent } from '@shared/types';
import './ExplorerPane.css';

export const ExplorerPane: React.FC = () => {
  const { tabs, activeTabId, navigateTo } = useTabStore();
  const { setFiles, setLoading, setError, addFile, removeFile, updateFile, refreshCounter } = useFileStore();
  const { addRecentFile, promptBeforeOpen } = useSettingsStore();

  const activeTab = tabs.find((t) => t.id === activeTabId);
  const currentPath = activeTab?.path || '';

  const isHomePage = currentPath === HOME_PATH;

  const loadDirectory = useCallback(async (path: string) => {
    if (!path || path === HOME_PATH) return;

    setLoading(true);
    setError(null);

    try {
      const response = await window.xplorer.request('fs.list', { path });

      if (response.success && response.data) {
        setFiles(response.data as FileInfo[]);
      } else {
        setError(response.error?.message || 'Failed to load directory');
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [setFiles, setLoading, setError]);

  // Load directory when path changes or refresh is triggered
  useEffect(() => {
    loadDirectory(currentPath);
  }, [currentPath, loadDirectory, refreshCounter]);

  // Subscribe to file system changes
  useEffect(() => {
    if (!currentPath || currentPath === HOME_PATH) return;

    window.xplorer.subscribe(currentPath);

    const unsubscribe = window.xplorer.onEvent((event) => {
      if (event.type === 'fs.changed') {
        const fsEvent = event as FSChangeEvent;
        const eventData = fsEvent.data;

        switch (eventData.eventType) {
          case 'created':
            // Fetch info for new file and add it
            window.xplorer.request('fs.info', { path: fsEvent.path }).then((res) => {
              if (res.success && res.data) {
                addFile(res.data as FileInfo);
              }
            });
            break;
          case 'deleted':
            removeFile(fsEvent.path);
            break;
          case 'modified':
            window.xplorer.request('fs.info', { path: fsEvent.path }).then((res) => {
              if (res.success && res.data) {
                const info = res.data as FileInfo;
                updateFile(fsEvent.path, info);
              }
            });
            break;
          case 'renamed':
            if (eventData.oldPath) {
              removeFile(eventData.oldPath);
            }
            window.xplorer.request('fs.info', { path: fsEvent.path }).then((res) => {
              if (res.success && res.data) {
                addFile(res.data as FileInfo);
              }
            });
            break;
          case 'overflow':
            // Too many changes, reload the directory
            loadDirectory(currentPath);
            break;
        }
      }
    });

    return () => {
      window.xplorer.unsubscribe(currentPath);
      unsubscribe();
    };
  }, [currentPath, addFile, removeFile, updateFile, loadDirectory]);

  const handleOpen = useCallback(async (file: FileInfo) => {
    if (file.isDirectory) {
      navigateTo(file.path);
    } else {
      // Check if prompt is needed
      if (promptBeforeOpen) {
        const confirmed = window.confirm(`Open "${file.name}" with the default application?`);
        if (!confirmed) return;
      }
      // Open file with default application
      window.xplorer.request('shell.open', { path: file.path });
      // Track in recent files
      addRecentFile(file.path, file.name);
    }
  }, [navigateTo, addRecentFile, promptBeforeOpen]);

  return (
    <div className="explorer-pane">
      {isHomePage ? <HomePage /> : <FileList onOpen={handleOpen} />}
    </div>
  );
};
