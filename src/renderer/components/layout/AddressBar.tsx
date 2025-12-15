import React, { useState, useRef, useEffect, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { ChevronRight, Search, X, Loader2, Home } from 'lucide-react';
import { useSharedState } from '../../contexts/StateProvider';
import { useFileStore } from '../../store/fileStore';
import { InputContextMenu, useInputContextMenu } from '../common/InputContextMenu';
import { HOME_PATH } from '@shared/types';
import './AddressBar.css';

interface AddressBarProps {
  path: string;
}

export const AddressBar: React.FC<AddressBarProps> = ({ path }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(path);
  const [searchQuery, setSearchQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastSearchedQueryRef = useRef<string>('');
  const searchAbortControllerRef = useRef<AbortController | null>(null);
  const searchOperationIdRef = useRef<string | null>(null);
  const { tabState, tabs: tabActions } = useSharedState();
  const { activeTabId } = tabState;

  // Track active tab ID in a ref for async operation verification
  const activeTabIdRef = useRef(activeTabId);
  useEffect(() => {
    activeTabIdRef.current = activeTabId;
  }, [activeTabId]);
  const {
    setLoading,
    setError,
    search,
    startSearch,
    cancelSearch,
    setSearchResults,
    triggerRefresh,
    setHomeSearchQuery,
  } = useFileStore();
  const { contextMenu: inputContextMenu, handleContextMenu: handleInputContextMenu, closeContextMenu: closeInputContextMenu } = useInputContextMenu();

  // Track previous path to detect actual path changes
  const prevPathRef = useRef(path);

  useEffect(() => {
    setEditValue(path);
    // Reset search when path actually changes (whether actively searching or showing results)
    if (prevPathRef.current !== path) {
      if (search.isActive || search.searchId) {
        cancelSearch();
      }
      setSearchQuery('');
      lastSearchedQueryRef.current = '';
    }
    prevPathRef.current = path;
  }, [path, cancelSearch, search.isActive, search.searchId]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  // Perform the actual search with cancellation support
  const performSearch = useCallback(async (query: string, force: boolean = false) => {
    const trimmedQuery = query.trim();
    if (!trimmedQuery || !path) return;

    // Skip if we already searched for this exact query (unless forced)
    if (!force && lastSearchedQueryRef.current === trimmedQuery) return;
    lastSearchedQueryRef.current = trimmedQuery;

    // Capture the tab ID at the start - operations must verify this hasn't changed
    const tabIdAtStart = activeTabIdRef.current;

    // Home page: filter recent files instead of filesystem search
    if (path === HOME_PATH) {
      setHomeSearchQuery(trimmedQuery);
      return;
    }

    // Cancel any previous search operation
    if (searchAbortControllerRef.current) {
      searchAbortControllerRef.current.abort();
      // Cancel the backend operation too
      if (searchOperationIdRef.current) {
        window.xplorer.request('cancel', { operation_id: searchOperationIdRef.current });
      }
    }

    // Spawn new "thread" for this search
    const abortController = new AbortController();
    searchAbortControllerRef.current = abortController;
    const signal = abortController.signal;
    const operationId = uuidv4();
    searchOperationIdRef.current = operationId;

    // Helper to check if we should still update state
    const isStillValid = () => !signal.aborted && activeTabIdRef.current === tabIdAtStart;

    const searchId = startSearch(trimmedQuery);
    setLoading(true);
    try {
      const response = await window.xplorer.request('fs.search', {
        path: path,
        query: trimmedQuery,
        recursive: true,
        operation_id: operationId,
      });

      // Check if this search was cancelled or tab changed
      if (!isStillValid()) {
        return; // Silently discard stale results - wrong tab or cancelled
      }

      if (response.success && response.data) {
        setSearchResults(searchId, response.data as any[]);
      } else {
        const currentSearchId = useFileStore.getState().search.searchId;
        if (currentSearchId === searchId && isStillValid()) {
          setError(response.error?.message || 'Search failed');
          cancelSearch();
        }
      }
    } catch (error) {
      const currentSearchId = useFileStore.getState().search.searchId;
      if (currentSearchId === searchId && isStillValid()) {
        setError(error instanceof Error ? error.message : 'Search failed');
        cancelSearch();
      }
    } finally {
      if (isStillValid()) {
        setLoading(false);
      }
    }
  }, [path, startSearch, setLoading, setSearchResults, setError, cancelSearch, setHomeSearchQuery]);

  // Debounced live search as user types
  useEffect(() => {
    // Clear any pending search timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
      searchTimeoutRef.current = null;
    }

    // If query is empty, cancel search and refresh to show normal directory
    if (!searchQuery.trim()) {
      lastSearchedQueryRef.current = '';
      // Check if we're showing search results (searchId set) or actively searching
      if (search.isActive || search.searchId) {
        cancelSearch();
        triggerRefresh();
      }
      // Clear home search filter
      if (path === HOME_PATH) {
        setHomeSearchQuery('');
      }
      return;
    }

    // Debounce search by 300ms
    searchTimeoutRef.current = setTimeout(() => {
      performSearch(searchQuery);
    }, 300);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchQuery, path, search.isActive, search.searchId, cancelSearch, triggerRefresh, performSearch, setHomeSearchQuery]);

  const isHomePage = path === HOME_PATH;
  const pathParts = isHomePage ? [] : path.split('\\').filter(Boolean);

  const handleBreadcrumbClick = (index: number) => {
    const newPath = pathParts.slice(0, index + 1).join('\\') + '\\';
    const tabId = activeTabIdRef.current;
    if (tabId) {
      tabActions.navigateTab(tabId, newPath);
    }
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editValue.trim()) {
      const tabId = activeTabIdRef.current;
      if (tabId) {
        tabActions.navigateTab(tabId, editValue.trim());
      }
    }
    setIsEditing(false);
  };

  const handleEditBlur = () => {
    setEditValue(path);
    setIsEditing(false);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Clear timeout and search immediately on Enter
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
      searchTimeoutRef.current = null;
    }
    if (searchQuery.trim()) {
      performSearch(searchQuery, true); // Force search on Enter
    }
  };

  const handleClearSearch = () => {
    setSearchQuery('');
    // The useEffect will handle canceling search and refreshing
  };

  return (
    <div className="addressbar">
      <div className="addressbar-path" onClick={() => setIsEditing(true)}>
        {isEditing ? (
          <form onSubmit={handleEditSubmit} className="addressbar-edit-form">
            <input
              ref={inputRef}
              type="text"
              className="addressbar-input"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={handleEditBlur}
              onContextMenu={handleInputContextMenu}
            />
          </form>
        ) : (
          <div className="addressbar-breadcrumbs">
            {isHomePage ? (
              <span className="breadcrumb-item breadcrumb-home">
                <Home size={14} />
                <span>Home</span>
              </span>
            ) : (
              pathParts.map((part, index) => (
                <React.Fragment key={index}>
                  {index > 0 && (
                    <ChevronRight size={14} className="breadcrumb-separator" />
                  )}
                  <button
                    className="breadcrumb-item"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleBreadcrumbClick(index);
                    }}
                  >
                    {part}
                  </button>
                </React.Fragment>
              ))
            )}
          </div>
        )}
      </div>
      <form onSubmit={handleSearchSubmit} className="addressbar-search">
        {search.isActive ? (
          <Loader2 size={14} className="search-icon spinning" />
        ) : (
          <Search size={14} className="search-icon" />
        )}
        <input
          type="text"
          className="search-input"
          placeholder={isHomePage ? 'Search recent files' : 'Search'}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onContextMenu={handleInputContextMenu}
        />
        {(searchQuery || search.isActive) && (
          <button type="button" className="search-clear" onClick={handleClearSearch}>
            <X size={14} />
          </button>
        )}
      </form>
      {inputContextMenu && (
        <InputContextMenu
          x={inputContextMenu.x}
          y={inputContextMenu.y}
          inputElement={inputContextMenu.element}
          onClose={closeInputContextMenu}
        />
      )}
    </div>
  );
};