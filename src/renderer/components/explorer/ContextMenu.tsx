import React, { useEffect, useRef, useCallback, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  FolderOpen,
  ExternalLink,
  FolderPlus,
  Plus,
  Link,
  Scissors,
  Copy,
  Trash2,
  FileEdit,
  FileText,
  Terminal,
  ShieldCheck,
  Star,
  Clipboard,
  Palette,
  Archive,
  ChevronRight,
  FileArchive,
  PackagePlus,
} from 'lucide-react';
import type { FileInfo } from '@shared/types';
import './ContextMenu.css';

export interface ContextMenuAction {
  id: string;
  label: string;
  icon?: React.ReactNode;
  shortcut?: string;
  disabled?: boolean;
  danger?: boolean;
  separator?: boolean;
  submenu?: ContextMenuAction[];
}

interface ContextMenuProps {
  x: number;
  y: number;
  files: FileInfo[];
  onAction: (actionId: string, files: FileInfo[]) => void;
  onClose: () => void;
  sevenZipInstalled?: boolean;
}

// Archive extensions that can be opened with 7-Zip
const ARCHIVE_EXTENSIONS = new Set([
  '.7z', '.zip', '.rar', '.tar', '.gz', '.bz2', '.xz',
  '.cab', '.iso', '.wim', '.arj', '.lzh', '.lzma',
]);

