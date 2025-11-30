import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Plus, X } from 'lucide-react';
import { useTabStore, type Tab } from '../../store/tabStore';
import { WindowControls } from '../layout/WindowControls';
import './TabBar.css';

const TAB_BAR_HEIGHT = 40; // Height of the tab bar area for drop detection
const DRAG_THRESHOLD = 10; // Pixels to move before starting drag

export const TabBar: React.FC = () => {
  const { tabs, activeTabId, createTab, closeTab, setActiveTab, getTab, removeTab, addTab, replaceAllTabs } = useTabStore();

  const [dragState, setDragState] = useState<{
    isDragging: boolean;
    tabId: string | null;
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
    hasMoved: boolean;
  }>({
    isDragging: false,
    tabId: null,
    startX: 0,
    startY: 0,
    currentX: 0,
    currentY: 0,
    hasMoved: false,
  });

  const [isDropTarget, setIsDropTarget] = useState(false);
  const [currentWindowId, setCurrentWindowId] = useState<string | null>(null);
  const [hoverTargetWindowId, setHoverTargetWindowId] = useState<string | null>(null);
  const dragPreviewRef = useRef<HTMLDivElement | null>(null);

  // Get current window ID on mount
  useEffect(() => {
    window.xplorer.window.getId().then(setCurrentWindowId);
  }, []);

  // Listen for tabs from other windows
  useEffect(() => {
    const unsubInit = window.xplorer.tabs.onInitWithData((tabData) => {
      // This window was created with a tab - replace default tab
      replaceAllTabs(tabData);
    });

    const unsubReceive = window.xplorer.tabs.onReceive((tabData) => {
      // Tab transferred from another window - add it
      addTab(tabData);
    });

    const unsubDropIndicator = window.xplorer.tabs.onDropIndicator((show) => {
      // Another window is dragging a tab over our tab bar
      setIsDropTarget(show);
    });

    return () => {
      unsubInit();
      unsubReceive();
      unsubDropIndicator();
    };
  }, [replaceAllTabs, addTab]);

  const handleMiddleClick = (e: React.MouseEvent, tabId: string) => {
    if (e.button === 1) {
      e.preventDefault();
      closeTab(tabId);
    }
  };

  const handleMouseDown = (e: React.MouseEvent, tabId: string) => {
    // Only left click for dragging
    if (e.button !== 0) return;

    setDragState({
      isDragging: true,
      tabId,
      startX: e.screenX,
      startY: e.screenY,
      currentX: e.screenX,
      currentY: e.screenY,
      hasMoved: false,
    });
  };

  const handleMouseMove = useCallback(async (e: MouseEvent) => {
    if (!dragState.isDragging || !dragState.tabId) return;

    const deltaX = Math.abs(e.screenX - dragState.startX);
    const deltaY = Math.abs(e.screenY - dragState.startY);

    // Check if we've moved enough to start the drag
    if (!dragState.hasMoved && (deltaX > DRAG_THRESHOLD || deltaY > DRAG_THRESHOLD)) {
      setDragState((prev) => ({ ...prev, hasMoved: true }));
    }

    if (dragState.hasMoved || deltaX > DRAG_THRESHOLD || deltaY > DRAG_THRESHOLD) {
      setDragState((prev) => ({
        ...prev,
        currentX: e.screenX,
        currentY: e.screenY,
        hasMoved: true,
      }));

      // Check if hovering over another window's tab bar
      const allWindowIds = await window.xplorer.window.getAllIds();
      let foundTargetId: string | null = null;

      for (const windowId of allWindowIds) {
        if (windowId === currentWindowId) continue;

        const bounds = await window.xplorer.window.getBounds(windowId);
        if (!bounds) continue;

        // Check if mouse is within the tab bar area of this window
        if (
          e.screenX >= bounds.x &&
          e.screenX <= bounds.x + bounds.width &&
          e.screenY >= bounds.y &&
          e.screenY <= bounds.y + TAB_BAR_HEIGHT
        ) {
          foundTargetId = windowId;
          break;
        }
      }

      // Update drop indicator on target windows
      if (foundTargetId !== hoverTargetWindowId) {
        // Hide indicator on previous target
        if (hoverTargetWindowId) {
          window.xplorer.window.showDropIndicator(hoverTargetWindowId, false);
        }
        // Show indicator on new target
        if (foundTargetId) {
          window.xplorer.window.showDropIndicator(foundTargetId, true);
        }
        setHoverTargetWindowId(foundTargetId);
      }
    }
  }, [dragState.isDragging, dragState.tabId, dragState.startX, dragState.startY, dragState.hasMoved, currentWindowId, hoverTargetWindowId]);

  const handleMouseUp = useCallback(async (e: MouseEvent) => {
    if (!dragState.isDragging || !dragState.tabId) {
      setDragState({
        isDragging: false,
        tabId: null,
        startX: 0,
        startY: 0,
        currentX: 0,
        currentY: 0,
        hasMoved: false,
      });
      return;
    }

    const tab = getTab(dragState.tabId);
    if (!tab || !dragState.hasMoved) {
      setDragState({
        isDragging: false,
        tabId: null,
        startX: 0,
        startY: 0,
        currentX: 0,
        currentY: 0,
        hasMoved: false,
      });
      return;
    }

    // Check if dropped on another window's tab bar
    const allWindowIds = await window.xplorer.window.getAllIds();
    let targetWindowId: string | null = null;

    for (const windowId of allWindowIds) {
      if (windowId === currentWindowId) continue;

      const bounds = await window.xplorer.window.getBounds(windowId);
      if (!bounds) continue;

      // Check if mouse is within the tab bar area of this window
      if (
        e.screenX >= bounds.x &&
        e.screenX <= bounds.x + bounds.width &&
        e.screenY >= bounds.y &&
        e.screenY <= bounds.y + TAB_BAR_HEIGHT
      ) {
        targetWindowId = windowId;
        break;
      }
    }

    const tabData: Tab = {
      id: tab.id,
      path: tab.path,
      title: tab.title,
      history: tab.history,
      historyIndex: tab.historyIndex,
    };

    if (targetWindowId) {
      // Transfer tab to another window
      window.xplorer.window.transferTab(targetWindowId, tabData);
      window.xplorer.window.focus(targetWindowId);
      removeTab(tab.id);
    } else {
      // Check if dragged outside all windows - create new window
      let isOutsideAllWindows = true;

      for (const windowId of allWindowIds) {
        const bounds = await window.xplorer.window.getBounds(windowId);
        if (!bounds) continue;

        if (
          e.screenX >= bounds.x &&
          e.screenX <= bounds.x + bounds.width &&
          e.screenY >= bounds.y &&
          e.screenY <= bounds.y + bounds.height
        ) {
          isOutsideAllWindows = false;
          break;
        }
      }

      if (isOutsideAllWindows && tabs.length > 1) {
        // Create new window with this tab
        await window.xplorer.window.createWithTab(tabData, e.screenX, e.screenY);
        removeTab(tab.id);
      }
    }

    // Clear drop indicator on any target window
    if (hoverTargetWindowId) {
      window.xplorer.window.showDropIndicator(hoverTargetWindowId, false);
      setHoverTargetWindowId(null);
    }

    setDragState({
      isDragging: false,
      tabId: null,
      startX: 0,
      startY: 0,
      currentX: 0,
      currentY: 0,
      hasMoved: false,
    });
  }, [dragState, tabs.length, currentWindowId, getTab, removeTab, hoverTargetWindowId]);

  // Set up global mouse event listeners when dragging
  useEffect(() => {
    if (dragState.isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);

      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [dragState.isDragging, handleMouseMove, handleMouseUp]);

  // Create/update drag preview
  useEffect(() => {
    if (dragState.isDragging && dragState.hasMoved && dragState.tabId) {
      const tab = getTab(dragState.tabId);
      if (!tab) return;

      if (!dragPreviewRef.current) {
        const preview = document.createElement('div');
        preview.className = 'tab-drag-preview';
        preview.textContent = tab.title;
        document.body.appendChild(preview);
        dragPreviewRef.current = preview;
      }

      const preview = dragPreviewRef.current;
      // Position relative to viewport using clientX/Y from the last known position
      preview.style.left = `${dragState.currentX - dragState.startX + 50}px`;
      preview.style.top = `${dragState.currentY - dragState.startY + 50}px`;
      preview.style.position = 'fixed';
      preview.style.transform = 'translate(-50%, -50%)';
    } else {
      if (dragPreviewRef.current) {
        dragPreviewRef.current.remove();
        dragPreviewRef.current = null;
      }
    }

    return () => {
      if (dragPreviewRef.current) {
        dragPreviewRef.current.remove();
        dragPreviewRef.current = null;
      }
    };
  }, [dragState.isDragging, dragState.hasMoved, dragState.tabId, dragState.currentX, dragState.currentY, getTab, dragState.startX, dragState.startY]);

  return (
    <div className={`tabbar ${isDropTarget ? 'drop-target' : ''}`}>
      <div className="tabbar-tabs">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={`tab ${tab.id === activeTabId ? 'active' : ''} ${
              dragState.isDragging && dragState.tabId === tab.id && dragState.hasMoved ? 'dragging' : ''
            }`}
            onClick={() => !dragState.hasMoved && setActiveTab(tab.id)}
            onMouseDown={(e) => {
              handleMiddleClick(e, tab.id);
              handleMouseDown(e, tab.id);
            }}
          >
            <span className="tab-title" title={tab.path}>
              {tab.title}
            </span>
            <button
              className="tab-close"
              onClick={(e) => {
                e.stopPropagation();
                closeTab(tab.id);
              }}
              title="Close tab"
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>

      <button
        className="tabbar-new"
        onClick={() => createTab()}
        title="New tab (Ctrl+T)"
      >
        <Plus size={16} />
      </button>

      <WindowControls />
    </div>
  );
};
