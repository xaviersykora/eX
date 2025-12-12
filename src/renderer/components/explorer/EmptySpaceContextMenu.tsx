import React, { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  Folder,
  FileText,
  Terminal,
  FileCode,
  Link2,
  Clipboard,
  Star,
  Info,
  RotateCcw,
  ChevronRight,
  ShieldCheck,
} from 'lucide-react';
import './ContextMenu.css';

interface EmptySpaceContextMenuProps {
  x: number;
  y: number;
  currentPath: string;
  onAction: (actionId: string, data?: any) => void;
  onClose: () => void;
}

export const EmptySpaceContextMenu: React.FC<EmptySpaceContextMenuProps> = ({
  x,
  y,
  currentPath,
  onAction,
  onClose,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [showNewSubmenu, setShowNewSubmenu] = useState(false);
  const submenuTimeoutRef = useRef<number | null>(null);

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
    (actionId: string, data?: any) => {
      onAction(actionId, data);
      onClose();
    },
    [onAction, onClose]
  );

  const handleNewSubmenuEnter = () => {
    if (submenuTimeoutRef.current) {
      clearTimeout(submenuTimeoutRef.current);
    }
    setShowNewSubmenu(true);
  };

  const handleNewSubmenuLeave = () => {
    submenuTimeoutRef.current = window.setTimeout(() => {
      setShowNewSubmenu(false);
    }, 150);
  };

  const newItems = [
    { id: 'new-folder', label: 'Folder', icon: <Folder size={16} /> },
    { id: 'separator-new-1', separator: true },
    { id: 'new-txt', label: 'Text Document', icon: <FileText size={16} />, extension: '.txt' },
    { id: 'new-md', label: 'Markdown', icon: <FileText size={16} />, extension: '.md' },
    { id: 'separator-new-2', separator: true },
    { id: 'new-bat', label: 'Batch Script', icon: <Terminal size={16} />, extension: '.bat' },
    { id: 'new-ps1', label: 'PowerShell Script', icon: <Terminal size={16} />, extension: '.ps1' },
    { id: 'new-py', label: 'Python Script', icon: <FileCode size={16} />, extension: '.py' },
    { id: 'separator-new-3', separator: true },
    { id: 'new-shortcut', label: 'Shortcut', icon: <Link2 size={16} /> },
  ];

  return createPortal(
    <div
      ref={menuRef}
      className="context-menu"
      style={{ left: x, top: y }}
    >
      {/* New submenu */}
      <div
        className="context-menu-item has-submenu"
        onMouseEnter={handleNewSubmenuEnter}
        onMouseLeave={handleNewSubmenuLeave}
      >
        <span className="context-menu-icon"><Folder size={16} /></span>
        <span className="context-menu-label">New</span>
        <span className="context-menu-submenu-arrow"><ChevronRight size={14} /></span>

        {showNewSubmenu && (
          <div
            className="context-submenu"
            onMouseEnter={handleNewSubmenuEnter}
            onMouseLeave={handleNewSubmenuLeave}
          >
            {newItems.map((item) => {
              if (item.separator) {
                return <div key={item.id} className="context-menu-separator" />;
              }
              return (
                <button
                  key={item.id}
                  className="context-menu-item"
                  onClick={() => handleAction(item.id, { extension: item.extension })}
                >
                  <span className="context-menu-icon">{item.icon}</span>
                  <span className="context-menu-label">{item.label}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="context-menu-separator" />

      <button
        className="context-menu-item"
        onClick={() => handleAction('refresh')}
      >
        <span className="context-menu-icon"><RotateCcw size={16} /></span>
        <span className="context-menu-label">Refresh</span>
        <span className="context-menu-shortcut">F5</span>
      </button>

      <button
        className="context-menu-item"
        onClick={() => handleAction('paste')}
      >
        <span className="context-menu-icon"><Clipboard size={16} /></span>
        <span className="context-menu-label">Paste</span>
        <span className="context-menu-shortcut">Ctrl+V</span>
      </button>

      <div className="context-menu-separator" />

      <button
        className="context-menu-item"
        onClick={() => handleAction('open-terminal')}
      >
        <span className="context-menu-icon"><Terminal size={16} /></span>
        <span className="context-menu-label">Open in Terminal</span>
      </button>

      <button
        className="context-menu-item"
        onClick={() => handleAction('open-terminal-admin')}
      >
        <span className="context-menu-icon"><ShieldCheck size={16} /></span>
        <span className="context-menu-label">Open in Terminal (Admin)</span>
      </button>

      <button
        className="context-menu-item"
        onClick={() => handleAction('add-quick-access')}
      >
        <span className="context-menu-icon"><Star size={16} /></span>
        <span className="context-menu-label">Add to Quick Access</span>
      </button>

      <div className="context-menu-separator" />

      <button
        className="context-menu-item"
        onClick={() => handleAction('properties')}
      >
        <span className="context-menu-icon"><Info size={16} /></span>
        <span className="context-menu-label">Properties</span>
      </button>
    </div>,
    document.body
  );
};
