import React, { useCallback, useRef, useState, useEffect, memo } from 'react';
import { FixedSizeList as List } from 'react-window';
import { Folder, File, FileText, FileImage, FileVideo, FileAudio, FileCode, FileArchive, Check } from 'lucide-react';
import { useFileStore, type ColumnConfig } from '../../store/fileStore';
import { useTabStore } from '../../store/tabStore';
import { useSettingsStore, type CustomFileType, type DefaultTypeIcons, type FileCustomization } from '../../store/settingsStore';
import { useFolderSizeCacheStore } from '../../store/folderSizeCacheStore';
import { ContextMenu } from './ContextMenu';
import { EmptySpaceContextMenu } from './EmptySpaceContextMenu';
import { CustomizeDialog } from './CustomizeDialog';
import type { FileInfo, SortField } from '@shared/types';
import './FileList.css';

// Supported extensions for thumbnails
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.ico', '.tiff', '.tif']);
const VIDEO_EXTENSIONS = new Set(['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.webm', '.flv', '.m4v', '.mpg', '.mpeg']);

// Thumbnail cache to avoid re-fetching
const thumbnailCache = new Map<string, string>();

// Thumbnail component that lazily loads actual thumbnails
interface FileThumbnailProps {
  file: FileInfo;
  size: number;
  fallbackIcon: React.ReactNode;
}

const FileThumbnail: React.FC<FileThumbnailProps> = memo(({ file, size, fallbackIcon }) => {
  const [thumbnail, setThumbnail] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const ext = file.extension.toLowerCase();
  const supportsThumbnail = IMAGE_EXTENSIONS.has(ext) || VIDEO_EXTENSIONS.has(ext);

  useEffect(() => {
    if (!supportsThumbnail || file.isDirectory) {
      return;
    }

    // Create a cache key based on path, size, and modification time
    const cacheKey = `${file.path}:${size}:${file.modifiedAt}`;

    // Check cache first
    if (thumbnailCache.has(cacheKey)) {
      setThumbnail(thumbnailCache.get(cacheKey)!);
      return;
    }

    setLoading(true);
    setError(false);

    // Fetch thumbnail from backend
    window.xplorer.request('shell.thumbnail', { path: file.path, size })
      .then((response) => {
        if (response.success && response.data) {
          const base64Data = response.data as string;
          if (base64Data) {
            thumbnailCache.set(cacheKey, base64Data);
            setThumbnail(base64Data);
          } else {
            setError(true);
          }
        } else {
          setError(true);
        }
      })
      .catch(() => {
        setError(true);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [file.path, file.modifiedAt, size, supportsThumbnail, file.isDirectory]);

  // Show actual thumbnail if available
  if (thumbnail) {
    return (
      <img
        src={`data:image/png;base64,${thumbnail}`}
        alt={file.name}
        className="file-thumbnail-img"
        style={{ width: size, height: size, objectFit: 'contain' }}
      />
    );
  }

  // Show loading state or fallback icon
  if (loading) {
    return (
      <div className="file-thumbnail-loading" style={{ width: size, height: size }}>
        {fallbackIcon}
      </div>
    );
  }

  // Show fallback icon
  return <>{fallbackIcon}</>;
});

// Inline rename input component
interface InlineRenameProps {
  file: FileInfo;
  onComplete: (newName: string | null) => void;
}

const InlineRename: React.FC<InlineRenameProps> = ({ file, onComplete }) => {
  const [value, setValue] = useState(file.name);
  const inputRef = useRef<HTMLInputElement>(null);
  const completedRef = useRef(false);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
      // Select the name part without extension for files
      if (file.isDirectory) {
        inputRef.current.select();
      } else {
        const dotIndex = file.name.lastIndexOf('.');
        if (dotIndex > 0) {
          inputRef.current.setSelectionRange(0, dotIndex);
        } else {
          inputRef.current.select();
        }
      }
    }
  }, [file]);

  const handleComplete = useCallback((newName: string | null) => {
    // Prevent double-completion
    if (completedRef.current) return;
    completedRef.current = true;
    onComplete(newName);
  }, [onComplete]);

  const handleSubmit = useCallback((e?: React.FormEvent) => {
    e?.preventDefault();
    const trimmed = value.trim();
    if (trimmed && trimmed !== file.name) {
      handleComplete(trimmed);
    } else {
      handleComplete(null);
    }
  }, [value, file.name, handleComplete]);

  const handleBlur = useCallback(() => {
    // Save on blur (clicking away)
    handleSubmit();
  }, [handleSubmit]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      handleComplete(null);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
  }, [handleComplete, handleSubmit]);

  return (
    <form onSubmit={handleSubmit} className="inline-rename-form">
      <input
        ref={inputRef}
        type="text"
        className="inline-rename-input"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      />
    </form>
  );
};

interface FileListProps {
  onOpen: (file: FileInfo) => void;
}

