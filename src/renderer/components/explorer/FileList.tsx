import React, { useCallback, useRef, useState, useEffect, memo, useMemo } from 'react';
import { FixedSizeList as List } from 'react-window';
import { Folder, File, FileText, FileImage, FileVideo, FileAudio, FileCode, FileArchive, Check } from 'lucide-react';
import { useFileStore, type ColumnConfig } from '../../store/fileStore';
import { useSharedState } from '../../contexts/StateProvider';
import { useSettingsStore, type CustomFileType, type DefaultTypeIcons, type FileCustomization } from '../../store/settingsStore';
import { useFolderSizeCacheStore } from '../../store/folderSizeCacheStore';
import { ContextMenu } from './ContextMenu';
import { EmptySpaceContextMenu } from './EmptySpaceContextMenu';
import { CustomizeDialog } from './CustomizeDialog';
import type { FileInfo, SortField } from '@shared/types';
import './FileList.css';

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.ico', '.tiff', '.tif']);
const VIDEO_EXTENSIONS = new Set(['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.webm', '.flv', '.m4v', '.mpg', '.mpeg']);
const AUDIO_EXTENSIONS = new Set(['.mp3', '.flac', '.m4a', '.aac', '.ogg', '.wma', '.wav', '.opus']);
const thumbnailCache = new Map<string, string>();

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
  const supportsThumbnail = IMAGE_EXTENSIONS.has(ext) || VIDEO_EXTENSIONS.has(ext) || AUDIO_EXTENSIONS.has(ext);
  useEffect(() => {
    if (!supportsThumbnail || file.isDirectory) return;
    const cacheKey = `${file.path}:${size}:${file.modifiedAt}`;
    if (thumbnailCache.has(cacheKey)) {
      setThumbnail(thumbnailCache.get(cacheKey)!);
      return;
    }
    setLoading(true);
    setError(false);
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
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [file.path, file.modifiedAt, size, supportsThumbnail, file.isDirectory]);
  if (thumbnail) return <img src={`data:image/png;base64,${thumbnail}`} alt={file.name} className="file-thumbnail-img" style={{ width: size, height: size, objectFit: 'contain' }} />;
  if (loading) return <div className="file-thumbnail-loading" style={{ width: size, height: size }}>{fallbackIcon}</div>;
  return <>{fallbackIcon}</>;
});

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
      if (file.isDirectory) {
        inputRef.current.select();
      } else {
        const dotIndex = file.name.lastIndexOf('.');
        if (dotIndex > 0) inputRef.current.setSelectionRange(0, dotIndex);
        else inputRef.current.select();
      }
    }
  }, [file]);
  const handleComplete = useCallback((newName: string | null) => {
    if (completedRef.current) return;
    completedRef.current = true;
    onComplete(newName);
  }, [onComplete]);
  const handleSubmit = useCallback((e?: React.FormEvent) => {
    e?.preventDefault();
    const trimmed = value.trim();
    if (trimmed && trimmed !== file.name) handleComplete(trimmed);
    else handleComplete(null);
  }, [value, file.name, handleComplete]);
  const handleBlur = useCallback(() => handleSubmit(), [handleSubmit]);
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
      <input ref={inputRef} type="text" className="inline-rename-input" value={value} onChange={(e) => setValue(e.target.value)} onBlur={handleBlur} onKeyDown={handleKeyDown} onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()} />
    </form>
  );
};

interface FileListProps {
  onOpen: (file: FileInfo) => void;
}

