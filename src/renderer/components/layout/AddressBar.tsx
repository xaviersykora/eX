import React, { useState, useRef, useEffect, useCallback } from 'react';
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
  const { tabs: tabActions } = useSharedState();
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

  // Perform the actual search
  const performSearch = useCallback(async (query: string, force: boolean = false) => {
    const trimmedQuery = query.trim();
    if (!trimmedQuery || !path) return;

    // Skip if we already searched for this exact query (unless forced)
    if (!force && lastSearchedQueryRef.current === trimmedQuery) return;
    lastSearchedQueryRef.current = trimmedQuery;

    // Home page: filter recent files instead of filesystem search
    if (path === HOME_PATH) {
      setHomeSearchQuery(trimmedQuery);
      return;
    }

    const searchId = startSearch(trimmedQuery);
    setLoading(true);
    try {
      const response = await window.xplorer.request('fs.search', {
        path: path,
        query: trimmedQuery,
        recursive: true,
      });
      if (response.success && response.data) {
        setSearchResults(searchId, response.data as any[]);
      } else {
        const currentSearchId = useFileStore.getState().search.searchId;
        if (currentSearchId === searchId) {
          setError(response.error?.message || 'Search failed');
          cancelSearch();
        }
      }
    } catch (error) {
      const currentSearchId = useFileStore.getState().search.searchId;
      if (currentSearchId === searchId) {
        setError(error instanceof Error ? error.message : 'Search failed');
        cancelSearch();
      }
    } finally {
      setLoading(false);
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
    tabActions.navigateTo(newPath);
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editValue.trim()) {
      tabActions.navigateTo(editValue.trim());
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