const getFileIcon = (
  file: FileInfo,
  customFileTypes: CustomFileType[] = [],
  defaultTypeIcons: DefaultTypeIcons = {},
  size: number = 16,
  fileCustomization?: FileCustomization
): React.ReactNode => {
  // Check for individual file customization first (highest priority)
  if (fileCustomization) {
    if (fileCustomization.customIcon) {
      return <img src={fileCustomization.customIcon} alt="" style={{ width: size, height: size, objectFit: 'contain' }} className="file-icon" />;
    }
    if (fileCustomization.color) {
      if (file.isDirectory) {
        return <Folder size={size} className="file-icon" style={{ color: fileCustomization.color }} />;
      }
      return <File size={size} className="file-icon" style={{ color: fileCustomization.color }} />;
    }
  }

  if (file.isDirectory) {
    if (defaultTypeIcons.folder) {
      return <img src={defaultTypeIcons.folder} alt="" style={{ width: size, height: size, objectFit: 'contain' }} className="file-icon" />;
    }
    return <Folder size={size} className="file-icon folder" />;
  }

  const ext = file.extension.toLowerCase();

  // Check custom file types first
  for (const customType of customFileTypes) {
    if (customType.extensions.includes(ext)) {
      if (customType.customIcon) {
        return <img src={customType.customIcon} alt="" style={{ width: size, height: size, objectFit: 'contain' }} className="file-icon" />;
      }
      return <File size={size} className="file-icon" style={{ color: customType.color }} />;
    }
  }

  // Images
  if (['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg', '.ico'].includes(ext)) {
    if (defaultTypeIcons.image) {
      return <img src={defaultTypeIcons.image} alt="" style={{ width: size, height: size, objectFit: 'contain' }} className="file-icon" />;
    }
    return <FileImage size={size} className="file-icon image" />;
  }

  // Videos
  if (['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.webm'].includes(ext)) {
    if (defaultTypeIcons.video) {
      return <img src={defaultTypeIcons.video} alt="" style={{ width: size, height: size, objectFit: 'contain' }} className="file-icon" />;
    }
    return <FileVideo size={size} className="file-icon video" />;
  }

  // Audio
  if (['.mp3', '.wav', '.flac', '.ogg', '.m4a', '.aac'].includes(ext)) {
    if (defaultTypeIcons.audio) {
      return <img src={defaultTypeIcons.audio} alt="" style={{ width: size, height: size, objectFit: 'contain' }} className="file-icon" />;
    }
    return <FileAudio size={size} className="file-icon audio" />;
  }

  // Code
  if (['.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.c', '.cpp', '.h', '.cs', '.go', '.rs', '.rb', '.php', '.html', '.css', '.json', '.xml', '.yaml', '.yml'].includes(ext)) {
    if (defaultTypeIcons.code) {
      return <img src={defaultTypeIcons.code} alt="" style={{ width: size, height: size, objectFit: 'contain' }} className="file-icon" />;
    }
    return <FileCode size={size} className="file-icon code" />;
  }

  // Archives
  if (['.zip', '.rar', '.7z', '.tar', '.gz', '.bz2'].includes(ext)) {
    if (defaultTypeIcons.archive) {
      return <img src={defaultTypeIcons.archive} alt="" style={{ width: size, height: size, objectFit: 'contain' }} className="file-icon" />;
    }
    return <FileArchive size={size} className="file-icon archive" />;
  }

  // Text
  if (['.txt', '.md', '.log', '.ini', '.cfg', '.conf'].includes(ext)) {
    if (defaultTypeIcons.text) {
      return <img src={defaultTypeIcons.text} alt="" style={{ width: size, height: size, objectFit: 'contain' }} className="file-icon" />;
    }
    return <FileText size={size} className="file-icon text" />;
  }

  if (defaultTypeIcons.default) {
    return <img src={defaultTypeIcons.default} alt="" style={{ width: size, height: size, objectFit: 'contain' }} className="file-icon" />;
  }
  return <File size={size} className="file-icon default" />;
};

