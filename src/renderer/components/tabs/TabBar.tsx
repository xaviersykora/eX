import React, { useRef, useEffect, useCallback, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { useSharedState } from '../../contexts/StateProvider';
import { WindowControls } from '../layout/WindowControls';
import './TabBar.css';

const TAB_BAR_HEIGHT = 40;
const DRAG_THRESHOLD = 10;

interface TabData {
  id: string;
  path: string;
  title: string;
  history: string[];
  historyIndex: number;
}

export const TabBar: React.FC = () => {
  const { tabState, tabs: tabActions } = useSharedState();
  const { tabs, activeTabId } = tabState;

  // Track maximized state synchronously
  const [isMaximized, setIsMaximized] = useState(false);

  // Current window ID for tab drag detection
  const [currentWindowId, setCurrentWindowId] = useState<string | null>(null);

  // Drop target indicator
  const [isDropTarget, setIsDropTarget] = useState(false);

  // Tab drag state
  const [tabDragState, setTabDragState] = useState<{
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

  const [hoverTargetWindowId, setHoverTargetWindowId] = useState<string | null>(null);
  const dragPreviewShownRef = useRef(false);

  // Refs for custom window drag handling
  const isWindowDraggingRef = useRef(false);
  const windowDragStartRef = useRef<{ mouseX: number; mouseY: number; windowX: number; windowY: number } | null>(null);
  const hasWindowDragThresholdRef = useRef(false);
  const pendingWindowDragRef = useRef<{ screenX: number; screenY: number; isMaximized: boolean } | null>(null);

  // Get current window ID on mount
  useEffect(() => {
    window.xplorer.window.getId().then(setCurrentWindowId);
  }, []);

  // Subscribe to maximize state changes
  useEffect(() => {
    window.xplorer.window.isMaximized().then(setIsMaximized);
    const unsubscribe = window.xplorer.window.onMaximizeChange(setIsMaximized);
    return () => unsubscribe();
  }, []);

  // Subscribe to tab events (receive, drop indicator)
  useEffect(() => {
    const unsubDropIndicator = window.xplorer.tabs.onDropIndicator((show) => {
      setIsDropTarget(show);
    });

    return () => {
      unsubDropIndicator();
    };
  }, []);

  const handleMiddleClick = (e: React.MouseEvent, tabId: string) => {
    if (e.button === 1) {
      e.preventDefault();
      tabActions.close(tabId);
    }
  };

  // --- Tab Drag Handling ---
  const handleTabMouseDown = (e: React.MouseEvent, tabId: string) => {
    if (e.button !== 0) return;

    // Prevent window drag when clicking on a tab
    e.stopPropagation();

    setTabDragState({
      isDragging: true,
      tabId,
      startX: e.screenX,
      startY: e.screenY,
      currentX: e.screenX,
      currentY: e.screenY,
      hasMoved: false,
    });
  };

  const handleTabMouseMove = useCallback(async (e: MouseEvent) => {
    if (!tabDragState.isDragging || !tabDragState.tabId) return;

    const deltaX = Math.abs(e.screenX - tabDragState.startX);
    const deltaY = Math.abs(e.screenY - tabDragState.startY);

    if (!tabDragState.hasMoved && (deltaX > DRAG_THRESHOLD || deltaY > DRAG_THRESHOLD)) {
      setTabDragState((prev) => ({ ...prev, hasMoved: true }));
    }

    if (tabDragState.hasMoved || deltaX > DRAG_THRESHOLD || deltaY > DRAG_THRESHOLD) {
      setTabDragState((prev) => ({
        ...prev,
        currentX: e.screenX,
        currentY: e.screenY,
        hasMoved: true,
      }));

      // Show or update drag preview overlay
      const tab = tabs.find(t => t.id === tabDragState.tabId);
      if (tab) {
        if (!dragPreviewShownRef.current) {
          window.xplorer.dragPreview.show(tab.title, e.screenX, e.screenY);
          dragPreviewShownRef.current = true;
        } else {
          window.xplorer.dragPreview.update(e.screenX, e.screenY);
        }
      }

      // Check for target windows
      const allWindowIds = await window.xplorer.window.getAllIds();
      let foundTargetId: string | null = null;

      for (const windowId of allWindowIds) {
        if (windowId === currentWindowId) continue;

        const bounds = await window.xplorer.window.getBounds(windowId);
        if (!bounds) continue;

        // Check if cursor is within the tab bar area of this window
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

      // Update drop indicators
      if (foundTargetId !== hoverTargetWindowId) {
        if (hoverTargetWindowId) {
          window.xplorer.window.showDropIndicator(hoverTargetWindowId, false);
        }
        if (foundTargetId) {
          window.xplorer.window.showDropIndicator(foundTargetId, true);
        }
        setHoverTargetWindowId(foundTargetId);
      }
    }
  }, [tabDragState.isDragging, tabDragState.tabId, tabDragState.startX, tabDragState.startY, tabDragState.hasMoved, currentWindowId, hoverTargetWindowId]);

  const handleTabMouseUp = useCallback(async (e: MouseEvent) => {
    if (!tabDragState.isDragging || !tabDragState.tabId) {
      setTabDragState({
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

    const tab = tabs.find(t => t.id === tabDragState.tabId);
    if (!tab || !tabDragState.hasMoved) {
      // No movement - just a click, activate the tab
      if (tab && !tabDragState.hasMoved) {
        tabActions.setActive(tab.id);
      }
      setTabDragState({
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

    // Check for target window
    const allWindowIds = await window.xplorer.window.getAllIds();
    let targetWindowId: string | null = null;

    for (const windowId of allWindowIds) {
      if (windowId === currentWindowId) continue;

      const bounds = await window.xplorer.window.getBounds(windowId);
      if (!bounds) continue;

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

    const tabData: TabData = {
      id: tab.id,
      path: tab.path,
      title: tab.title,
      history: tab.history,
      historyIndex: tab.historyIndex,
    };

    if (targetWindowId) {
      // Transfer tab to target window using the new transferTab method
      window.xplorer.tabs.transferTab(tab.id, targetWindowId);
      window.xplorer.window.focus(targetWindowId);
    } else {
      // Check if dropped outside all windows - create new window
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

      // Only create new window if we have more than one tab
      if (isOutsideAllWindows && tabs.length > 1) {
        // Remove tab from current window first, then create new window with it
        window.xplorer.tabs.removeTab(tab.id);
        await window.xplorer.window.createWithTab(tabData, e.screenX, e.screenY);
      }
    }

    // Clean up drop indicators and drag preview
    if (hoverTargetWindowId) {
      window.xplorer.window.showDropIndicator(hoverTargetWindowId, false);
      setHoverTargetWindowId(null);
    }

    // Hide drag preview overlay
    window.xplorer.dragPreview.hide();
    dragPreviewShownRef.current = false;

    setTabDragState({
      isDragging: false,
      tabId: null,
      startX: 0,
      startY: 0,
      currentX: 0,
      currentY: 0,
      hasMoved: false,
    });
  }, [tabDragState, tabs, currentWindowId, hoverTargetWindowId, tabActions]);

  // Set up tab drag event listeners
  useEffect(() => {
    if (tabDragState.isDragging) {
      document.addEventListener('mousemove', handleTabMouseMove);
      document.addEventListener('mouseup', handleTabMouseUp);

      return () => {
        document.removeEventListener('mousemove', handleTabMouseMove);
        document.removeEventListener('mouseup', handleTabMouseUp);
      };
    }
  }, [tabDragState.isDragging, handleTabMouseMove, handleTabMouseUp]);

  // Clean up drag preview on unmount
  useEffect(() => {
    return () => {
      if (dragPreviewShownRef.current) {
        window.xplorer.dragPreview.hide();
        dragPreviewShownRef.current = false;
      }
    };
  }, []);

  // --- Window Drag Handling (for title bar) ---
  const handleWindowMouseMove = useCallback((e: MouseEvent) => {
    // Check if we have a pending drag that hasn't met threshold yet
    if (pendingWindowDragRef.current && !hasWindowDragThresholdRef.current) {
      const deltaX = Math.abs(e.screenX - pendingWindowDragRef.current.screenX);
      const deltaY = Math.abs(e.screenY - pendingWindowDragRef.current.screenY);

      if (deltaX >= DRAG_THRESHOLD || deltaY >= DRAG_THRESHOLD) {
        hasWindowDragThresholdRef.current = true;
        const { screenX, screenY, isMaximized: wasMaximized } = pendingWindowDragRef.current;

        if (wasMaximized) {
          window.xplorer.window.dragUnmaximize(screenX, screenY).then((newBounds) => {
            if (newBounds) {
              isWindowDraggingRef.current = true;
              windowDragStartRef.current = {
                mouseX: screenX,
                mouseY: screenY,
                windowX: newBounds.x,
                windowY: newBounds.y,
              };
              const currentDeltaX = e.screenX - screenX;
              const currentDeltaY = e.screenY - screenY;
              window.xplorer.window.setPosition(newBounds.x + currentDeltaX, newBounds.y + currentDeltaY);
            }
          });
        } else {
          window.xplorer.window.getPosition().then((pos) => {
            if (pos) {
              isWindowDraggingRef.current = true;
              windowDragStartRef.current = {
                mouseX: screenX,
                mouseY: screenY,
                windowX: pos.x,
                windowY: pos.y,
              };
              const currentDeltaX = e.screenX - screenX;
              const currentDeltaY = e.screenY - screenY;
              window.xplorer.window.setPosition(pos.x + currentDeltaX, pos.y + currentDeltaY);
            }
          });
        }
      }
      return;
    }

    if (!isWindowDraggingRef.current || !windowDragStartRef.current) return;

    const deltaX = e.screenX - windowDragStartRef.current.mouseX;
    const deltaY = e.screenY - windowDragStartRef.current.mouseY;

    const newX = windowDragStartRef.current.windowX + deltaX;
    const newY = windowDragStartRef.current.windowY + deltaY;

    window.xplorer.window.setPosition(newX, newY);
  }, []);

  const handleWindowMouseUp = useCallback(() => {
    isWindowDraggingRef.current = false;
    windowDragStartRef.current = null;
    hasWindowDragThresholdRef.current = false;
    pendingWindowDragRef.current = null;
    document.removeEventListener('mousemove', handleWindowMouseMove);
    document.removeEventListener('mouseup', handleWindowMouseUp);
  }, [handleWindowMouseMove]);

  useEffect(() => {
    return () => {
      document.removeEventListener('mousemove', handleWindowMouseMove);
      document.removeEventListener('mouseup', handleWindowMouseUp);
    };
  }, [handleWindowMouseMove, handleWindowMouseUp]);

  const handleTitleBarMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;

    const target = e.target as HTMLElement;
    if (target.closest('.tabbar-tabs') || target.closest('.tabbar-new') || target.closest('.window-controls')) {
      return;
    }

    e.preventDefault();

    pendingWindowDragRef.current = {
      screenX: e.screenX,
      screenY: e.screenY,
      isMaximized,
    };
    hasWindowDragThresholdRef.current = false;

    document.addEventListener('mousemove', handleWindowMouseMove);
    document.addEventListener('mouseup', handleWindowMouseUp);
  };

  const handleTitleBarDoubleClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('.tabbar-tabs') || target.closest('.tabbar-new') || target.closest('.window-controls')) {
      return;
    }

    window.xplorer.window.maximize();
  };

  return (
    <div
      className={`tabbar ${isDropTarget ? 'drop-target' : ''}`}
      onMouseDown={handleTitleBarMouseDown}
      onDoubleClick={handleTitleBarDoubleClick}
    >
      <div className="tabbar-tabs">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={`tab ${tab.id === activeTabId ? 'active' : ''} ${
              tabDragState.isDragging && tabDragState.tabId === tab.id && tabDragState.hasMoved ? 'dragging' : ''
            }`}
            onClick={() => !tabDragState.hasMoved && tabActions.setActive(tab.id)}
            onMouseDown={(e) => {
              handleMiddleClick(e, tab.id);
              handleTabMouseDown(e, tab.id);
            }}
          >
            <span className="tab-title" title={tab.path}>
              {tab.title}
            </span>
            {tabs.length > 1 && (
              <button
                className="tab-close"
                onClick={(e) => {
                  e.stopPropagation();
                  tabActions.close(tab.id);
                }}
                title="Close tab"
              >
                <X size={14} />
              </button>
            )}
          </div>
        ))}
      </div>

      <button
        className="tabbar-new"
        onClick={() => tabActions.create()}
        title="New tab (Ctrl+T)"
      >
        <Plus size={16} />
      </button>

      {/* Spacer to create draggable empty space */}
      <div className="tabbar-spacer" />

      <WindowControls />
    </div>
  );
};
