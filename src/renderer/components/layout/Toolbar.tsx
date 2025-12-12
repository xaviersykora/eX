import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  RotateCcw,
  FolderPlus,
  FilePlus,
  Copy,
  Scissors,
  Clipboard,
  Trash2,
  Grid,
  List,
  LayoutGrid,
  Settings,
  Eye,
  EyeOff,
  PanelRight,
  ArrowUpDown,
  ChevronDown,
  Check,
  Plus,
  FileText,
  FileCode,
  Terminal,
  Link2,
  Folder,
  Pencil,
} from 'lucide-react';
import { useSharedState } from '../../contexts/StateProvider';
import { useFileStore } from '../../store/fileStore';
import { SettingsModal } from '../settings/SettingsModal';
import type { ViewMode, SortField, SortDirection } from '@shared/types';
import './Toolbar.css';

export const Toolbar: React.FC = () => {
  const { tabState, tabs: tabActions } = useSharedState();
  const { tabs, activeTabId } = tabState;
  const { viewMode, setViewMode, selectedIds, getSelectedFiles, triggerRefresh, showHidden, setShowHidden, showInfoPanel, toggleInfoPanel, setPendingNewFolderPath, sortConfig, setSortConfig, thumbnailSize, setThumbnailSize, iconSize, setIconSize, setEditingPath } = useFileStore();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [sizeSliderMode, setSizeSliderMode] = useState<'thumbnails' | 'icons' | null>(null);
  const [sliderPosition, setSliderPosition] = useState<{ x: number; y: number } | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  const addButtonRef = useRef<HTMLButtonElement>(null);
  const sortButtonRef = useRef<HTMLButtonElement>(null);
  const [addMenuPos, setAddMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [sortMenuPos, setSortMenuPos] = useState<{ x: number; y: number } | null>(null);

  const activeTab = tabs.find((t) => t.id === activeTabId);

  const canGoBack = () => {
    const tab = tabs.find((t) => t.id === activeTabId);
    return tab ? tab.historyIndex > 0 : false;
  };

  const canGoForward = () => {
    const tab = tabs.find((t) => t.id === activeTabId);
    return tab ? tab.historyIndex < tab.history.length - 1 : false;
  };

  useEffect(() => {
    if (!showDeleteConfirm) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleDeleteConfirm();
      } else if (e.key === 'Escape' || e.key === 'Backspace') {
        e.preventDefault();
        handleDeleteCancel();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [showDeleteConfirm]);

  const handleGoUp = () => {
    if (!activeTab) return;
    const parts = activeTab.path.split('\\').filter(Boolean);
    if (parts.length > 1) {
      parts.pop();
      const parentPath = parts.join('\\') + '\\';
      tabActions.navigateTo(parentPath);
    }
  };

  const handleRefresh = () => {
    triggerRefresh();
  };

  const handleNewFolder = async () => {
    if (!activeTab) return;
    try {
      const folderName = 'New Folder';
      const basePath = activeTab.path.endsWith('\\') ? activeTab.path : activeTab.path + '\\';
      const response = await window.xplorer.request('fs.mkdir', {
        path: `${basePath}${folderName}`,
      });
      if (response.success && response.data) {
        const newFolderPath = (response.data as { path: string }).path;
        setPendingNewFolderPath(newFolderPath);
        triggerRefresh();
      } else {
        console.error('Failed to create folder:', response.error?.message);
      }
    } catch (error) {
      console.error('Failed to create folder:', error);
    }
  };

  const handleNewFile = async (extension: string) => {
    if (!activeTab) return;
    setShowAddMenu(false);
    try {
      const basePath = activeTab.path.endsWith('\\') ? activeTab.path : activeTab.path + '\\';
      const fileName = `New File${extension}`;
      const response = await window.xplorer.request('fs.writeFile', {
        path: `${basePath}${fileName}`,
        content: '',
      });
      if (response.success && response.data) {
        const newFilePath = (response.data as { path: string }).path;
        setPendingNewFolderPath(newFilePath);
        triggerRefresh();
      } else {
        console.error('Failed to create file:', response.error?.message);
      }
    } catch (error) {
      console.error('Failed to create file:', error);
    }
  };

  const handleCreateShortcut = async () => {
    if (!activeTab) return;
    setShowAddMenu(false);
    try {
      await window.xplorer.request('shell.execute', {
        path: 'rundll32.exe',
        args: `appwiz.cpl,NewLinkHere ${activeTab.path}`,
      });
    } catch (error) {
      console.error('Failed to create shortcut:', error);
    }
  };

  const addMenuItems = [
    { id: 'folder', label: 'Folder', icon: <Folder size={16} />, action: () => { setShowAddMenu(false); handleNewFolder(); } },
    { id: 'separator-1' },
    { id: 'txt', label: 'Text Document (.txt)', icon: <FileText size={16} />, action: () => handleNewFile('.txt') },
    { id: 'md', label: 'Markdown (.md)', icon: <FileText size={16} />, action: () => handleNewFile('.md') },
    { id: 'separator-2' },
    { id: 'bat', label: 'Batch Script (.bat)', icon: <Terminal size={16} />, action: () => handleNewFile('.bat') },
    { id: 'ps1', label: 'PowerShell Script (.ps1)', icon: <Terminal size={16} />, action: () => handleNewFile('.ps1') },
    { id: 'py', label: 'Python Script (.py)', icon: <FileCode size={16} />, action: () => handleNewFile('.py') },
    { id: 'separator-3' },
    { id: 'shortcut', label: 'Shortcut', icon: <Link2 size={16} />, action: handleCreateShortcut },
  ];

  const handleCopy = async () => {
    const selected = getSelectedFiles();
    if (selected.length === 0) return;
    try {
      await window.xplorer.request('clipboard.copy', {
        paths: selected.map((f) => f.path),
        cut: false,
      });
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  const handleCut = async () => {
    const selected = getSelectedFiles();
    if (selected.length === 0) return;
    try {
      await window.xplorer.request('clipboard.copy', {
        paths: selected.map((f) => f.path),
        cut: true,
      });
    } catch (error) {
      console.error('Failed to cut:', error);
    }
  };

  const handlePaste = async () => {
    if (!activeTab) return;
    try {
      const response = await window.xplorer.request('clipboard.paste', {
        destination: activeTab.path,
      });
      if (response.success) {
        triggerRefresh();
      } else {
        console.error('Failed to paste:', response.error?.message);
      }
    } catch (error) {
      console.error('Failed to paste:', error);
    }
  };

  const handleRename = () => {
    const selected = getSelectedFiles();
    if (selected.length !== 1) return;
    setEditingPath(selected[0].path);
  };

  const handleDeleteClick = () => {
    const selected = getSelectedFiles();
    if (selected.length === 0) return;
    setShowDeleteConfirm(true);
  };

  const handleDeleteConfirm = async () => {
    const selected = getSelectedFiles();
    if (selected.length === 0) return;
    try {
      const response = await window.xplorer.request('fs.delete', {
        paths: selected.map((f) => f.path),
        recycleBin: true,
      });
      if (response.success) {
        triggerRefresh();
      } else {
        console.error('Failed to delete:', response.error?.message);
      }
    } catch (error) {
      console.error('Failed to delete:', error);
    } finally {
      setShowDeleteConfirm(false);
    }
  };

  const handleDeleteCancel = () => {
    setShowDeleteConfirm(false);
  };

  const viewModes: { mode: ViewMode; icon: React.ReactNode; title: string }[] = [
    { mode: 'details', icon: <List size={18} />, title: 'Details' },
    { mode: 'thumbnails', icon: <Grid size={18} />, title: 'Details with Thumbnails' },
    { mode: 'icons', icon: <LayoutGrid size={18} />, title: 'Icons' },
  ];

  const sortFields: { field: SortField; label: string }[] = [
    { field: 'name', label: 'Name' },
    { field: 'modifiedAt', label: 'Date modified' },
    { field: 'createdAt', label: 'Date created' },
    { field: 'type', label: 'Type' },
    { field: 'size', label: 'Size' },
  ];

  const handleSortFieldChange = (field: SortField) => {
    if (sortConfig.field === field) {
      setSortConfig({ direction: sortConfig.direction === 'asc' ? 'desc' : 'asc' });
    } else {
      setSortConfig({ field, direction: 'asc' });
    }
    setShowSortMenu(false);
  };

  const handleSortDirectionChange = (direction: SortDirection) => {
    setSortConfig({ direction });
    setShowSortMenu(false);
  };

  const getSortLabel = (): string => {
    const field = sortFields.find((f) => f.field === sortConfig.field);
    return field ? field.label : 'Name';
  };

  return (
    <div className="toolbar">
      <div className="toolbar-group">
        <button
          className="toolbar-button"
          onClick={tabActions.goBack}
          disabled={!canGoBack()}
          title="Back (Alt+Left)"
        >
          <ArrowLeft size={18} />
        </button>
        <button
          className="toolbar-button"
          onClick={tabActions.goForward}
          disabled={!canGoForward()}
          title="Forward (Alt+Right)"
        >
          <ArrowRight size={18} />
        </button>
        <button
          className="toolbar-button"
          onClick={handleGoUp}
          title="Up (Alt+Up)"
        >
          <ArrowUp size={18} />
        </button>
        <button
          className="toolbar-button"
          onClick={handleRefresh}
          title="Refresh (F5)"
        >
          <RotateCcw size={18} />
        </button>
      </div>

      <div className="toolbar-separator" />

      <div className="toolbar-group toolbar-menu-container">
        <button
          ref={addButtonRef}
          className="toolbar-button toolbar-add-button"
          onClick={() => {
            if (!showAddMenu && addButtonRef.current) {
              const rect = addButtonRef.current.getBoundingClientRect();
              setAddMenuPos({ x: rect.left, y: rect.bottom + 4 });
            }
            setShowAddMenu(!showAddMenu);
          }}
          title="Create new item"
        >
          <Plus size={18} />
          <ChevronDown size={14} />
        </button>
        {showAddMenu && addMenuPos && createPortal(
          <div
            className="toolbar-dropdown add-dropdown"
            style={{ left: addMenuPos.x, top: addMenuPos.y }}
            onMouseLeave={() => setShowAddMenu(false)}
          >
            {addMenuItems.map((item) =>
              item.id.startsWith('separator') ? (
                <div key={item.id} className="toolbar-dropdown-divider" />
              ) : (
                <button
                  key={item.id}
                  className="toolbar-dropdown-item"
                  onClick={item.action}
                >
                  <span className="dropdown-icon">{item.icon}</span>
                  <span>{item.label}</span>
                </button>
              )
            )}
          </div>,
          document.body
        )}
      </div>

      <div className="toolbar-separator" />

      <div className="toolbar-group">
        <button
          className="toolbar-button"
          onClick={handleRename}
          disabled={selectedIds.size !== 1}
          title="Rename (F2)"
        >
          <Pencil size={18} />
        </button>
        <button
          className="toolbar-button"
          onClick={handleCopy}
          disabled={selectedIds.size === 0}
          title="Copy (Ctrl+C)"
        >
          <Copy size={18} />
        </button>
        <button
          className="toolbar-button"
          onClick={handleCut}
          disabled={selectedIds.size === 0}
          title="Cut (Ctrl+X)"
        >
          <Scissors size={18} />
        </button>
        <button
          className="toolbar-button"
          onClick={handlePaste}
          title="Paste (Ctrl+V)"
        >
          <Clipboard size={18} />
        </button>
        <button
          className="toolbar-button"
          onClick={handleDeleteClick}
          disabled={selectedIds.size === 0}
          title="Delete (Delete)"
        >
          <Trash2 size={18} />
        </button>
      </div>

      <div className="toolbar-spacer" />

      <div className="toolbar-group toolbar-menu-container">
        <button
          ref={sortButtonRef}
          className="toolbar-button toolbar-sort-button"
          onClick={() => {
            if (!showSortMenu && sortButtonRef.current) {
              const rect = sortButtonRef.current.getBoundingClientRect();
              setSortMenuPos({ x: rect.left, y: rect.bottom + 4 });
            }
            setShowSortMenu(!showSortMenu);
          }}
          title="Sort options"
        >
          <ArrowUpDown size={16} />
          <span className="toolbar-sort-label">{getSortLabel()}</span>
          <ChevronDown size={14} />
        </button>
        {showSortMenu && sortMenuPos && createPortal(
          <div
            className="toolbar-dropdown sort-dropdown"
            style={{ left: sortMenuPos.x, top: sortMenuPos.y }}
            onMouseLeave={() => setShowSortMenu(false)}
          >
            <div className="toolbar-dropdown-section">
              <div className="toolbar-dropdown-section-header">Sort by</div>
              {sortFields.map(({ field, label }) => (
                <button
                  key={field}
                  className="toolbar-dropdown-item"
                  onClick={() => handleSortFieldChange(field)}
                >
                  <span className="dropdown-check">{sortConfig.field === field && <Check size={14} />}</span>
                  <span>{label}</span>
                </button>
              ))}
            </div>
            <div className="toolbar-dropdown-divider" />
            <div className="toolbar-dropdown-section">
              <div className="toolbar-dropdown-section-header">Order</div>
              <button
                className="toolbar-dropdown-item"
                onClick={() => handleSortDirectionChange('asc')}
              >
                <span className="dropdown-check">{sortConfig.direction === 'asc' && <Check size={14} />}</span>
                <span>Ascending</span>
              </button>
              <button
                className="toolbar-dropdown-item"
                onClick={() => handleSortDirectionChange('desc')}
              >
                <span className="dropdown-check">{sortConfig.direction === 'desc' && <Check size={14} />}</span>
                <span>Descending</span>
              </button>
            </div>
          </div>,
          document.body
        )}
      </div>

      <div className="toolbar-group">
        {viewModes.map(({ mode, icon, title }) => (
          <button
            key={mode}
            className={`toolbar-button ${viewMode === mode ? 'active' : ''}`}
            onClick={() => setViewMode(mode)}
            onContextMenu={(e) => {
              if (mode === 'thumbnails' || mode === 'icons') {
                e.preventDefault();
                setSizeSliderMode(mode);
                setSliderPosition({ x: e.clientX, y: e.clientY });
              }
            }}
            title={`${title}${mode !== 'details' ? ' (right-click to adjust size)' : ''}`}
          >
            {icon}
          </button>
        ))}
      </div>

      {/* Size slider popup */}
      {sizeSliderMode && sliderPosition && createPortal(
        <div
          className="size-slider-popup"
          style={{ left: sliderPosition.x, top: sliderPosition.y }}
          onMouseLeave={() => {
            setSizeSliderMode(null);
            setSliderPosition(null);
          }}
        >
          <div className="size-slider-header">
            {sizeSliderMode === 'thumbnails' ? 'Thumbnail Size' : 'Icon Size'}
          </div>
          <div className="size-slider-content">
            <input
              type="range"
              min={sizeSliderMode === 'thumbnails' ? 32 : 48}
              max={sizeSliderMode === 'thumbnails' ? 128 : 256}
              step={8}
              value={sizeSliderMode === 'thumbnails' ? thumbnailSize : iconSize}
              onChange={(e) => {
                const value = parseInt(e.target.value, 10);
                if (sizeSliderMode === 'thumbnails') {
                  setThumbnailSize(value);
                } else {
                  setIconSize(value);
                }
              }}
            />
            <span className="size-slider-value">
              {sizeSliderMode === 'thumbnails' ? thumbnailSize : iconSize}px
            </span>
          </div>
        </div>,
        document.body
      )}

      <div className="toolbar-group">
        <button
          className={`toolbar-button ${showInfoPanel ? 'active' : ''}`}
          onClick={toggleInfoPanel}
          title="Toggle details pane"
        >
          <PanelRight size={18} />
        </button>
      </div>

      <div className="toolbar-group">
        <button
          className={`toolbar-button ${showHidden ? 'active' : ''}`}
          title={showHidden ? 'Hide hidden files' : 'Show hidden files'}
          onClick={() => {
            setShowHidden(!showHidden);
            triggerRefresh();
          }}
        >
          {showHidden ? <Eye size={18} /> : <EyeOff size={18} />}
        </button>
      </div>

      <div className="toolbar-group">
        <button
          className="toolbar-button"
          onClick={() => setShowSettings(true)}
          title="Settings"
        >
          <Settings size={18} />
        </button>
      </div>

      {/* Settings Modal */}
      <SettingsModal isOpen={showSettings} onClose={() => setShowSettings(false)} />

      {/* Delete Confirmation Dialog */}
      {showDeleteConfirm && createPortal(
        <div className="dialog-overlay" onClick={handleDeleteCancel}>
          <div className="dialog" onClick={(e) => e.stopPropagation()}>
            <div className="dialog-header">
              <h3>Confirm Delete</h3>
            </div>
            <div className="dialog-body">
              <p>Are you sure you want to move {getSelectedFiles().length} item(s) to the Recycle Bin?</p>
            </div>
            <div className="dialog-footer">
              <button className="dialog-button secondary" onClick={handleDeleteCancel}>
                Cancel
              </button>
              <button className="dialog-button primary" onClick={handleDeleteConfirm}>
                Delete
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};