export const ContextMenu: React.FC<ContextMenuProps> = ({
  x,
  y,
  files,
  onAction,
  onClose,
  sevenZipInstalled = false,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [activeSubmenu, setActiveSubmenu] = useState<string | null>(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  // Adjust position to keep menu in viewport
  useEffect(() => {
    if (menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      let adjustedX = x;
      let adjustedY = y;

      if (x + rect.width > viewportWidth) {
        adjustedX = viewportWidth - rect.width - 8;
      }

      if (y + rect.height > viewportHeight) {
        adjustedY = viewportHeight - rect.height - 8;
      }

      menuRef.current.style.left = `${Math.max(8, adjustedX)}px`;
      menuRef.current.style.top = `${Math.max(8, adjustedY)}px`;
    }
  }, [x, y]);

  const handleAction = useCallback(
    (actionId: string) => {
      onAction(actionId, files);
      onClose();
    },
    [onAction, files, onClose]
  );

  // Determine menu items based on selection
  const isSingleSelection = files.length === 1;
  const isFolder = isSingleSelection && files[0].isDirectory;
  const isFile = isSingleSelection && !files[0].isDirectory;
  const hasSelection = files.length > 0;

  const menuItems: ContextMenuAction[] = [];

  if (isFolder) {
    // Folder-specific menu items
    menuItems.push(
      { id: 'open', label: 'Open', icon: <FolderOpen size={16} />, shortcut: 'Enter' },
      { id: 'open-new-tab', label: 'Open in new tab', icon: <Plus size={16} /> },
      { id: 'open-new-window', label: 'Open in new window', icon: <ExternalLink size={16} /> },
      { id: 'open-with', label: 'Open with...', icon: <ExternalLink size={16} /> },
      { id: 'separator-1', label: '', separator: true },
      { id: 'add-quick-access', label: 'Add to Quick Access', icon: <Star size={16} /> },
      { id: 'separator-2', label: '', separator: true },
      { id: 'open-terminal', label: 'Open in Terminal', icon: <Terminal size={16} /> },
      { id: 'open-terminal-admin', label: 'Open in Terminal (Admin)', icon: <ShieldCheck size={16} /> },
      { id: 'separator-3', label: '', separator: true },
    );
  } else if (isFile) {
    // File-specific menu items
    menuItems.push(
      { id: 'open', label: 'Open', icon: <FolderOpen size={16} />, shortcut: 'Enter' },
      { id: 'open-with', label: 'Open with...', icon: <ExternalLink size={16} /> },
      { id: 'separator-1', label: '', separator: true },
    );
  } else if (hasSelection) {
    // Multiple selection
    menuItems.push(
      { id: 'open', label: 'Open', icon: <FolderOpen size={16} />, shortcut: 'Enter' },
      { id: 'open-with', label: 'Open with...', icon: <ExternalLink size={16} /> },
      { id: 'separator-1', label: '', separator: true },
    );
  }

  // Check if any selected file is an archive (for "Open archive" option)
  const hasArchive = files.some(f => {
    const ext = f.extension?.toLowerCase() || '';
    return ARCHIVE_EXTENSIONS.has(ext.startsWith('.') ? ext : `.${ext}`);
  });

  // Build 7-Zip submenu if installed
  const sevenZipSubmenu: ContextMenuAction[] = [];
  if (sevenZipInstalled) {
    // Get base name for archive naming
    const baseName = files.length === 1
      ? files[0].name.replace(/\.[^/.]+$/, '')
      : 'archive';

    sevenZipSubmenu.push(
      { id: '7z-add-to-archive', label: 'Add to archive...', icon: <PackagePlus size={16} /> },
      { id: '7z-add-to-zip', label: `Add to "${baseName}.zip"`, icon: <FileArchive size={16} /> },
      { id: '7z-add-to-7z', label: `Add to "${baseName}.7z"`, icon: <FileArchive size={16} /> },
    );

    if (hasArchive && isSingleSelection) {
      // Get archive name without extension for extract folder name
      const archiveName = files[0].name.replace(/\.[^/.]+$/, '');
      sevenZipSubmenu.push(
        { id: 'separator-7z', label: '', separator: true },
        { id: '7z-open-archive', label: 'Open archive', icon: <FolderOpen size={16} /> },
        { id: '7z-extract-to-folder', label: `Extract to "${archiveName}\\"`, icon: <Archive size={16} /> },
      );
    }
  }

  // Common items for all selections
  if (hasSelection) {
    // Add 7-Zip submenu if installed
    if (sevenZipInstalled && sevenZipSubmenu.length > 0) {
      menuItems.push(
        { id: '7zip', label: '7-Zip', icon: <Archive size={16} />, submenu: sevenZipSubmenu },
        { id: 'separator-7zip', label: '', separator: true },
      );
    }

    menuItems.push(
      { id: 'copy-path', label: 'Copy as path', icon: <Clipboard size={16} /> },
      { id: 'new-folder-with-selection', label: 'New folder with selection', icon: <FolderPlus size={16} /> },
      { id: 'create-shortcut', label: 'Create shortcut', icon: <Link size={16} /> },
      { id: 'separator-4', label: '', separator: true },
      { id: 'cut', label: 'Cut', icon: <Scissors size={16} />, shortcut: 'Ctrl+X' },
      { id: 'copy', label: 'Copy', icon: <Copy size={16} />, shortcut: 'Ctrl+C' },
      { id: 'separator-5', label: '', separator: true },
      { id: 'delete', label: 'Delete', icon: <Trash2 size={16} />, shortcut: 'Del', danger: true },
    );

    if (isSingleSelection) {
      menuItems.push(
        { id: 'rename', label: 'Rename', icon: <FileEdit size={16} />, shortcut: 'F2' },
      );
    }

    // Only allow customization on single selection
    if (isSingleSelection) {
      menuItems.push(
        { id: 'customize', label: 'Customize', icon: <Palette size={16} /> },
      );
    }

    menuItems.push(
      { id: 'separator-6', label: '', separator: true },
      { id: 'properties', label: 'Properties', icon: <FileText size={16} />, shortcut: 'Alt+Enter' },
    );
  }

  const renderMenuItem = (item: ContextMenuAction) => {
    if (item.separator) {
      return <div key={item.id} className="context-menu-separator" />;
    }

    // Item with submenu
    if (item.submenu && item.submenu.length > 0) {
      return (
        <div
          key={item.id}
          className="context-menu-item-wrapper"
          onMouseEnter={() => setActiveSubmenu(item.id)}
          // No onMouseLeave - submenu stays open once triggered
        >
          <div
            className={`context-menu-item has-submenu ${activeSubmenu === item.id ? 'submenu-open' : ''}`}
          >
            <span className="context-menu-icon">{item.icon}</span>
            <span className="context-menu-label">{item.label}</span>
            <span className="context-menu-arrow"><ChevronRight size={14} /></span>
          </div>

          {activeSubmenu === item.id && (
            <div className="context-submenu">
              {item.submenu.map((subItem) => {
                if (subItem.separator) {
                  return <div key={subItem.id} className="context-menu-separator" />;
                }
                return (
                  <button
                    key={subItem.id}
                    className={`context-menu-item ${subItem.danger ? 'danger' : ''} ${subItem.disabled ? 'disabled' : ''}`}
                    onClick={() => !subItem.disabled && handleAction(subItem.id)}
                    disabled={subItem.disabled}
                  >
                    <span className="context-menu-icon">{subItem.icon}</span>
                    <span className="context-menu-label">{subItem.label}</span>
                    {subItem.shortcut && (
                      <span className="context-menu-shortcut">{subItem.shortcut}</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      );
    }

    // Regular item - close any open submenu when hovering
    return (
      <button
        key={item.id}
        className={`context-menu-item ${item.danger ? 'danger' : ''} ${item.disabled ? 'disabled' : ''}`}
        onClick={() => !item.disabled && handleAction(item.id)}
        onMouseEnter={() => setActiveSubmenu(null)}
        disabled={item.disabled}
      >
        <span className="context-menu-icon">{item.icon}</span>
        <span className="context-menu-label">{item.label}</span>
        {item.shortcut && (
          <span className="context-menu-shortcut">{item.shortcut}</span>
        )}
      </button>
    );
  };

  // Use portal to render at document.body level
  // This avoids stacking context issues with backdrop-filter in glass mode
  return createPortal(
    <div
      ref={menuRef}
      className="context-menu"
      style={{ left: x, top: y }}
    >
      {menuItems.map(renderMenuItem)}
    </div>,
    document.body
  );
};