const getFileIcon = ( file: FileInfo, customFileTypes: CustomFileType[] = [], defaultTypeIcons: DefaultTypeIcons = {}, size: number = 16, fileCustomization?: FileCustomization ): React.ReactNode => {
  if (fileCustomization) {
    if (fileCustomization.customIcon) return <img src={fileCustomization.customIcon} alt="" style={{ width: size, height: size, objectFit: 'contain' }} className="file-icon" />;
    if (fileCustomization.color) return file.isDirectory ? <Folder size={size} className="file-icon" style={{ color: fileCustomization.color }} /> : <File size={size} className="file-icon" style={{ color: fileCustomization.color }} />;
  }
  if (file.isDirectory) {
    if (defaultTypeIcons.folder) return <img src={defaultTypeIcons.folder} alt="" style={{ width: size, height: size, objectFit: 'contain' }} className="file-icon" />;
    return <Folder size={size} className="file-icon folder" />;
  }
  const ext = file.extension.toLowerCase();
  for (const customType of customFileTypes) {
    if (customType.extensions.includes(ext)) {
      if (customType.customIcon) return <img src={customType.customIcon} alt="" style={{ width: size, height: size, objectFit: 'contain' }} className="file-icon" />;
      return <File size={size} className="file-icon" style={{ color: customType.color }} />;
    }
  }
  if (['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg', '.ico'].includes(ext)) {
    if (defaultTypeIcons.image) return <img src={defaultTypeIcons.image} alt="" style={{ width: size, height: size, objectFit: 'contain' }} className="file-icon" />;
    return <FileImage size={size} className="file-icon image" />;
  }
  if (['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.webm'].includes(ext)) {
    if (defaultTypeIcons.video) return <img src={defaultTypeIcons.video} alt="" style={{ width: size, height: size, objectFit: 'contain' }} className="file-icon" />;
    return <FileVideo size={size} className="file-icon video" />;
  }
  if (['.mp3', '.wav', '.flac', '.ogg', '.m4a', '.aac'].includes(ext)) {
    if (defaultTypeIcons.audio) return <img src={defaultTypeIcons.audio} alt="" style={{ width: size, height: size, objectFit: 'contain' }} className="file-icon" />;
    return <FileAudio size={size} className="file-icon audio" />;
  }
  if (['.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.c', '.cpp', '.h', '.cs', '.go', '.rs', '.rb', '.php', '.html', '.css', '.json', '.xml', '.yaml', '.yml'].includes(ext)) {
    if (defaultTypeIcons.code) return <img src={defaultTypeIcons.code} alt="" style={{ width: size, height: size, objectFit: 'contain' }} className="file-icon" />;
    return <FileCode size={size} className="file-icon code" />;
  }
  if (['.zip', '.rar', '.7z', '.tar', '.gz', '.bz2'].includes(ext)) {
    if (defaultTypeIcons.archive) return <img src={defaultTypeIcons.archive} alt="" style={{ width: size, height: size, objectFit: 'contain' }} className="file-icon" />;
    return <FileArchive size={size} className="file-icon archive" />;
  }
  if (['.txt', '.md', '.log', '.ini', '.cfg', '.conf'].includes(ext)) {
    if (defaultTypeIcons.text) return <img src={defaultTypeIcons.text} alt="" style={{ width: size, height: size, objectFit: 'contain' }} className="file-icon" />;
    return <FileText size={size} className="file-icon text" />;
  }
  if (defaultTypeIcons.default) return <img src={defaultTypeIcons.default} alt="" style={{ width: size, height: size, objectFit: 'contain' }} className="file-icon" />;
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
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const getFileType = (file: FileInfo): string => {
  if (file.isDirectory) return 'File folder';
  if (!file.extension) return 'File';
  return `${file.extension.slice(1).toUpperCase()} File`;
};

export const FileList: React.FC<FileListProps> = ({ onOpen }) => {
  const { files, selectedIds, select, selectRange, selectAll, clearSelection, loading, error, sortConfig, setSortConfig, viewMode, getSelectedFiles, triggerRefresh, editingPath, setEditingPath, columnConfig, toggleColumn, thumbnailSize, iconSize, setPendingNewFolderPath, folderSizes, loadingFolderSizes, setFolderSize, setLoadingFolderSize, clearFolderSizes, search } = useFileStore();
  const { tabState, tabs: tabActions } = useSharedState();
  const { customFileTypes, defaultTypeIcons, columnWidths, setColumnWidth, measureFolderSize, fileCustomizations, getFileCustomization } = useSettingsStore();
  const { getEntry: getCachedSize, setEntry: setCachedSize, isValid: isCacheValid } = useFolderSizeCacheStore();

  const currentPath = useMemo(() => {
    const { tabs, activeTabId } = tabState;
    const tab = tabs.find((t) => t.id === activeTabId);
    return tab?.path || '';
  }, [tabState]);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<List>(null);
  const [listHeight, setListHeight] = useState(400);
  const [containerWidth, setContainerWidth] = useState(0);
  const [marquee, setMarquee] = useState({ isActive: false, startX: 0, startY: 0, currentX: 0, currentY: 0 });
  const [marqueeSelectedPaths, setMarqueeSelectedPaths] = useState<Set<string>>(new Set());
  const [columnMenuPos, setColumnMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; files: FileInfo[] } | null>(null);
  const [emptySpaceMenu, setEmptySpaceMenu] = useState<{ x: number; y: number } | null>(null);
  const [customizeFile, setCustomizeFile] = useState<FileInfo | null>(null);
  const [sevenZipInstalled, setSevenZipInstalled] = useState(false);
  const [resizing, setResizing] = useState<{ column: keyof typeof columnWidths; startX: number; startWidth: number; } | null>(null);
  const clickStateRef = useRef<{ clickTimer: NodeJS.Timeout | null; clickedFile: FileInfo | null; isDragging: boolean; }>({ clickTimer: null, clickedFile: null, isDragging: false });
  const columnLabels: Record<keyof ColumnConfig, string> = { name: 'Name', modifiedAt: 'Date modified', type: 'Type', size: 'Size', createdAt: 'Date created' };

  const handleResizeStart = useCallback((e: React.MouseEvent, column: keyof typeof columnWidths) => {
    e.preventDefault();
    e.stopPropagation();
    setResizing({ column, startX: e.clientX, startWidth: columnWidths[column] });
  }, [columnWidths]);

  useEffect(() => {
    if (!resizing) return;
    const handleMouseMove = (e: MouseEvent) => {
      const delta = e.clientX - resizing.startX;
      const newWidth = Math.max(50, resizing.startWidth + delta);
      setColumnWidth(resizing.column, newWidth);
    };
    const handleMouseUp = () => setResizing(null);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [resizing, setColumnWidth]);

  useEffect(() => {
    window.xplorer.request('sevenzip.check').then(response => {
      if (response.success && response.data && (response.data as any).installed) {
        setSevenZipInstalled(true);
      }
    }).catch(error => console.debug('7-Zip check failed:', error));
  }, []);

  useEffect(() => {
    const updateDimensions = () => {
      if (bodyRef.current) {
        setListHeight(bodyRef.current.clientHeight || 400);
        setContainerWidth(bodyRef.current.clientWidth || 0);
      }
    };
    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    const observer = new ResizeObserver(updateDimensions);
    if (bodyRef.current) observer.observe(bodyRef.current);
    return () => {
      window.removeEventListener('resize', updateDimensions);
      observer.disconnect();
    };
  }, []);

  // Calculate scaled column widths based on container width
  const scaledColumnWidths = useMemo(() => {
    if (containerWidth === 0 || viewMode === 'icons') return columnWidths;

    // Calculate total preferred width of visible columns
    let totalPreferredWidth = columnWidths.name;
    if (columnConfig.modifiedAt) totalPreferredWidth += columnWidths.modifiedAt;
    if (columnConfig.createdAt) totalPreferredWidth += columnWidths.createdAt;
    if (columnConfig.type) totalPreferredWidth += columnWidths.type;
    if (columnConfig.size) totalPreferredWidth += columnWidths.size;

    // If columns fit, use original widths
    if (totalPreferredWidth <= containerWidth) return columnWidths;

    // Calculate scale factor
    const scale = containerWidth / totalPreferredWidth;

    return {
      name: Math.max(100, Math.floor(columnWidths.name * scale)),
      modifiedAt: Math.max(80, Math.floor(columnWidths.modifiedAt * scale)),
      createdAt: Math.max(80, Math.floor(columnWidths.createdAt * scale)),
      type: Math.max(60, Math.floor(columnWidths.type * scale)),
      size: Math.max(60, Math.floor(columnWidths.size * scale)),
    };
  }, [containerWidth, columnWidths, columnConfig, viewMode]);

  const getItemSize = useCallback(() => {
    switch (viewMode) {
      case 'icons': return iconSize + 40;
      case 'thumbnails': return Math.max(thumbnailSize + 8, 40);
      default: return 24;
    }
  }, [viewMode, iconSize, thumbnailSize]);
  
  const getFilesInMarquee = useCallback(() => {
    if (!marquee.isActive || !bodyRef.current) return new Set<string>();
    const bodyRect = bodyRef.current.getBoundingClientRect();
    const selectedPaths = new Set<string>();
    const marqueeLeft = Math.min(marquee.startX, marquee.currentX);
    const marqueeRight = Math.max(marquee.startX, marquee.currentX);
    const marqueeTop = Math.min(marquee.startY, marquee.currentY);
    const marqueeBottom = Math.max(marquee.startY, marquee.currentY);
    if (viewMode === 'icons') {
      const iconElements = bodyRef.current.querySelectorAll('.file-item-icon');
      iconElements.forEach((element) => {
        const rect = element.getBoundingClientRect();
        const itemLeft = rect.left - bodyRect.left;
        const itemRight = rect.right - bodyRect.left;
        const itemTop = rect.top - bodyRect.top;
        const itemBottom = rect.bottom - bodyRect.top;
        if (itemRight >= marqueeLeft && itemLeft <= marqueeRight && itemBottom >= marqueeTop && itemTop <= marqueeBottom) {
          const path = element.getAttribute('data-path');
          if (path) selectedPaths.add(path);
        }
      });
    } else {
      const scrollTop = listRef.current ? (listRef.current as any).state?.scrollOffset || 0 : 0;
      const rowHeight = viewMode === 'thumbnails' ? getItemSize() : 24;
      files.forEach((file, index) => {
        const rowTop = index * rowHeight - scrollTop;
        const rowBottom = rowTop + rowHeight;
        if (rowBottom >= marqueeTop && rowTop <= marqueeBottom && marqueeRight >= 0 && marqueeLeft <= bodyRect.width) {
          selectedPaths.add(file.path);
        }
      });
    }
    return selectedPaths;
  }, [marquee, files, viewMode, getItemSize]);

  useEffect(() => {
    if (marquee.isActive) {
      setMarqueeSelectedPaths(getFilesInMarquee());
    }
  }, [marquee, getFilesInMarquee]);

  const folderSizeQueueRef = useRef<string[]>([]);
  const isProcessingFolderSizeRef = useRef(false);
  const currentPathRef = useRef<string>('');

  useEffect(() => {
    if (!measureFolderSize) return;
    if (currentPath !== currentPathRef.current) {
      currentPathRef.current = currentPath;
      folderSizeQueueRef.current = [];
      isProcessingFolderSizeRef.current = false;
    }
    files.forEach((file) => {
      if (file.isDirectory && !folderSizes.has(file.path) && !loadingFolderSizes.has(file.path)) {
        const cachedEntry = getCachedSize(file.path);
        if (cachedEntry && isCacheValid(file.path, file.modifiedAt)) {
          setFolderSize(file.path, cachedEntry.size);
        }
      }
    });
    const foldersToCalculate = files.filter(
      (file) => file.isDirectory && !folderSizes.has(file.path) && !loadingFolderSizes.has(file.path) && !folderSizeQueueRef.current.includes(file.path) && !isCacheValid(file.path, file.modifiedAt)
    );
    folderSizeQueueRef.current.push(...foldersToCalculate.map(f => f.path));
    const processQueue = async () => {
      if (isProcessingFolderSizeRef.current || folderSizeQueueRef.current.length === 0) return;
      isProcessingFolderSizeRef.current = true;
      while (folderSizeQueueRef.current.length > 0) {
        const folderPath = folderSizeQueueRef.current.shift()!;
        if (currentPath !== currentPathRef.current) {
          isProcessingFolderSizeRef.current = false;
          return;
        }
        const folderInfo = files.find(f => f.path === folderPath);
        if (!folderInfo) continue;
        setLoadingFolderSize(folderPath, true);
        try {
          const response = await window.xplorer.request('fs.folderSize', { path: folderPath });
          if (response.success && response.data && typeof (response.data as any).size === 'number') {
            const size = (response.data as any).size;
            setFolderSize(folderPath, size);
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
  }, [files, measureFolderSize, folderSizes, loadingFolderSizes, setFolderSize, setLoadingFolderSize, currentPath, getCachedSize, setCachedSize, isCacheValid]);

  // Clear folder sizes when path changes
  const prevPathRef = useRef(currentPath);
  useEffect(() => {
    if (prevPathRef.current !== currentPath) {
      prevPathRef.current = currentPath;
      clearFolderSizes();
    }
  }, [currentPath, clearFolderSizes]);

  // Scroll to newly created/edited item
  const prevEditingPathRef = useRef<string | null>(null);
  useEffect(() => {
    if (editingPath && editingPath !== prevEditingPathRef.current) {
      const index = files.findIndex(f => f.path === editingPath);
      if (index !== -1) {
        if (viewMode === 'icons') {
          // For icons grid, scroll the item into view using DOM
          const element = bodyRef.current?.querySelector(`[data-path="${CSS.escape(editingPath)}"]`);
          element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } else if (listRef.current) {
          // For virtualized list, use scrollToItem
          listRef.current.scrollToItem(index, 'center');
        }
      }
    }
    prevEditingPathRef.current = editingPath;
  }, [editingPath, files, viewMode]);

  const handleClick = useCallback(
    (e: React.MouseEvent, file: FileInfo, _isCurrentlySelected: boolean) => {
      if (clickStateRef.current.isDragging) {
        clickStateRef.current.isDragging = false;
        return;
      }
      if (clickStateRef.current.clickTimer) {
        clearTimeout(clickStateRef.current.clickTimer);
        clickStateRef.current.clickTimer = null;
      }
      if (e.shiftKey) {
        selectRange(file.path);
        return;
      }
      if (e.ctrlKey || e.metaKey) {
        select(file.path, true);
        return;
      }
      clickStateRef.current.clickedFile = file;
      clickStateRef.current.clickTimer = setTimeout(() => {
        clickStateRef.current.clickTimer = null;
        clickStateRef.current.clickedFile = null;
        select(file.path, false);
      }, 250);
    },
    [select, selectRange]
  );

  const handleDoubleClick = useCallback(
    (file: FileInfo) => {
      if (clickStateRef.current.isDragging) {
        clickStateRef.current.isDragging = false;
        return;
      }
      if (clickStateRef.current.clickTimer) {
        clearTimeout(clickStateRef.current.clickTimer);
        clickStateRef.current.clickTimer = null;
      }
      clickStateRef.current.clickedFile = null;
      select(file.path, false);
      onOpen(file);
    },
    [onOpen, select]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (editingPath) return;
      if (e.key === 'Enter' || e.key === ' ') {
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
        const response = await window.xplorer.request('fs.rename', { path: file.path, newName: newName });
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

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, file: FileInfo) => {
      e.preventDefault();
      e.stopPropagation();
      if (!selectedIds.has(file.path)) {
        select(file.path, false);
      }
      const selectedFiles = selectedIds.has(file.path) ? getSelectedFiles() : [file];
      setContextMenu({ x: e.clientX, y: e.clientY, files: selectedFiles });
    },
    [selectedIds, select, getSelectedFiles]
  );

  const handleContextMenuAction = useCallback(
    async (actionId: string, files: FileInfo[]) => {
      switch (actionId) {
        case 'open':
          files.forEach((file) => onOpen(file));
          break;
        case 'open-new-tab':
          if (files.length === 1 && files[0].isDirectory) {
            tabActions.create(files[0].path);
          }
          break;
        case 'open-new-window':
          if (files.length === 1 && files[0].isDirectory) {
            window.xplorer.window.createWithTab(
              { id: `tab-${Date.now()}`, path: files[0].path, title: files[0].name, history: [files[0].path], historyIndex: 0 },
              window.screenX + 50, window.screenY + 50
            );
          }
          break;
        case 'open-with':
          for (const file of files) {
            await window.xplorer.request('shell.execute', { path: 'rundll32.exe', verb: 'open', args: `shell32.dll,OpenAs_RunDLL "${file.path}"` });
          }
          break;
        case 'open-file-location':
          if (files.length === 1) {
            const parentPath = files[0].path.substring(0, files[0].path.lastIndexOf('\\'));
            tabActions.navigateTo(parentPath);
          }
          break;
        case 'add-quick-access':
          console.log('Add to quick access:', files[0].path);
          break;
        case 'open-terminal':
          if (files.length === 1 && files[0].isDirectory) {
            await window.xplorer.request('shell.execute', { path: 'cmd.exe', verb: 'open', directory: files[0].path });
          }
          break;
        case 'open-terminal-admin':
          if (files.length === 1 && files[0].isDirectory) {
            await window.xplorer.request('shell.execute', { path: 'powershell.exe', verb: 'open', args: `-Command "Start-Process cmd.exe -Verb RunAs -ArgumentList '/K cd /d ${files[0].path.replace(/'/g, "''")}'"` });
          }
          break;
        case 'copy-path':
          const paths = files.map((f) => f.path).join('\n');
          await navigator.clipboard.writeText(paths);
          break;
        case 'new-folder-with-selection':
          try {
            const folderResponse = await window.xplorer.request('fs.mkdir', { path: `${currentPath}\\New Folder` });
            if (folderResponse.success && folderResponse.data) {
              const newFolderPath = (folderResponse.data as { path: string }).path;
              await window.xplorer.request('fs.move', { sources: files.map((f) => f.path), destination: newFolderPath });
              setPendingNewFolderPath(newFolderPath);
              triggerRefresh();
            }
          } catch (error) {
            console.error('Failed to create folder with selection:', error);
          }
          break;
        case 'create-shortcut':
          for (const file of files) {
            await window.xplorer.request('shell.createShortcut', { targetPath: file.path, shortcutPath: `${currentPath}\\${file.name} - Shortcut.lnk` });
          }
          triggerRefresh();
          break;
        case 'cut':
          await window.xplorer.request('clipboard.copy', { paths: files.map((f) => f.path), cut: true });
          break;
        case 'copy':
          await window.xplorer.request('clipboard.copy', { paths: files.map((f) => f.path), cut: false });
          break;
        case 'delete':
          try {
            const response = await window.xplorer.request('fs.delete', { paths: files.map((f) => f.path), recycleBin: true });
            if (response.success) triggerRefresh();
          } catch (error) {
            console.error('Failed to delete:', error);
          }
          break;
        case 'rename':
          if (files.length === 1) setEditingPath(files[0].path);
          break;
        case 'customize':
          if (files.length === 1) setCustomizeFile(files[0]);
          break;
        case 'properties':
          if (files.length === 1) await window.xplorer.request('shell.properties', { path: files[0].path });
          break;
        case '7z-add-to-archive':
          if (files.length > 0) {
            const filePaths = files.map(f => f.path);
            await window.xplorer.request('sevenzip.addToArchiveDialog', { paths: filePaths });
          }
          break;
        case '7z-add-to-zip':
        case '7z-add-to-7z':
          if (files.length > 0) {
            const format = actionId === '7z-add-to-zip' ? 'zip' : '7z';
            // For single file: use filename without extension
            // For multiple files: use parent directory name
            const baseName = files.length === 1
              ? files[0].name.replace(/\.[^/.]+$/, '')
              : (currentPath.split('\\').pop() || 'archive');
            const archivePath = `${currentPath}\\${baseName}.${format}`;
            await window.xplorer.request('sevenzip.addToArchive', { paths: files.map(f => f.path), archivePath, format });
            triggerRefresh();
          }
          break;
        case '7z-open-archive':
          if (files.length === 1) await window.xplorer.request('sevenzip.openArchive', { path: files[0].path });
          break;
        case '7z-extract-to-folder':
          if (files.length === 1) {
            // Extract to a folder named after the archive (without extension)
            const archiveName = files[0].name.replace(/\.[^/.]+$/, '');
            const extractFolder = `${currentPath}\\${archiveName}`;
            await window.xplorer.request('sevenzip.extract', { archivePath: files[0].path, destination: extractFolder });
            triggerRefresh();
          }
          break;
      }
    },
    [onOpen, triggerRefresh, setEditingPath, setPendingNewFolderPath, tabActions, currentPath]
  );

  const handleEmptySpaceContextMenu = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('.file-row') || target.closest('.file-item-icon')) return;
    e.preventDefault();
    e.stopPropagation();
    setEmptySpaceMenu({ x: e.clientX, y: e.clientY });
  }, []);

  const handleEmptySpaceAction = useCallback(async (actionId: string, data?: any) => {
    switch (actionId) {
      case 'new-folder':
        try {
          const response = await window.xplorer.request('fs.mkdir', { path: `${currentPath}\\New Folder` });
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
          const response = await window.xplorer.request('fs.writeFile', { path: `${currentPath}\\New File${extension}`, content: '' });
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
          await window.xplorer.request('shell.execute', { path: 'rundll32.exe', args: `appwiz.cpl,NewLinkHere ${currentPath}` });
        } catch (error) {
          console.error('Failed to create shortcut:', error);
        }
        break;
      case 'refresh':
        triggerRefresh();
        break;
      case 'paste':
        try {
          const response = await window.xplorer.request('clipboard.paste', { destination: currentPath });
          if (response.success) triggerRefresh();
        } catch (error) {
          console.error('Failed to paste:', error);
        }
        break;
      case 'open-terminal':
        await window.xplorer.request('shell.execute', { path: 'cmd.exe', verb: 'open', directory: currentPath });
        break;
      case 'open-terminal-admin':
        await window.xplorer.request('shell.execute', { path: 'cmd.exe', verb: 'runas', directory: currentPath });
        break;
      case 'add-quick-access':
        console.log('Add to quick access:', currentPath);
        break;
      case 'properties':
        await window.xplorer.request('shell.properties', { path: currentPath });
        break;
    }
  }, [triggerRefresh, setPendingNewFolderPath, currentPath]);

  const handleHeaderClick = (field: SortField) => {
    if (sortConfig.field === field) setSortConfig({ direction: sortConfig.direction === 'asc' ? 'desc' : 'asc' });
    else setSortConfig({ field, direction: 'asc' });
  };

  const renderSortIndicator = (field: SortField) => {
    if (sortConfig.field !== field) return null;
    return <span className="sort-indicator">{sortConfig.direction === 'asc' ? '▲' : '▼'}</span>;
  };

  const handleRowMouseDown = useCallback((e: React.MouseEvent, file: FileInfo) => {
    if (e.button !== 0) return;
    if (!selectedIds.has(file.path) && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
      select(file.path, false);
    }
  }, [selectedIds, select]);

  const handleDragStart = useCallback((e: React.DragEvent, file: FileInfo) => {
    clickStateRef.current.isDragging = true;
    if (clickStateRef.current.clickTimer) {
      clearTimeout(clickStateRef.current.clickTimer);
      clickStateRef.current.clickTimer = null;
    }
    let filesToDrag: FileInfo[];
    if (selectedIds.has(file.path)) {
      filesToDrag = getSelectedFiles();
    } else {
      select(file.path, false);
      filesToDrag = [file];
    }
    const paths = filesToDrag.map((f) => f.path);
    e.dataTransfer.effectAllowed = 'copyMove';
    e.dataTransfer.setData('application/x-xplorer-files', JSON.stringify(paths));
    e.dataTransfer.setData('text/plain', paths.join('\n'));
    if (filesToDrag.length > 1) {
      const dragImage = document.createElement('div');
      dragImage.style.cssText = 'position: absolute; top: -1000px; padding: 8px 12px; background: var(--bg-secondary); border: 1px solid var(--border-primary); border-radius: 4px; font-size: 12px; color: var(--text-primary);';
      dragImage.textContent = `${filesToDrag.length} items`;
      document.body.appendChild(dragImage);
      e.dataTransfer.setDragImage(dragImage, 0, 0);
      setTimeout(() => document.body.removeChild(dragImage), 0);
    }
    window.xplorer.startDrag(paths);
  }, [selectedIds, getSelectedFiles, select]);

  const handleDragEnd = useCallback(() => {
    setTimeout(() => {
      clickStateRef.current.isDragging = false;
    }, 100);
  }, []);

  const handleBodyMouseDown = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('.file-row') || target.closest('.file-item-icon') || target.closest('.inline-rename-form') || editingPath) return;
    if (e.button !== 0) return;
    const bodyRect = bodyRef.current?.getBoundingClientRect();
    if (!bodyRect) return;
    const x = e.clientX - bodyRect.left;
    const y = e.clientY - bodyRect.top;
    if (!e.ctrlKey && !e.metaKey) clearSelection();
    setMarquee({ isActive: true, startX: x, startY: y, currentX: x, currentY: y });
  }, [clearSelection, editingPath]);

  useEffect(() => {
    if (!marquee.isActive) return;
    const handleMouseMove = (e: MouseEvent) => {
      const bodyRect = bodyRef.current?.getBoundingClientRect();
      if (!bodyRect) return;
      const x = e.clientX - bodyRect.left;
      const y = e.clientY - bodyRect.top;
      setMarquee((prev) => ({ ...prev, currentX: x, currentY: y }));
    };
    const handleMouseUp = () => {
      if (marqueeSelectedPaths.size > 0) {
        marqueeSelectedPaths.forEach((path) => select(path, true));
      }
      setMarquee({ isActive: false, startX: 0, startY: 0, currentX: 0, currentY: 0 });
      setMarqueeSelectedPaths(new Set());
    };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [marquee.isActive, marqueeSelectedPaths, select]);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.types.includes('application/x-xplorer-files')) return;
    if (e.dataTransfer.files.length > 0) {
      const paths = Array.from(e.dataTransfer.files).map(f => (f as any).path).filter(Boolean);
      if (paths.length > 0) {
        try {
          await window.xplorer.request('fs.copy', { sources: paths, destination: currentPath });
          triggerRefresh();
        } catch (error) {
          console.error('Failed to copy files:', error);
        }
      }
    }
  }, [triggerRefresh, currentPath]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = e.dataTransfer.types.includes('application/x-xplorer-files') ? 'none' : 'copy';
  }, []);

  const handleFolderDrop = useCallback(async (e: React.DragEvent, targetFolder: FileInfo) => {
    e.preventDefault();
    e.stopPropagation();
    if (!targetFolder.isDirectory) return;
    const xplorerData = e.dataTransfer.getData('application/x-xplorer-files');
    if (xplorerData) {
      try {
        const paths = JSON.parse(xplorerData) as string[];
        if (paths.includes(targetFolder.path) || paths.some(p => targetFolder.path.startsWith(p + '\\'))) return;
        await window.xplorer.request('fs.move', { sources: paths, destination: targetFolder.path });
        triggerRefresh();
      } catch (error) {
        console.error('Failed to move files:', error);
      }
      return;
    }
    if (e.dataTransfer.files.length > 0) {
      const paths = Array.from(e.dataTransfer.files).map(f => (f as any).path).filter(Boolean);
      if (paths.length > 0) {
        try {
          await window.xplorer.request('fs.copy', { sources: paths, destination: targetFolder.path });
          triggerRefresh();
        } catch (error) {
          console.error('Failed to copy files:', error);
        }
      }
    }
  }, [triggerRefresh]);

  const marqueeStyle = marquee.isActive ? { left: Math.min(marquee.startX, marquee.currentX), top: Math.min(marquee.startY, marquee.currentY), width: Math.abs(marquee.currentX - marquee.startX), height: Math.abs(marquee.currentY - marquee.startY) } : undefined;

  const getIconSize = () => {
    switch (viewMode) {
      case 'icons': return iconSize;
      case 'thumbnails': return thumbnailSize;
      default: return 16;
    }
  };

  const getDisplaySize = (file: FileInfo): string => {
    if (file.isDirectory) {
      if (measureFolderSize) {
        if (loadingFolderSizes.has(file.path)) return '...';
        const size = folderSizes.get(file.path);
        if (size !== undefined) return formatSize(size);
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
    const renderFileName = () => isEditing ? <InlineRename file={file} onComplete={(newName) => handleRenameComplete(file, newName)} /> : <span className="file-name">{file.name}</span>;
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
          <div className="file-cell name" style={{ width: scaledColumnWidths.name }}>
            <div className="thumbnail-icon" style={{ width: iconSize, height: iconSize, minWidth: iconSize }}>
              <FileThumbnail file={file} size={iconSize} fallbackIcon={fallbackIcon} />
            </div>
            {renderFileName()}
          </div>
          {columnConfig.modifiedAt && <div className="file-cell date" style={{ width: scaledColumnWidths.modifiedAt }}>{formatDate(file.modifiedAt)}</div>}
          {columnConfig.createdAt && <div className="file-cell date" style={{ width: scaledColumnWidths.createdAt }}>{formatDate(file.createdAt)}</div>}
          {columnConfig.type && <div className="file-cell type" style={{ width: scaledColumnWidths.type }}>{getFileType(file)}</div>}
          {columnConfig.size && <div className="file-cell size" style={{ width: scaledColumnWidths.size }}>{getDisplaySize(file)}</div>}
        </div>
      );
    }

    // Details view (default) - full columns
    const fileCustom = getFileCustomization(file.path);
    return (
      <div className={`file-row ${isSelected ? 'selected' : ''} ${index % 2 === 1 ? 'alt' : ''} ${isDragOver && file.isDirectory ? 'drag-over' : ''} ${isEditing ? 'editing' : ''}`} style={style} {...commonProps}>
        <div className="file-cell name" style={{ width: scaledColumnWidths.name }}>
          {getFileIcon(file, customFileTypes, defaultTypeIcons, 16, fileCustom)}
          {renderFileName()}
        </div>
        {columnConfig.modifiedAt && <div className="file-cell date" style={{ width: scaledColumnWidths.modifiedAt }}>{formatDate(file.modifiedAt)}</div>}
        {columnConfig.createdAt && <div className="file-cell date" style={{ width: scaledColumnWidths.createdAt }}>{formatDate(file.createdAt)}</div>}
        {columnConfig.type && <div className="file-cell type" style={{ width: scaledColumnWidths.type }}>{getFileType(file)}</div>}
        {columnConfig.size && <div className="file-cell size" style={{ width: scaledColumnWidths.size }}>{getDisplaySize(file)}</div>}
      </div>
    );
  };

  if (error) return <div className="file-list-error"><p>Failed to load directory</p><p className="error-message">{error}</p></div>;
  const itemSize = getItemSize();

  // For icons view, render as a grid instead of a list
  const renderIconsGrid = () => {
    const currentIconSize = getIconSize();
    const itemWidth = currentIconSize + 32; // Icon size + padding

    return (
      <div
        className="file-icons-grid"
        style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${itemWidth}px, 1fr))` }}
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
    <div className={`file-list view-${viewMode}`} ref={containerRef} tabIndex={0} onKeyDown={handleKeyDown} onDrop={handleDrop} onDragOver={handleDragOver}>
      {(viewMode === 'details' || viewMode === 'thumbnails') && (
        <div className={`file-list-header ${resizing ? 'resizing' : ''}`} onContextMenu={(e) => { e.preventDefault(); setColumnMenuPos({ x: e.clientX, y: e.clientY }); }}>
          <div className="file-cell name" style={{ width: scaledColumnWidths.name }} onClick={() => handleHeaderClick('name')}>Name {renderSortIndicator('name')}<div className="column-resize-handle" onMouseDown={(e) => handleResizeStart(e, 'name')} /></div>
          {columnConfig.modifiedAt && <div className="file-cell date" style={{ width: scaledColumnWidths.modifiedAt }} onClick={() => handleHeaderClick('modifiedAt')}>Date modified {renderSortIndicator('modifiedAt')}<div className="column-resize-handle" onMouseDown={(e) => handleResizeStart(e, 'modifiedAt')} /></div>}
          {columnConfig.createdAt && <div className="file-cell date" style={{ width: scaledColumnWidths.createdAt }} onClick={() => handleHeaderClick('createdAt')}>Date created {renderSortIndicator('createdAt')}<div className="column-resize-handle" onMouseDown={(e) => handleResizeStart(e, 'createdAt')} /></div>}
          {columnConfig.type && <div className="file-cell type" style={{ width: scaledColumnWidths.type }} onClick={() => handleHeaderClick('type')}>Type {renderSortIndicator('type')}<div className="column-resize-handle" onMouseDown={(e) => handleResizeStart(e, 'type')} /></div>}
          {columnConfig.size && <div className="file-cell size" style={{ width: scaledColumnWidths.size }} onClick={() => handleHeaderClick('size')}>Size {renderSortIndicator('size')}</div>}
        </div>
      )}
      {columnMenuPos && (
        <div className="column-context-menu" style={{ left: columnMenuPos.x, top: columnMenuPos.y }} onMouseLeave={() => setColumnMenuPos(null)}>
          {(Object.keys(columnLabels) as Array<keyof ColumnConfig>).map((column) => (
            <button key={column} className="column-context-menu-item" onClick={() => toggleColumn(column)} disabled={column === 'name'}>
              <span className="column-check">{columnConfig[column] && <Check size={14} />}</span>
              <span>{columnLabels[column]}</span>
            </button>
          ))}
        </div>
      )}
      <div className="file-list-body" ref={bodyRef} onMouseDown={handleBodyMouseDown} onContextMenu={handleEmptySpaceContextMenu}>
        {loading ? <div className="file-list-loading">Loading...</div> : files.length === 0 ? <div className="file-list-empty">{(search.isActive || search.searchId) ? 'No results' : 'This folder is empty'}</div> : viewMode === 'icons' ? renderIconsGrid() : (
          <List ref={listRef} height={listHeight} itemCount={files.length} itemSize={itemSize} width="100%">{Row}</List>
        )}
        {marquee.isActive && marqueeStyle && <div className="marquee-selection" style={marqueeStyle} />}
      </div>
      {contextMenu && <ContextMenu x={contextMenu.x} y={contextMenu.y} files={contextMenu.files} onAction={handleContextMenuAction} onClose={() => setContextMenu(null)} sevenZipInstalled={sevenZipInstalled} />}
      {emptySpaceMenu && <EmptySpaceContextMenu x={emptySpaceMenu.x} y={emptySpaceMenu.y} currentPath={currentPath} onAction={handleEmptySpaceAction} onClose={() => setEmptySpaceMenu(null)} />}
      {customizeFile && <CustomizeDialog file={customizeFile} onClose={() => setCustomizeFile(null)} />}
    </div>
  );
};