const formatSize = (bytes: number): string => {
  if (bytes === 0) return '';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

const formatDate = (timestamp: number): string => {
  const date = new Date(timestamp * 1000);
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const getFileType = (file: FileInfo): string => {
  if (file.isDirectory) return 'File folder';
  if (!file.extension) return 'File';
  return `${file.extension.slice(1).toUpperCase()} File`;
};

interface MarqueeState {
  isActive: boolean;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}


export const FileList: React.FC<FileListProps> = ({ onOpen }) => {
  const {
    files,
    selectedIds,
    select,
    selectRange,
    selectAll,
    clearSelection,
    loading,
    error,
    sortConfig,
    setSortConfig,
    viewMode,
    getSelectedFiles,
    triggerRefresh,
    editingPath,
    setEditingPath,
    columnConfig,
    toggleColumn,
    thumbnailSize,
    iconSize,
    setPendingNewFolderPath,
    folderSizes,
    loadingFolderSizes,
    setFolderSize,
    setLoadingFolderSize,
    clearFolderSizes,
  } = useFileStore();
  const { navigateTo, getCurrentPath } = useTabStore();
  const { customFileTypes, defaultTypeIcons, columnWidths, setColumnWidth, measureFolderSize, fileCustomizations, getFileCustomization } = useSettingsStore();

  const containerRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<List>(null);
  const [listHeight, setListHeight] = useState(400);

  // Marquee selection state
  const [marquee, setMarquee] = useState<MarqueeState>({
    isActive: false,
    startX: 0,
    startY: 0,
    currentX: 0,
    currentY: 0,
  });


  // Track files in marquee for selection
  const [marqueeSelectedPaths, setMarqueeSelectedPaths] = useState<Set<string>>(new Set());

  // Column context menu state
  const [columnMenuPos, setColumnMenuPos] = useState<{ x: number; y: number } | null>(null);

  // File context menu state
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    files: FileInfo[];
  } | null>(null);

  // Empty space context menu state
  const [emptySpaceMenu, setEmptySpaceMenu] = useState<{
    x: number;
    y: number;
  } | null>(null);

  // Customize dialog state
  const [customizeFile, setCustomizeFile] = useState<FileInfo | null>(null);

  // 7-Zip availability state
  const [sevenZipInstalled, setSevenZipInstalled] = useState(false);

  // Column resize state
  const [resizing, setResizing] = useState<{
    column: keyof typeof columnWidths;
    startX: number;
    startWidth: number;
  } | null>(null);

  // Track click state for distinguishing single click, double click, and drag
  const clickStateRef = useRef<{
    clickTimer: NodeJS.Timeout | null;
    clickedFile: FileInfo | null;
    isDragging: boolean;
  }>({
    clickTimer: null,
    clickedFile: null,
    isDragging: false,
  });

  const columnLabels: Record<keyof ColumnConfig, string> = {
    name: 'Name',
    modifiedAt: 'Date modified',
    type: 'Type',
    size: 'Size',
    createdAt: 'Date created',
  };

  // Column resize handlers
  const handleResizeStart = useCallback((e: React.MouseEvent, column: keyof typeof columnWidths) => {
    e.preventDefault();
    e.stopPropagation();
    setResizing({
      column,
      startX: e.clientX,
      startWidth: columnWidths[column],
    });
  }, [columnWidths]);

  // Handle mouse move and mouse up for column resizing
  useEffect(() => {
    if (!resizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const delta = e.clientX - resizing.startX;
      const newWidth = Math.max(50, resizing.startWidth + delta);
      setColumnWidth(resizing.column, newWidth);
    };

    const handleMouseUp = () => {
      setResizing(null);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [resizing, setColumnWidth]);

  // Check if 7-Zip is installed on mount
  useEffect(() => {
    const check7Zip = async () => {
      try {
        const response = await window.xplorer.request('sevenzip.check');
        if (response.success && response.data) {
          const data = response.data as { installed: boolean };
          if (data.installed) {
            setSevenZipInstalled(true);
          }
        }
      } catch (error) {
        console.debug('7-Zip check failed:', error);
      }
    };
    check7Zip();
  }, []);

  // Measure container height
  useEffect(() => {
    const updateHeight = () => {
      if (bodyRef.current) {
        setListHeight(bodyRef.current.clientHeight || 400);
      }
    };

    updateHeight();
    window.addEventListener('resize', updateHeight);

    const observer = new ResizeObserver(updateHeight);
    if (bodyRef.current) {
      observer.observe(bodyRef.current);
    }

    return () => {
      window.removeEventListener('resize', updateHeight);
      observer.disconnect();
    };
  }, []);

  // Get row/item height based on view mode (calculated from icon size)
  const getItemSize = useCallback(() => {
    switch (viewMode) {
      case 'icons':
        return iconSize + 40; // Icon size + space for label
      case 'thumbnails':
        return Math.max(thumbnailSize + 8, 40); // Thumbnail size + padding, min 40
      default:
        return 24;
    }
  }, [viewMode, iconSize, thumbnailSize]);

  // Calculate which files are in the marquee selection box
  const getFilesInMarquee = useCallback(() => {
    if (!marquee.isActive || !bodyRef.current) return new Set<string>();

    const bodyRect = bodyRef.current.getBoundingClientRect();
    const selectedPaths = new Set<string>();

    // Calculate marquee bounds relative to the body
    const marqueeLeft = Math.min(marquee.startX, marquee.currentX);
    const marqueeRight = Math.max(marquee.startX, marquee.currentX);
    const marqueeTop = Math.min(marquee.startY, marquee.currentY);
    const marqueeBottom = Math.max(marquee.startY, marquee.currentY);

    if (viewMode === 'icons') {
      // For icons view, we need to find the actual DOM elements and check their positions
      const iconElements = bodyRef.current.querySelectorAll('.file-item-icon');
      iconElements.forEach((element) => {
        const rect = element.getBoundingClientRect();
        // Convert to coordinates relative to the body
        const itemLeft = rect.left - bodyRect.left;
        const itemRight = rect.right - bodyRect.left;
        const itemTop = rect.top - bodyRect.top;
        const itemBottom = rect.bottom - bodyRect.top;

        // Check if this item intersects with the marquee
        if (
          itemRight >= marqueeLeft &&
          itemLeft <= marqueeRight &&
          itemBottom >= marqueeTop &&
          itemTop <= marqueeBottom
        ) {
          const path = element.getAttribute('data-path');
          if (path) {
            selectedPaths.add(path);
          }
        }
      });
    } else {
      // For list views (details, thumbnails)
      const scrollTop = listRef.current ? (listRef.current as any).state?.scrollOffset || 0 : 0;
      const rowHeight = viewMode === 'thumbnails' ? getItemSize() : 24;

      files.forEach((file, index) => {
        const rowTop = index * rowHeight - scrollTop;
        const rowBottom = rowTop + rowHeight;

        // Check if this row intersects with the marquee
        if (
          rowBottom >= marqueeTop &&
          rowTop <= marqueeBottom &&
          marqueeRight >= 0 &&
          marqueeLeft <= bodyRect.width
        ) {
          selectedPaths.add(file.path);
        }
      });
    }

    return selectedPaths;
  }, [marquee, files, viewMode, getItemSize]);

  // Update marquee selection as mouse moves
  useEffect(() => {
    if (marquee.isActive) {
      const newSelection = getFilesInMarquee();
      setMarqueeSelectedPaths(newSelection);
    }
  }, [marquee, getFilesInMarquee]);

  // Fetch folder sizes when measureFolderSize is enabled
  // Process folders one at a time to avoid overwhelming the system
  const folderSizeQueueRef = useRef<string[]>([]);
  const isProcessingFolderSizeRef = useRef(false);
  const currentPathRef = useRef<string>('');

  // Get persistent cache functions
  const { getEntry: getCachedSize, setEntry: setCachedSize, isValid: isCacheValid } = useFolderSizeCacheStore();

  useEffect(() => {
    if (!measureFolderSize) {
      return;
    }

    const currentPath = getCurrentPath();

    // If path changed, clear the queue and stop any pending processing
    if (currentPath !== currentPathRef.current) {
      currentPathRef.current = currentPath;
      folderSizeQueueRef.current = [];
      isProcessingFolderSizeRef.current = false;
    }

    // First, check the cache for any folders we can immediately populate
    files.forEach((file) => {
      if (file.isDirectory && !folderSizes.has(file.path) && !loadingFolderSizes.has(file.path)) {
        const cachedEntry = getCachedSize(file.path);
        if (cachedEntry && isCacheValid(file.path, file.modifiedAt)) {
          // Cache hit! Use the cached size
          setFolderSize(file.path, cachedEntry.size);
        }
      }
    });

    // Get folders that need their sizes calculated (not in memory, not loading, not in queue, and not in valid cache)
    const foldersToCalculate = files.filter(
      (file) =>
        file.isDirectory &&
        !folderSizes.has(file.path) &&
        !loadingFolderSizes.has(file.path) &&
        !folderSizeQueueRef.current.includes(file.path) &&
        !isCacheValid(file.path, file.modifiedAt)
    );

    // Add new folders to the queue
    folderSizeQueueRef.current.push(...foldersToCalculate.map(f => f.path));

    // Process the queue one at a time
    const processQueue = async () => {
      if (isProcessingFolderSizeRef.current || folderSizeQueueRef.current.length === 0) {
        return;
      }

      isProcessingFolderSizeRef.current = true;

      while (folderSizeQueueRef.current.length > 0) {
        const folderPath = folderSizeQueueRef.current.shift()!;

        // Skip if we're no longer on the same path
        if (getCurrentPath() !== currentPathRef.current) {
          isProcessingFolderSizeRef.current = false;
          return;
        }

        // Find the file info for this folder to get modifiedAt
        const folderInfo = files.find(f => f.path === folderPath);
        if (!folderInfo) {
          continue;
        }

        setLoadingFolderSize(folderPath, true);

        try {
          const response = await window.xplorer.request('fs.folderSize', { path: folderPath });
          // Check response.data which contains {path, size}
          if (response.success && response.data && typeof (response.data as any).size === 'number') {
            const size = (response.data as any).size;
            setFolderSize(folderPath, size);
            // Save to persistent cache with the folder's modification time
            setCachedSize(folderPath, size, folderInfo.modifiedAt);
          } else {
            setLoadingFolderSize(folderPath, false);
          }
        } catch {
          setLoadingFolderSize(folderPath, false);
        }
      }

      isProcessingFolderSizeRef.current = false;
    };

    processQueue();
  }, [files, measureFolderSize, folderSizes, loadingFolderSizes, setFolderSize, setLoadingFolderSize, getCurrentPath, getCachedSize, setCachedSize, isCacheValid]);

  // Clear folder sizes when navigating to a different directory
  useEffect(() => {
    const currentPath = getCurrentPath();
    return () => {
      // Clear folder sizes when path changes
      clearFolderSizes();
    };
  }, [getCurrentPath()]);

  const handleClick = useCallback(
    (e: React.MouseEvent, file: FileInfo, _isCurrentlySelected: boolean) => {
      // If we were dragging, ignore this click entirely
      if (clickStateRef.current.isDragging) {
        clickStateRef.current.isDragging = false;
        return;
      }

      // Clear any existing click timer
      if (clickStateRef.current.clickTimer) {
        clearTimeout(clickStateRef.current.clickTimer);
        clickStateRef.current.clickTimer = null;
      }

      // Handle modifier keys immediately (no delay needed)
      if (e.shiftKey) {
        selectRange(file.path);
        return;
      }
      if (e.ctrlKey || e.metaKey) {
        select(file.path, true);
        return;
      }

      // For regular clicks, use a timer to distinguish from double-click
      // Store which file was clicked
      clickStateRef.current.clickedFile = file;

      // Set a timer - if it fires, it was a single click (select only)
      clickStateRef.current.clickTimer = setTimeout(() => {
        clickStateRef.current.clickTimer = null;
        clickStateRef.current.clickedFile = null;
        // Single click action: just select
        select(file.path, false);
      }, 250); // 250ms delay to wait for potential double-click
    },
    [select, selectRange]
  );

  const handleDoubleClick = useCallback(
    (file: FileInfo) => {
      // If we were dragging, ignore
      if (clickStateRef.current.isDragging) {
        clickStateRef.current.isDragging = false;
        return;
      }

      // Cancel the pending single-click timer
      if (clickStateRef.current.clickTimer) {
        clearTimeout(clickStateRef.current.clickTimer);
        clickStateRef.current.clickTimer = null;
      }
      clickStateRef.current.clickedFile = null;

      // Double-click action: select and open
      select(file.path, false);
      onOpen(file);
    },
    [onOpen, select]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // Don't handle if editing
      if (editingPath) return;

      if (e.key === 'Enter' || e.key === ' ') {
        // Open selected file/folder with Enter or Space
        e.preventDefault();
        const selectedFilesList = getSelectedFiles();
        if (selectedFilesList.length === 1) {
          onOpen(selectedFilesList[0]);
        }
      } else if (e.key === 'a' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        selectAll();
      } else if (e.key === 'Escape') {
        clearSelection();
      } else if (e.key === 'F2') {
        // Start rename on F2
        const selectedFilesList = getSelectedFiles();
        if (selectedFilesList.length === 1) {
          setEditingPath(selectedFilesList[0].path);
        }
      }
    },
    [getSelectedFiles, onOpen, selectAll, clearSelection, editingPath, setEditingPath]
  );

  const handleRenameComplete = useCallback(async (file: FileInfo, newName: string | null) => {
    setEditingPath(null);

    if (newName && newName !== file.name) {
      try {
        const response = await window.xplorer.request('fs.rename', {
          path: file.path,
          newName: newName,
        });

        if (response.success) {
          triggerRefresh();
        } else {
          console.error('Failed to rename:', response.error?.message);
        }
      } catch (error) {
        console.error('Failed to rename:', error);
      }
    }
  }, [setEditingPath, triggerRefresh]);

  // Handle right-click context menu
  const handleContextMenu = useCallback(
    (e: React.MouseEvent, file: FileInfo) => {
      e.preventDefault();
      e.stopPropagation();

      // If the file is not already selected, select it
      if (!selectedIds.has(file.path)) {
        select(file.path, false);
      }

      // Get all selected files for the context menu
      const selectedFiles = selectedIds.has(file.path)
        ? getSelectedFiles()
        : [file];

      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        files: selectedFiles,
      });
    },
    [selectedIds, select, getSelectedFiles]
  );

  // Handle context menu actions
  const handleContextMenuAction = useCallback(
    async (actionId: string, files: FileInfo[]) => {
      const currentPath = getCurrentPath();

      switch (actionId) {
        case 'open':
          files.forEach((file) => onOpen(file));
          break;

        case 'open-new-tab':
          if (files.length === 1 && files[0].isDirectory) {
            const { createTab } = useTabStore.getState();
            createTab(files[0].path);
          }
          break;

        case 'open-new-window':
          if (files.length === 1 && files[0].isDirectory) {
            // Create new window with the folder path
            window.xplorer.window.createWithTab(
              {
                id: `tab-${Date.now()}`,
                path: files[0].path,
                title: files[0].name,
                history: [files[0].path],
                historyIndex: 0,
              },
              window.screenX + 50,
              window.screenY + 50
            );
          }
          break;

        case 'open-with':
          // Use rundll32 to open the "Open With" dialog for each file
          for (const file of files) {
            await window.xplorer.request('shell.execute', {
              path: 'rundll32.exe',
              verb: 'open',
              args: `shell32.dll,OpenAs_RunDLL "${file.path}"`,
            });
          }
          break;

        case 'open-file-location':
          if (files.length === 1) {
            const parentPath = files[0].path.substring(0, files[0].path.lastIndexOf('\\'));
            navigateTo(parentPath);
          }
          break;

        case 'add-quick-access':
          // TODO: Implement quick access pinning
          console.log('Add to quick access:', files[0].path);
          break;

        case 'open-terminal':
          if (files.length === 1 && files[0].isDirectory) {
            await window.xplorer.request('shell.execute', {
              path: 'cmd.exe',
              verb: 'open',
              directory: files[0].path,
            });
          }
          break;

        case 'open-terminal-admin':
          if (files.length === 1 && files[0].isDirectory) {
            // For admin terminal, we use PowerShell with Start-Process to properly set working directory
            // cmd.exe with runas ignores the directory parameter
            await window.xplorer.request('shell.execute', {
              path: 'powershell.exe',
              verb: 'open',
              args: `-Command "Start-Process cmd.exe -Verb RunAs -ArgumentList '/K cd /d ${files[0].path.replace(/'/g, "''")}'"`
            });
          }
          break;

        case 'copy-path':
          const paths = files.map((f) => f.path).join('\n');
          await navigator.clipboard.writeText(paths);
          break;

        case 'new-folder-with-selection':
          try {
            // Create new folder
            const folderResponse = await window.xplorer.request('fs.mkdir', {
              path: `${currentPath}\\New Folder`,
            });
            if (folderResponse.success && folderResponse.data) {
              const newFolderPath = (folderResponse.data as { path: string }).path;
              // Move selected files into the new folder
              await window.xplorer.request('fs.move', {
                sources: files.map((f) => f.path),
                destination: newFolderPath,
              });
              // Set pending path so the folder will auto-enter edit mode after refresh
              setPendingNewFolderPath(newFolderPath);
              triggerRefresh();
            }
          } catch (error) {
            console.error('Failed to create folder with selection:', error);
          }
          break;

        case 'create-shortcut':
          for (const file of files) {
            await window.xplorer.request('shell.createShortcut', {
              targetPath: file.path,
              shortcutPath: `${currentPath}\\${file.name} - Shortcut.lnk`,
            });
          }
          triggerRefresh();
          break;

        case 'cut':
          await window.xplorer.request('clipboard.copy', {
            paths: files.map((f) => f.path),
            cut: true,
          });
          break;

        case 'copy':
          await window.xplorer.request('clipboard.copy', {
            paths: files.map((f) => f.path),
            cut: false,
          });
          break;

        case 'delete':
          try {
            const response = await window.xplorer.request('fs.delete', {
              paths: files.map((f) => f.path),
              recycleBin: true,
            });
            if (response.success) {
              triggerRefresh();
            }
          } catch (error) {
            console.error('Failed to delete:', error);
          }
          break;

        case 'rename':
          if (files.length === 1) {
            setEditingPath(files[0].path);
          }
          break;

        case 'customize':
          if (files.length === 1) {
            setCustomizeFile(files[0]);
          }
          break;

        case 'properties':
          if (files.length === 1) {
            await window.xplorer.request('shell.properties', {
              path: files[0].path,
            });
          }
          break;

        // 7-Zip actions
        case '7z-add-to-archive':
          // Open 7-Zip add to archive dialog (interactive)
          if (files.length > 0) {
            const filePaths = files.map(f => f.path);
            await window.xplorer.request('sevenzip.addToArchiveDialog', {
              paths: filePaths,
            });
            // Don't refresh immediately - user is in the dialog
          }
          break;

        case '7z-add-to-zip':
          if (files.length > 0) {
            const filePaths = files.map(f => f.path);
            const baseName = files.length === 1
              ? files[0].name.replace(/\.[^/.]+$/, '')
              : 'archive';
            const archivePath = `${currentPath}\\${baseName}.zip`;
            await window.xplorer.request('sevenzip.addToArchive', {
              paths: filePaths,
              archivePath,
              format: 'zip',
            });
            triggerRefresh();
          }
          break;

        case '7z-add-to-7z':
          if (files.length > 0) {
            const filePaths = files.map(f => f.path);
            const baseName = files.length === 1
              ? files[0].name.replace(/\.[^/.]+$/, '')
              : 'archive';
            const archivePath = `${currentPath}\\${baseName}.7z`;
            await window.xplorer.request('sevenzip.addToArchive', {
              paths: filePaths,
              archivePath,
              format: '7z',
            });
            triggerRefresh();
          }
          break;

        case '7z-open-archive':
          if (files.length === 1) {
            await window.xplorer.request('sevenzip.openArchive', {
              path: files[0].path,
            });
          }
          break;

        case '7z-extract-here':
          if (files.length === 1) {
            await window.xplorer.request('sevenzip.extract', {
              archivePath: files[0].path,
              destination: currentPath,
            });
            triggerRefresh();
          }
          break;
      }
    },
    [getCurrentPath, onOpen, navigateTo, triggerRefresh, setEditingPath, setPendingNewFolderPath]
  );

  // Handle right-click on empty space
  const handleEmptySpaceContextMenu = useCallback((e: React.MouseEvent) => {
    // Only show if clicking on empty space (not on a file row or icon grid item)
    const target = e.target as HTMLElement;
    if (target.closest('.file-row') || target.closest('.file-item-icon')) return;

    e.preventDefault();
    e.stopPropagation();
    setEmptySpaceMenu({ x: e.clientX, y: e.clientY });
  }, []);

  // Handle empty space context menu actions
  const handleEmptySpaceAction = useCallback(async (actionId: string, data?: any) => {
    const currentPath = getCurrentPath();

    switch (actionId) {
      case 'new-folder':
        try {
          const response = await window.xplorer.request('fs.mkdir', {
            path: `${currentPath}\\New Folder`,
          });
          if (response.success && response.data) {
            const newFolderPath = (response.data as { path: string }).path;
            setPendingNewFolderPath(newFolderPath);
            triggerRefresh();
          }
        } catch (error) {
          console.error('Failed to create folder:', error);
        }
        break;

      case 'new-txt':
      case 'new-md':
      case 'new-bat':
      case 'new-ps1':
      case 'new-py':
        try {
          const extension = data?.extension || '.txt';
          const response = await window.xplorer.request('fs.writeFile', {
            path: `${currentPath}\\New File${extension}`,
            content: '',
          });
          if (response.success && response.data) {
            const newFilePath = (response.data as { path: string }).path;
            setPendingNewFolderPath(newFilePath);
            triggerRefresh();
          }
        } catch (error) {
          console.error('Failed to create file:', error);
        }
        break;

      case 'new-shortcut':
        try {
          await window.xplorer.request('shell.execute', {
            path: 'rundll32.exe',
            args: `appwiz.cpl,NewLinkHere ${currentPath}`,
          });
        } catch (error) {
          console.error('Failed to create shortcut:', error);
        }
        break;

      case 'refresh':
        triggerRefresh();
        break;

      case 'paste':
        try {
          const response = await window.xplorer.request('clipboard.paste', {
            destination: currentPath,
          });
          if (response.success) {
            triggerRefresh();
          }
        } catch (error) {
          console.error('Failed to paste:', error);
        }
        break;

      case 'open-terminal':
        await window.xplorer.request('shell.execute', {
          path: 'cmd.exe',
          verb: 'open',
          directory: currentPath,
        });
        break;

      case 'open-terminal-admin':
        await window.xplorer.request('shell.execute', {
          path: 'cmd.exe',
          verb: 'runas',
          directory: currentPath,
        });
        break;

      case 'add-quick-access':
        // TODO: Implement adding current folder to quick access
        console.log('Add to quick access:', currentPath);
        break;

      case 'properties':
        await window.xplorer.request('shell.properties', {
          path: currentPath,
        });
        break;
    }
  }, [getCurrentPath, triggerRefresh, setPendingNewFolderPath]);

  const handleHeaderClick = (field: SortField) => {
    if (sortConfig.field === field) {
      setSortConfig({ direction: sortConfig.direction === 'asc' ? 'desc' : 'asc' });
    } else {
      setSortConfig({ field, direction: 'asc' });
    }
  };

  const renderSortIndicator = (field: SortField) => {
    if (sortConfig.field !== field) return null;
    return <span className="sort-indicator">{sortConfig.direction === 'asc' ? '▲' : '▼'}</span>;
  };

  // Handle mouse down on file row (for selection before drag)
  const handleRowMouseDown = useCallback((e: React.MouseEvent, file: FileInfo) => {
    // Only handle left click
    if (e.button !== 0) return;

    // If the file isn't selected and we're not holding ctrl/shift, select it
    // This allows for "click and drag" in one motion
    if (!selectedIds.has(file.path) && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
      select(file.path, false);
    }
  }, [selectedIds, select]);

  // Handle drag start - triggers native file drag for external apps
  const handleDragStart = useCallback((e: React.DragEvent, file: FileInfo) => {
    // Mark that we're starting a drag - this will suppress click events
    clickStateRef.current.isDragging = true;

    // Cancel any pending click timer
    if (clickStateRef.current.clickTimer) {
      clearTimeout(clickStateRef.current.clickTimer);
      clickStateRef.current.clickTimer = null;
    }

    // Get all selected files, or just this file if it's not selected
    let filesToDrag: FileInfo[];
    if (selectedIds.has(file.path)) {
      filesToDrag = getSelectedFiles();
    } else {
      // Select this file and drag just it
      select(file.path, false);
      filesToDrag = [file];
    }

    const paths = filesToDrag.map((f) => f.path);

    // Set data for internal moves
    e.dataTransfer.effectAllowed = 'copyMove';
    e.dataTransfer.setData('application/x-xplorer-files', JSON.stringify(paths));
    e.dataTransfer.setData('text/plain', paths.join('\n'));

    // Set a drag image
    if (filesToDrag.length > 1) {
      // Create a custom drag image for multiple files
      const dragImage = document.createElement('div');
      dragImage.style.cssText = 'position: absolute; top: -1000px; padding: 8px 12px; background: var(--bg-secondary); border: 1px solid var(--border-primary); border-radius: 4px; font-size: 12px; color: var(--text-primary);';
      dragImage.textContent = `${filesToDrag.length} items`;
      document.body.appendChild(dragImage);
      e.dataTransfer.setDragImage(dragImage, 0, 0);
      setTimeout(() => document.body.removeChild(dragImage), 0);
    }

    // Also trigger native drag for external applications
    window.xplorer.startDrag(paths);
  }, [selectedIds, getSelectedFiles, select]);

  // Handle drag end - reset dragging state after a short delay
  const handleDragEnd = useCallback(() => {
    // Reset after a delay to ensure click events that fire after drag are suppressed
    setTimeout(() => {
      clickStateRef.current.isDragging = false;
    }, 100);
  }, []);

  // Handle mouse down on body (for marquee selection)
  const handleBodyMouseDown = useCallback((e: React.MouseEvent) => {
    // Only start marquee if clicking on empty space (not on a file row, icon, or inline rename)
    const target = e.target as HTMLElement;
    if (target.closest('.file-row') || target.closest('.file-item-icon') || target.closest('.inline-rename-form')) return;
    if (e.button !== 0) return;

    // If currently editing, let the blur handler finish the rename first
    // Don't clear selection or start marquee during editing
    if (editingPath) {
      return;
    }

    const bodyRect = bodyRef.current?.getBoundingClientRect();
    if (!bodyRect) return;

    const x = e.clientX - bodyRect.left;
    const y = e.clientY - bodyRect.top;

    // Clear selection unless holding Ctrl/Cmd
    if (!e.ctrlKey && !e.metaKey) {
      clearSelection();
    }

    setMarquee({
      isActive: true,
      startX: x,
      startY: y,
      currentX: x,
      currentY: y,
    });
  }, [clearSelection, editingPath]);

  // Handle mouse move for marquee
  useEffect(() => {
    if (!marquee.isActive) return;

    const handleMouseMove = (e: MouseEvent) => {
      const bodyRect = bodyRef.current?.getBoundingClientRect();
      if (!bodyRect) return;

      const x = e.clientX - bodyRect.left;
      const y = e.clientY - bodyRect.top;

      setMarquee((prev) => ({
        ...prev,
        currentX: x,
        currentY: y,
      }));
    };

    const handleMouseUp = () => {
      // Apply the marquee selection
      if (marqueeSelectedPaths.size > 0) {
        marqueeSelectedPaths.forEach((path) => {
          select(path, true);
        });
      }

      setMarquee({
        isActive: false,
        startX: 0,
        startY: 0,
        currentX: 0,
        currentY: 0,
      });
      setMarqueeSelectedPaths(new Set());
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [marquee.isActive, marqueeSelectedPaths, select]);

  // Handle drop on file list (for copying files into current directory)
  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const currentPath = getCurrentPath();

    // Ignore internal XPlorer drags - those only work when dropping on folders
    const xplorerData = e.dataTransfer.getData('application/x-xplorer-files');
    if (xplorerData) {
      // Internal drag to current directory - no action needed
      return;
    }

    // Handle files dropped from outside (e.g., Windows Explorer)
    if (e.dataTransfer.files.length > 0) {
      const droppedFiles = Array.from(e.dataTransfer.files);
      const paths: string[] = [];

      for (const file of droppedFiles) {
        const sourcePath = (file as any).path;
        if (sourcePath) {
          paths.push(sourcePath);
        }
      }

      if (paths.length > 0) {
        try {
          await window.xplorer.request('fs.copy', {
            sources: paths,
            destination: currentPath,
          });
          triggerRefresh();
        } catch (error) {
          console.error('Failed to copy files:', error);
        }
      }
    }
  }, [getCurrentPath, triggerRefresh]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    // Don't show copy cursor for internal drags on empty space
    const xplorerData = e.dataTransfer.types.includes('application/x-xplorer-files');
    e.dataTransfer.dropEffect = xplorerData ? 'none' : 'copy';
  }, []);

  // Handle drop on folder
  const handleFolderDrop = useCallback(async (e: React.DragEvent, targetFolder: FileInfo) => {
    e.preventDefault();
    e.stopPropagation();

    if (!targetFolder.isDirectory) return;

    // Check for internal XPlorer file data first
    const xplorerData = e.dataTransfer.getData('application/x-xplorer-files');
    if (xplorerData) {
      try {
        const paths = JSON.parse(xplorerData) as string[];

        // Don't move a folder into itself
        if (paths.includes(targetFolder.path)) return;

        // Don't move if target is within any of the sources
        const isTargetWithinSource = paths.some(
          (p) => targetFolder.path.startsWith(p + '\\')
        );
        if (isTargetWithinSource) return;

        await window.xplorer.request('fs.move', {
          sources: paths,
          destination: targetFolder.path,
        });
        triggerRefresh();
      } catch (error) {
        console.error('Failed to move files:', error);
      }
      return;
    }

    // Handle files dropped from outside (e.g., Windows Explorer)
    if (e.dataTransfer.files.length > 0) {
      const droppedFiles = Array.from(e.dataTransfer.files);
      const paths: string[] = [];

      for (const file of droppedFiles) {
        const sourcePath = (file as any).path;
        if (sourcePath) {
          paths.push(sourcePath);
        }
      }

      if (paths.length > 0) {
        try {
          await window.xplorer.request('fs.copy', {
            sources: paths,
            destination: targetFolder.path,
          });
          triggerRefresh();
        } catch (error) {
          console.error('Failed to copy files:', error);
        }
      }
    }
  }, [triggerRefresh]);

  // Calculate marquee rectangle style
  const marqueeStyle = marquee.isActive
    ? {
        left: Math.min(marquee.startX, marquee.currentX),
        top: Math.min(marquee.startY, marquee.currentY),
        width: Math.abs(marquee.currentX - marquee.startX),
        height: Math.abs(marquee.currentY - marquee.startY),
      }
    : undefined;

  // Get icon size based on view mode (uses dynamic sizes from store)
  const getIconSize = () => {
    switch (viewMode) {
      case 'icons':
        return iconSize;
      case 'thumbnails':
        return thumbnailSize;
      default:
        return 16;
    }
  };

  // Helper to get display size for files and folders
  const getDisplaySize = (file: FileInfo): string => {
    if (file.isDirectory) {
      if (measureFolderSize) {
        if (loadingFolderSizes.has(file.path)) {
          return '...';
        }
        const size = folderSizes.get(file.path);
        if (size !== undefined) {
          return formatSize(size);
        }
      }
      return '';
    }
    return formatSize(file.size);
  };

  const Row = ({ index, style }: { index: number; style: React.CSSProperties }) => {
    const file = files[index];
    const isSelected = selectedIds.has(file.path) || marqueeSelectedPaths.has(file.path);
    const isEditing = editingPath === file.path;
    const [isDragOver, setIsDragOver] = useState(false);
    const iconSize = getIconSize();

    const commonProps = {
      onClick: (e: React.MouseEvent) => !isEditing && handleClick(e, file, isSelected),
      onDoubleClick: () => !isEditing && handleDoubleClick(file),
      onMouseDown: (e: React.MouseEvent) => !isEditing && handleRowMouseDown(e, file),
      onContextMenu: (e: React.MouseEvent) => !isEditing && handleContextMenu(e, file),
      // Only make draggable when selected - this allows double-click on unselected items
      draggable: !isEditing && isSelected,
      onDragStart: (e: React.DragEvent) => !isEditing && handleDragStart(e, file),
      onDragEnd: handleDragEnd,
      onDragOver: (e: React.DragEvent) => {
        if (file.isDirectory) {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          setIsDragOver(true);
        }
      },
      onDragLeave: () => setIsDragOver(false),
      onDrop: (e: React.DragEvent) => {
        setIsDragOver(false);
        handleFolderDrop(e, file);
      },
    };

    const renderFileName = () => {
      if (isEditing) {
        return <InlineRename file={file} onComplete={(newName) => handleRenameComplete(file, newName)} />;
      }
      return <span className="file-name">{file.name}</span>;
    };

    // Icons view - larger icons with name below
    if (viewMode === 'icons') {
      const fileCustom = getFileCustomization(file.path);
      const fallbackIcon = getFileIcon(file, customFileTypes, defaultTypeIcons, iconSize, fileCustom);

      return (
        <div
          className={`file-item-icon ${isSelected ? 'selected' : ''} ${isDragOver && file.isDirectory ? 'drag-over' : ''} ${isEditing ? 'editing' : ''}`}
          style={style}
          {...commonProps}
        >
          <div className="file-item-icon-image">
            <FileThumbnail file={file} size={iconSize} fallbackIcon={fallbackIcon} />
          </div>
          {isEditing ? (
            <InlineRename file={file} onComplete={(newName) => handleRenameComplete(file, newName)} />
          ) : (
            <span className="file-item-icon-name">{file.name}</span>
          )}
        </div>
      );
    }

    // Thumbnails view - details with larger icons
    if (viewMode === 'thumbnails') {
      const fileCustom = getFileCustomization(file.path);
      const fallbackIcon = getFileIcon(file, customFileTypes, defaultTypeIcons, iconSize, fileCustom);

      return (
        <div
          className={`file-row thumbnail-mode ${isSelected ? 'selected' : ''} ${index % 2 === 1 ? 'alt' : ''} ${isDragOver && file.isDirectory ? 'drag-over' : ''} ${isEditing ? 'editing' : ''}`}
          style={style}
          {...commonProps}
        >
          <div className="file-cell name" style={{ width: columnWidths.name }}>
            <div className="thumbnail-icon" style={{ width: iconSize, height: iconSize, minWidth: iconSize }}>
              <FileThumbnail file={file} size={iconSize} fallbackIcon={fallbackIcon} />
            </div>
            {renderFileName()}
          </div>
          {columnConfig.modifiedAt && (
            <div className="file-cell date" style={{ width: columnWidths.modifiedAt }}>{formatDate(file.modifiedAt)}</div>
          )}
          {columnConfig.createdAt && (
            <div className="file-cell date" style={{ width: columnWidths.createdAt }}>{formatDate(file.createdAt)}</div>
          )}
          {columnConfig.type && (
            <div className="file-cell type" style={{ width: columnWidths.type }}>{getFileType(file)}</div>
          )}
          {columnConfig.size && (
            <div className="file-cell size" style={{ width: columnWidths.size }}>{getDisplaySize(file)}</div>
          )}
        </div>
      );
    }

    // Details view (default) - full columns
    const fileCustom = getFileCustomization(file.path);
    return (
      <div
        className={`file-row ${isSelected ? 'selected' : ''} ${index % 2 === 1 ? 'alt' : ''} ${isDragOver && file.isDirectory ? 'drag-over' : ''} ${isEditing ? 'editing' : ''}`}
        style={style}
        {...commonProps}
      >
        <div className="file-cell name" style={{ width: columnWidths.name }}>
          {getFileIcon(file, customFileTypes, defaultTypeIcons, 16, fileCustom)}
          {renderFileName()}
        </div>
        {columnConfig.modifiedAt && (
          <div className="file-cell date" style={{ width: columnWidths.modifiedAt }}>{formatDate(file.modifiedAt)}</div>
        )}
        {columnConfig.createdAt && (
          <div className="file-cell date" style={{ width: columnWidths.createdAt }}>{formatDate(file.createdAt)}</div>
        )}
        {columnConfig.type && (
          <div className="file-cell type" style={{ width: columnWidths.type }}>{getFileType(file)}</div>
        )}
        {columnConfig.size && (
          <div className="file-cell size" style={{ width: columnWidths.size }}>{getDisplaySize(file)}</div>
        )}
      </div>
    );
  };

  if (error) {
    return (
      <div className="file-list-error">
        <p>Failed to load directory</p>
        <p className="error-message">{error}</p>
      </div>
    );
  }

  const itemSize = getItemSize();

  // For icons view, render as a grid instead of a list
  const renderIconsGrid = () => {
    const currentIconSize = getIconSize();
    const itemWidth = currentIconSize + 32; // Icon size + padding

    return (
      <div
        className="file-icons-grid"
        style={{
          gridTemplateColumns: `repeat(auto-fill, minmax(${itemWidth}px, 1fr))`,
        }}
      >
        {files.map((file) => {
          const isSelected = selectedIds.has(file.path) || marqueeSelectedPaths.has(file.path);
          const isEditing = editingPath === file.path;
          const fileCustom = getFileCustomization(file.path);
          const fallbackIcon = getFileIcon(file, customFileTypes, defaultTypeIcons, currentIconSize, fileCustom);

          return (
            <div
              key={file.path}
              data-path={file.path}
              className={`file-item-icon ${isSelected ? 'selected' : ''} ${isEditing ? 'editing' : ''}`}
              style={{ width: itemWidth }}
              onClick={(e) => !isEditing && handleClick(e, file, isSelected)}
              onDoubleClick={() => !isEditing && handleDoubleClick(file)}
              onMouseDown={(e) => !isEditing && handleRowMouseDown(e, file)}
              onContextMenu={(e) => !isEditing && handleContextMenu(e, file)}
              draggable={!isEditing && isSelected}
              onDragStart={(e) => !isEditing && handleDragStart(e, file)}
              onDragEnd={handleDragEnd}
              onDragOver={(e) => {
                if (file.isDirectory) {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                }
              }}
              onDrop={(e) => handleFolderDrop(e, file)}
            >
              <div className="file-item-icon-image" style={{ width: currentIconSize, height: currentIconSize }}>
                <FileThumbnail file={file} size={currentIconSize} fallbackIcon={fallbackIcon} />
              </div>
              {isEditing ? (
                <InlineRename file={file} onComplete={(newName) => handleRenameComplete(file, newName)} />
              ) : (
                <span className="file-item-icon-name">{file.name}</span>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div
      className={`file-list view-${viewMode}`}
      ref={containerRef}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >
      {/* Show header in details and thumbnails views */}
      {(viewMode === 'details' || viewMode === 'thumbnails') && (
        <div
          className={`file-list-header ${resizing ? 'resizing' : ''}`}
          onContextMenu={(e) => {
            e.preventDefault();
            setColumnMenuPos({ x: e.clientX, y: e.clientY });
          }}
        >
          <div className="file-cell name" style={{ width: columnWidths.name }} onClick={() => handleHeaderClick('name')}>
            Name {renderSortIndicator('name')}
            <div
              className="column-resize-handle"
              onMouseDown={(e) => handleResizeStart(e, 'name')}
            />
          </div>
          {columnConfig.modifiedAt && (
            <div className="file-cell date" style={{ width: columnWidths.modifiedAt }} onClick={() => handleHeaderClick('modifiedAt')}>
              Date modified {renderSortIndicator('modifiedAt')}
              <div
                className="column-resize-handle"
                onMouseDown={(e) => handleResizeStart(e, 'modifiedAt')}
              />
            </div>
          )}
          {columnConfig.createdAt && (
            <div className="file-cell date" style={{ width: columnWidths.createdAt }} onClick={() => handleHeaderClick('createdAt')}>
              Date created {renderSortIndicator('createdAt')}
              <div
                className="column-resize-handle"
                onMouseDown={(e) => handleResizeStart(e, 'createdAt')}
              />
            </div>
          )}
          {columnConfig.type && (
            <div className="file-cell type" style={{ width: columnWidths.type }} onClick={() => handleHeaderClick('type')}>
              Type {renderSortIndicator('type')}
              <div
                className="column-resize-handle"
                onMouseDown={(e) => handleResizeStart(e, 'type')}
              />
            </div>
          )}
          {columnConfig.size && (
            <div className="file-cell size" style={{ width: columnWidths.size }} onClick={() => handleHeaderClick('size')}>
              Size {renderSortIndicator('size')}
            </div>
          )}
        </div>
      )}

      {/* Column configuration context menu */}
      {columnMenuPos && (
        <div
          className="column-context-menu"
          style={{ left: columnMenuPos.x, top: columnMenuPos.y }}
          onMouseLeave={() => setColumnMenuPos(null)}
        >
          {(Object.keys(columnLabels) as Array<keyof ColumnConfig>).map((column) => (
            <button
              key={column}
              className="column-context-menu-item"
              onClick={() => {
                toggleColumn(column);
              }}
              disabled={column === 'name'}
            >
              <span className="column-check">
                {columnConfig[column] && <Check size={14} />}
              </span>
              <span>{columnLabels[column]}</span>
            </button>
          ))}
        </div>
      )}

      <div
        className="file-list-body"
        ref={bodyRef}
        onMouseDown={handleBodyMouseDown}
        onContextMenu={handleEmptySpaceContextMenu}
      >
        {loading ? (
          <div className="file-list-loading">Loading...</div>
        ) : files.length === 0 ? (
          <div className="file-list-empty">This folder is empty</div>
        ) : viewMode === 'icons' ? (
          renderIconsGrid()
        ) : (
          <List
            ref={listRef}
            height={listHeight}
            itemCount={files.length}
            itemSize={itemSize}
            width="100%"
          >
            {Row}
          </List>
        )}

        {/* Marquee selection box */}
        {marquee.isActive && marqueeStyle && (
          <div className="marquee-selection" style={marqueeStyle} />
        )}
      </div>

      {/* File context menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          files={contextMenu.files}
          onAction={handleContextMenuAction}
          onClose={() => setContextMenu(null)}
          sevenZipInstalled={sevenZipInstalled}
        />
      )}

      {/* Empty space context menu */}
      {emptySpaceMenu && (
        <EmptySpaceContextMenu
          x={emptySpaceMenu.x}
          y={emptySpaceMenu.y}
          currentPath={getCurrentPath()}
          onAction={handleEmptySpaceAction}
          onClose={() => setEmptySpaceMenu(null)}
        />
      )}

      {/* Customize dialog */}
      {customizeFile && (
        <CustomizeDialog
          file={customizeFile}
          onClose={() => setCustomizeFile(null)}
        />
      )}
    </div>
  );
};
