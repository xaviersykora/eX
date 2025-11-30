import React, { useState, useRef, useEffect } from 'react';
import { ChevronRight, Search, X, Loader2, Home } from 'lucide-react';
import { useTabStore, HOME_PATH } from '../../store/tabStore';
import { useFileStore } from '../../store/fileStore';
import { InputContextMenu, useInputContextMenu } from '../common/InputContextMenu';
import './AddressBar.css';

interface AddressBarProps {
  path: string;
}

export const AddressBar: React.FC<AddressBarProps> = ({ path }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(path);
  const [searchQuery, setSearchQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const { navigateTo } = useTabStore();
  const {
    setLoading,
    setError,
    search,
    startSearch,
    cancelSearch,
    setSearchResults,
  } = useFileStore();
  const { contextMenu: inputContextMenu, handleContextMenu: handleInputContextMenu, closeContextMenu: closeInputContextMenu } = useInputContextMenu();

  useEffect(() => {
    setEditValue(path);
    // Cancel any ongoing search when path changes
    if (search.isActive) {
      cancelSearch();
      setSearchQuery('');
    }
  }, [path, cancelSearch]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const isHomePage = path === HOME_PATH;
  const pathParts = isHomePage ? [] : path.split('\\').filter(Boolean);

  const handleBreadcrumbClick = (index: number) => {
    const newPath = pathParts.slice(0, index + 1).join('\\') + '\\';
    navigateTo(newPath);
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editValue.trim()) {
      navigateTo(editValue.trim());
    }
    setIsEditing(false);
  };

  const handleEditBlur = () => {
    setEditValue(path);
    setIsEditing(false);
  };

  const handleSearchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim() || !path || path === HOME_PATH) return;

    // Start a new search with a unique ID
    const searchId = startSearch(searchQuery.trim());
    setLoading(true);

    try {
      const response = await window.xplorer.request('fs.search', {
        path: path,
        query: searchQuery.trim(),
        recursive: true,
      });

      // Only apply results if search is still valid (not cancelled)
      if (response.success && response.data) {
        setSearchResults(searchId, response.data as any[]);
      } else {
        // Check if search was cancelled before showing error
        const currentSearchId = useFileStore.getState().search.searchId;
        if (currentSearchId === searchId) {
          setError(response.error?.message || 'Search failed');
          cancelSearch();
        }
      }
    } catch (error) {
      // Check if search was cancelled before showing error
      const currentSearchId = useFileStore.getState().search.searchId;
      if (currentSearchId === searchId) {
        setError(error instanceof Error ? error.message : 'Search failed');
        cancelSearch();
      }
    } finally {
      setLoading(false);
    }
  };

  const handleClearSearch = () => {
    setSearchQuery('');
    cancelSearch();
    // Reload current directory
    navigateTo(path);
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
          placeholder="Search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          disabled={isHomePage}
          onContextMenu={handleInputContextMenu}
        />
        {(searchQuery || search.isActive) && (
          <button type="button" className="search-clear" onClick={handleClearSearch}>
            <X size={14} />
          </button>
        )}
      </form>

      {/* Input context menu */}
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
