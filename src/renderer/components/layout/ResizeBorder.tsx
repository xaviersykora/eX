import React, { useCallback, useRef, useEffect, useState } from 'react';
import './ResizeBorder.css';

type ResizeDirection = 'n' | 's' | 'e' | 'w' | 'nw' | 'ne' | 'sw' | 'se';

interface ResizeState {
  direction: ResizeDirection;
  startX: number;
  startY: number;
  startBounds: { x: number; y: number; width: number; height: number };
}

export const ResizeBorder: React.FC = () => {
  const [isMaximized, setIsMaximized] = useState(false);
  const resizeStateRef = useRef<ResizeState | null>(null);
  const minSizeRef = useRef({ width: 800, height: 600 });

  // Track maximized state - don't show resize borders when maximized
  useEffect(() => {
    window.xplorer.window.isMaximized().then(setIsMaximized);
    const unsubscribe = window.xplorer.window.onMaximizeChange(setIsMaximized);

    // Get minimum size
    window.xplorer.window.getMinimumSize().then((size) => {
      minSizeRef.current = size;
    });

    return () => unsubscribe();
  }, []);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!resizeStateRef.current) return;

    const { direction, startX, startY, startBounds } = resizeStateRef.current;
    const deltaX = e.screenX - startX;
    const deltaY = e.screenY - startY;
    const minWidth = minSizeRef.current.width;
    const minHeight = minSizeRef.current.height;

    let newBounds = { ...startBounds };

    // Calculate new bounds based on resize direction
    switch (direction) {
      case 'n':
        newBounds.y = startBounds.y + deltaY;
        newBounds.height = Math.max(minHeight, startBounds.height - deltaY);
        if (newBounds.height === minHeight) {
          newBounds.y = startBounds.y + startBounds.height - minHeight;
        }
        break;
      case 's':
        newBounds.height = Math.max(minHeight, startBounds.height + deltaY);
        break;
      case 'w':
        newBounds.x = startBounds.x + deltaX;
        newBounds.width = Math.max(minWidth, startBounds.width - deltaX);
        if (newBounds.width === minWidth) {
          newBounds.x = startBounds.x + startBounds.width - minWidth;
        }
        break;
      case 'e':
        newBounds.width = Math.max(minWidth, startBounds.width + deltaX);
        break;
      case 'nw':
        newBounds.y = startBounds.y + deltaY;
        newBounds.height = Math.max(minHeight, startBounds.height - deltaY);
        if (newBounds.height === minHeight) {
          newBounds.y = startBounds.y + startBounds.height - minHeight;
        }
        newBounds.x = startBounds.x + deltaX;
        newBounds.width = Math.max(minWidth, startBounds.width - deltaX);
        if (newBounds.width === minWidth) {
          newBounds.x = startBounds.x + startBounds.width - minWidth;
        }
        break;
      case 'ne':
        newBounds.y = startBounds.y + deltaY;
        newBounds.height = Math.max(minHeight, startBounds.height - deltaY);
        if (newBounds.height === minHeight) {
          newBounds.y = startBounds.y + startBounds.height - minHeight;
        }
        newBounds.width = Math.max(minWidth, startBounds.width + deltaX);
        break;
      case 'sw':
        newBounds.height = Math.max(minHeight, startBounds.height + deltaY);
        newBounds.x = startBounds.x + deltaX;
        newBounds.width = Math.max(minWidth, startBounds.width - deltaX);
        if (newBounds.width === minWidth) {
          newBounds.x = startBounds.x + startBounds.width - minWidth;
        }
        break;
      case 'se':
        newBounds.height = Math.max(minHeight, startBounds.height + deltaY);
        newBounds.width = Math.max(minWidth, startBounds.width + deltaX);
        break;
    }

    window.xplorer.window.setBounds(newBounds);
  }, []);

  const handleMouseUp = useCallback(() => {
    resizeStateRef.current = null;
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = '';
  }, [handleMouseMove]);

  const handleResizeStart = useCallback(async (e: React.MouseEvent, direction: ResizeDirection) => {
    e.preventDefault();
    e.stopPropagation();

    const bounds = await window.xplorer.window.getBoundsLocal();
    if (!bounds) return;

    resizeStateRef.current = {
      direction,
      startX: e.screenX,
      startY: e.screenY,
      startBounds: bounds,
    };

    // Set cursor on body to maintain it during drag
    const cursorMap: Record<ResizeDirection, string> = {
      n: 'ns-resize',
      s: 'ns-resize',
      e: 'ew-resize',
      w: 'ew-resize',
      nw: 'nwse-resize',
      se: 'nwse-resize',
      ne: 'nesw-resize',
      sw: 'nesw-resize',
    };
    document.body.style.cursor = cursorMap[direction];

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [handleMouseMove, handleMouseUp]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  // Don't render resize borders when maximized
  if (isMaximized) {
    return null;
  }

  return (
    <div className="resize-borders">
      {/* Edges */}
      <div className="resize-border resize-n" onMouseDown={(e) => handleResizeStart(e, 'n')} />
      <div className="resize-border resize-s" onMouseDown={(e) => handleResizeStart(e, 's')} />
      <div className="resize-border resize-e" onMouseDown={(e) => handleResizeStart(e, 'e')} />
      <div className="resize-border resize-w" onMouseDown={(e) => handleResizeStart(e, 'w')} />
      {/* Corners */}
      <div className="resize-border resize-nw" onMouseDown={(e) => handleResizeStart(e, 'nw')} />
      <div className="resize-border resize-ne" onMouseDown={(e) => handleResizeStart(e, 'ne')} />
      <div className="resize-border resize-sw" onMouseDown={(e) => handleResizeStart(e, 'sw')} />
      <div className="resize-border resize-se" onMouseDown={(e) => handleResizeStart(e, 'se')} />
    </div>
  );
};
