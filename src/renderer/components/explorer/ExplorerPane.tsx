import React, { useEffect, useCallback, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { FileList } from './FileList';
import { HomePage } from '../home/HomePage';
import { useSharedState } from '../../contexts/StateProvider';
import { useFileStore } from '../../store/fileStore';
import { useSettingsStore } from '../../store/settingsStore';
import type { FileInfo, FSChangeEvent } from '@shared/types';
import { HOME_PATH } from '@shared/types';
import './ExplorerPane.css';

export const ExplorerPane: React.FC = () => {
  const { tabState, tabs: tabActions } = useSharedState();
  const { tabs, activeTabId } = tabState;
  const { setFiles, setLoading, setError, addFile, removeFile, updateFile, refreshCounter, isSearchActive } = useFileStore();
  const { addRecentFile, promptBeforeOpen } = useSettingsStore();

  const activeTab = tabs.find((t) => t.id === activeTabId);
  const currentPath = activeTab?.path || '';

  const isHomePage = currentPath === HOME_PATH;

  // AbortController refs for cancellation - each directory gets its own "thread"
  const loadAbortControllerRef = useRef<AbortController | null>(null);
  const eventAbortControllerRef = useRef<AbortController | null>(null);
  const currentOperationIdRef = useRef<string | null>(null);

  // Track active tab ID in a ref for async operation verification
  const activeTabIdRef = useRef(activeTabId);
  useEffect(() => {
    activeTabIdRef.current = activeTabId;
  }, [activeTabId]);

  const loadDirectory = useCallback(async (path: string) => {
    // Capture the tab ID at the start - operations must verify this hasn't changed
    const tabIdAtStart = activeTabIdRef.current;

    // Cancel any previous load operation (lazy thread cleanup)
    if (loadAbortControllerRef.current) {
      loadAbortControllerRef.current.abort();
      // Cancel the backend operation too
      if (currentOperationIdRef.current) {
        window.xplorer.request('cancel', { operation_id: currentOperationIdRef.current });
      }
    }

    // Spawn new "thread" for this directory
    const abortController = new AbortController();
    loadAbortControllerRef.current = abortController;
    const signal = abortController.signal;
    const operationId = uuidv4();
    currentOperationIdRef.current = operationId;

    if (!path || path === HOME_PATH) {
      setFiles([]); // Clear files for home page
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await window.xplorer.request('fs.list', { path, operation_id: operationId });

      // Check if this thread was aborted OR if the active tab changed
      if (signal.aborted || activeTabIdRef.current !== tabIdAtStart) {
        return; // Silently discard stale results - wrong tab or navigated away
      }

      if (response.success && response.data) {
        setFiles(response.data as FileInfo[]);
      } else {
        setError(response.error?.message || 'Failed to load directory');
      }
    } catch (error) {
      // Only show error if this thread is still active and same tab
      if (!signal.aborted && activeTabIdRef.current === tabIdAtStart) {
        setError(error instanceof Error ? error.message : 'Unknown error');
      }
    } finally {
      // Only update loading state if this thread is still active and same tab
      if (!signal.aborted && activeTabIdRef.current === tabIdAtStart) {
        setLoading(false);
      }
    }
  }, [setFiles, setLoading, setError]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (loadAbortControllerRef.current) {
        loadAbortControllerRef.current.abort();
      }
      if (currentOperationIdRef.current) {
        window.xplorer.request('cancel', { operation_id: currentOperationIdRef.current });
      }
    };
  }, []);

  useEffect(() => {
    // Don't reload directory when search is active (would overwrite search results)
    if (!isSearchActive()) {
      loadDirectory(currentPath);
    }
  }, [currentPath, loadDirectory, refreshCounter, isSearchActive]);

  useEffect(() => {
    if (!currentPath || currentPath === HOME_PATH) return;

    // Capture the tab ID for this effect - events should only update if tab is still active
    const tabIdAtStart = activeTabIdRef.current;

    // Cancel previous event handlers
    if (eventAbortControllerRef.current) {
      eventAbortControllerRef.current.abort();
    }
    const abortController = new AbortController();
    eventAbortControllerRef.current = abortController;
    const signal = abortController.signal;

    // Helper to check if we should still update state
    const isStillValid = () => !signal.aborted && activeTabIdRef.current === tabIdAtStart;

    window.xplorer.subscribe(currentPath);
    const unsubscribe = window.xplorer.onEvent((event) => {
      // Ignore events if this handler was aborted or tab changed
      if (!isStillValid()) return;

      if (event.type === 'fs.changed') {
        const fsEvent = event as FSChangeEvent;
        const eventData = fsEvent.data;
        switch (eventData.eventType) {
          case 'created':
            window.xplorer.request('fs.info', { path: fsEvent.path }).then((res) => {
              if (!isStillValid()) return;
              if (res.success && res.data) addFile(res.data as FileInfo);
            });
            break;
          case 'deleted':
            if (isStillValid()) removeFile(fsEvent.path);
            break;
          case 'modified':
            window.xplorer.request('fs.info', { path: fsEvent.path }).then((res) => {
              if (!isStillValid()) return;
              if (res.success && res.data) updateFile(fsEvent.path, res.data as FileInfo);
            });
            break;
          case 'renamed':
            if (isStillValid()) {
              if (eventData.oldPath) removeFile(eventData.oldPath);
              window.xplorer.request('fs.info', { path: fsEvent.path }).then((res) => {
                if (!isStillValid()) return;
                if (res.success && res.data) addFile(res.data as FileInfo);
              });
            }
            break;
          case 'overflow':
            if (isStillValid()) loadDirectory(currentPath);
            break;
        }
      }
    });

    return () => {
      abortController.abort();
      window.xplorer.unsubscribe(currentPath);
      unsubscribe();
    };
  }, [currentPath, addFile, removeFile, updateFile, loadDirectory]);

  const handleOpen = useCallback(async (file: FileInfo) => {
    // Capture the tab ID at the moment of user interaction to ensure
    // navigation goes to the correct tab even if user switches tabs quickly
    const tabIdAtInteraction = activeTabIdRef.current;

    if (file.isDirectory) {
      if (tabIdAtInteraction) {
        tabActions.navigateTab(tabIdAtInteraction, file.path);
      }
    } else {
      if (promptBeforeOpen) {
        const confirmed = window.confirm(`Open "${file.name}" with the default application?`);
        if (!confirmed) return;
      }
      window.xplorer.request('shell.open', { path: file.path });
      addRecentFile(file.path, file.name);
    }
  }, [tabActions, addRecentFile, promptBeforeOpen]);

  return (
    <div className="explorer-pane">
      {isHomePage ? <HomePage /> : <FileList onOpen={handleOpen} />}
    </div>
  );
};