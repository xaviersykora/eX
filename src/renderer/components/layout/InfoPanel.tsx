import React, { useState, useRef, useEffect, useCallback, memo, useMemo } from 'react';
import {
  Folder,
  File,
  FileText,
  FileImage,
  FileVideo,
  FileAudio,
  FileCode,
  FileArchive,
  X,
  Pencil,
  Copy,
  Home,
} from 'lucide-react';
import { useFileStore, type HomeSelectedFile } from '../../store/fileStore';
import { useSettingsStore, type CustomFileType, type DefaultTypeIcons, type FileCustomization } from '../../store/settingsStore';
import { useSharedState } from '../../contexts/StateProvider';
import type { FileInfo } from '@shared/types';
import './InfoPanel.css';

// Supported extensions for thumbnails
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.ico', '.tiff', '.tif']);
const VIDEO_EXTENSIONS = new Set(['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.webm', '.flv', '.m4v', '.mpg', '.mpeg']);
const AUDIO_EXTENSIONS = new Set(['.mp3', '.flac', '.m4a', '.aac', '.ogg', '.wma', '.wav', '.opus']);

// Thumbnail cache for info panel
const infoPanelThumbnailCache = new Map<string, string>();

// Thumbnail component for InfoPanel
interface InfoPanelThumbnailProps {
  file: FileInfo | HomeSelectedFile;
  size: number;
  fallbackIcon: React.ReactNode;
}

const InfoPanelThumbnail: React.FC<InfoPanelThumbnailProps> = memo(({ file, size, fallbackIcon }) => {
  const [thumbnail, setThumbnail] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const ext = file.extension.toLowerCase();
  const isDirectory = file.isDirectory;
  const supportsThumbnail = !isDirectory && (IMAGE_EXTENSIONS.has(ext) || VIDEO_EXTENSIONS.has(ext) || AUDIO_EXTENSIONS.has(ext));

  useEffect(() => {
    if (!supportsThumbnail) {
      return;
    }

    // Create a cache key based on path and size
    const modifiedAt = 'modifiedAt' in file ? file.modifiedAt : 0;
    const cacheKey = `${file.path}:${size}:${modifiedAt}`;

    // Check cache first
    if (infoPanelThumbnailCache.has(cacheKey)) {
      setThumbnail(infoPanelThumbnailCache.get(cacheKey)!);
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
            infoPanelThumbnailCache.set(cacheKey, base64Data);
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
  }, [file.path, supportsThumbnail, size]);

  // Show actual thumbnail if available
  if (thumbnail) {
    return (
      <img
        src={`data:image/png;base64,${thumbnail}`}
        alt={file.name}
        className="info-panel-thumbnail-img"
        style={{ maxWidth: size, maxHeight: size, objectFit: 'contain' }}
      />
    );
  }

  // Show loading state or fallback icon
  if (loading) {
    return (
      <div className="info-panel-thumbnail-loading" style={{ width: size, height: size }}>
        {fallbackIcon}
      </div>
    );
  }

  // Show fallback icon
  return <>{fallbackIcon}</>;
});

const getFileIcon = (
  file: FileInfo | HomeSelectedFile,
  size: number,
  customFileTypes: CustomFileType[] = [],
  defaultTypeIcons: DefaultTypeIcons = {},
  fileCustomization?: FileCustomization
): React.ReactNode => {
  const isDirectory = file.isDirectory;

  // Check for individual file customization first (highest priority)
  if (fileCustomization) {
    if (fileCustomization.customIcon) {
      return <img src={fileCustomization.customIcon} alt="" style={{ width: size, height: size, objectFit: 'contain' }} className="info-icon" />;
    }
    if (fileCustomization.color) {
      if (isDirectory) {
        return <Folder size={size} className="info-icon" style={{ color: fileCustomization.color }} />;
      }
      return <File size={size} className="info-icon" style={{ color: fileCustomization.color }} />;
    }
  }

  if (isDirectory) {
    if (defaultTypeIcons.folder) {
      return <img src={defaultTypeIcons.folder} alt="" style={{ width: size, height: size, objectFit: 'contain' }} className="info-icon" />;
    }
    return <Folder size={size} className="info-icon folder" />;
  }

  const ext = file.extension.toLowerCase();

  // Check custom file types first
  for (const customType of customFileTypes) {
    if (customType.extensions.includes(ext)) {
      if (customType.customIcon) {
        return <img src={customType.customIcon} alt="" style={{ width: size, height: size, objectFit: 'contain' }} className="info-icon" />;
      }
      return <File size={size} className="info-icon" style={{ color: customType.color }} />;
    }
  }

  // Images
  if (['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg', '.ico'].includes(ext)) {
    if (defaultTypeIcons.image) {
      return <img src={defaultTypeIcons.image} alt="" style={{ width: size, height: size, objectFit: 'contain' }} className="info-icon" />;
    }
    return <FileImage size={size} className="info-icon image" />;
  }

  // Videos
  if (['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.webm'].includes(ext)) {
    if (defaultTypeIcons.video) {
      return <img src={defaultTypeIcons.video} alt="" style={{ width: size, height: size, objectFit: 'contain' }} className="info-icon" />;
    }
    return <FileVideo size={size} className="info-icon video" />;
  }

  // Audio
  if (['.mp3', '.wav', '.flac', '.ogg', '.m4a', '.aac'].includes(ext)) {
    if (defaultTypeIcons.audio) {
      return <img src={defaultTypeIcons.audio} alt="" style={{ width: size, height: size, objectFit: 'contain' }} className="info-icon" />;
    }
    return <FileAudio size={size} className="info-icon audio" />;
  }

  // Code
  if (['.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.c', '.cpp', '.h', '.cs', '.go', '.rs', '.rb', '.php', '.html', '.css', '.json', '.xml', '.yaml', '.yml'].includes(ext)) {
    if (defaultTypeIcons.code) {
      return <img src={defaultTypeIcons.code} alt="" style={{ width: size, height: size, objectFit: 'contain' }} className="info-icon" />;
    }
    return <FileCode size={size} className="info-icon code" />;
  }

  // Archives
  if (['.zip', '.rar', '.7z', '.tar', '.gz', '.bz2'].includes(ext)) {
    if (defaultTypeIcons.archive) {
      return <img src={defaultTypeIcons.archive} alt="" style={{ width: size, height: size, objectFit: 'contain' }} className="info-icon" />;
    }
    return <FileArchive size={size} className="info-icon archive" />;
  }

  // Text
  if (['.txt', '.md', '.log', '.ini', '.cfg', '.conf'].includes(ext)) {
    if (defaultTypeIcons.text) {
      return <img src={defaultTypeIcons.text} alt="" style={{ width: size, height: size, objectFit: 'contain' }} className="info-icon" />;
    }
    return <FileText size={size} className="info-icon text" />;
  }

  if (defaultTypeIcons.default) {
    return <img src={defaultTypeIcons.default} alt="" style={{ width: size, height: size, objectFit: 'contain' }} className="info-icon" />;
  }
  return <File size={size} className="info-icon default" />;
};

const formatSize = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
};

const formatDate = (timestamp: number): string => {
  const date = new Date(timestamp * 1000);
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
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

interface FolderStats {
  fileCount: number;
  folderCount: number;
}

export const InfoPanel: React.FC = () => {
  const { getSelectedFiles, files, toggleInfoPanel, triggerRefresh, homeSelectedFile } = useFileStore();
  const { measureFolderSize, customFileTypes, defaultTypeIcons, fileCustomizations } = useSettingsStore();
  const { tabState } = useSharedState();
  const { activeTabId } = tabState;
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [editError, setEditError] = useState<string | null>(null);
  const [folderStats, setFolderStats] = useState<FolderStats | null>(null);
  const [folderSize, setFolderSize] = useState<number | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const [loadingSize, setLoadingSize] = useState(false);
  // State for current directory info (when no selection)
  const [currentDirStats, setCurrentDirStats] = useState<FolderStats | null>(null);
  const [currentDirSize, setCurrentDirSize] = useState<number | null>(null);
  const [currentDirInfo, setCurrentDirInfo] = useState<{ createdAt: number; modifiedAt: number } | null>(null);
  const [loadingCurrentDirStats, setLoadingCurrentDirStats] = useState(false);
  const [loadingCurrentDirSize, setLoadingCurrentDirSize] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // AbortController refs for cancellation
  const folderSizeAbortRef = useRef<AbortController | null>(null);
  const currentDirAbortRef = useRef<AbortController | null>(null);
  const folderStatsAbortRef = useRef<AbortController | null>(null);

  // Track active tab ID in a ref for async operation verification
  const activeTabIdRef = useRef(activeTabId);
  useEffect(() => {
    activeTabIdRef.current = activeTabId;
  }, [activeTabId]);

  const selectedFiles = getSelectedFiles();
  const singleFile = selectedFiles.length === 1 ? selectedFiles[0] : null;

  // Get current path from active tab
  const currentPath = useMemo(() => {
    const activeTab = tabState.tabs.find(t => t.id === tabState.activeTabId);
    return activeTab?.path || '';
  }, [tabState]);

  // Get current directory name
  const currentDirName = useMemo(() => {
    if (!currentPath || currentPath === 'Home') return 'Home';
    return currentPath.split('\\').pop() || currentPath;
  }, [currentPath]);

  // Reset editing state when selection changes
  useEffect(() => {
    setIsEditing(false);
    setEditError(null);
  }, [singleFile?.path]);

  // Fetch folder stats when a folder is selected
  useEffect(() => {
    // Cancel previous request
    if (folderStatsAbortRef.current) {
      folderStatsAbortRef.current.abort();
    }

    if (singleFile && singleFile.isDirectory) {
      const abortController = new AbortController();
      folderStatsAbortRef.current = abortController;
      const tabIdAtStart = activeTabIdRef.current;

      // Helper to check if we should still update state
      const isStillValid = () => !abortController.signal.aborted && activeTabIdRef.current === tabIdAtStart;

      setLoadingStats(true);
      setFolderStats(null);

      window.xplorer.request('fs.folderStats', { path: singleFile.path })
        .then((response) => {
          if (!isStillValid()) return;
          if (response.success && response.data) {
            setFolderStats(response.data as FolderStats);
          }
        })
        .catch((error) => {
          if (isStillValid()) {
            console.error('Failed to fetch folder stats:', error);
          }
        })
        .finally(() => {
          if (isStillValid()) {
            setLoadingStats(false);
          }
        });
    } else {
      setFolderStats(null);
    }

    return () => {
      if (folderStatsAbortRef.current) {
        folderStatsAbortRef.current.abort();
      }
    };
  }, [singleFile?.path, singleFile?.isDirectory]);

  // Fetch folder size when measureFolderSize is enabled
  useEffect(() => {
    // Cancel previous request
    if (folderSizeAbortRef.current) {
      folderSizeAbortRef.current.abort();
    }

    if (singleFile && singleFile.isDirectory && measureFolderSize) {
      const abortController = new AbortController();
      folderSizeAbortRef.current = abortController;
      const tabIdAtStart = activeTabIdRef.current;

      // Helper to check if we should still update state
      const isStillValid = () => !abortController.signal.aborted && activeTabIdRef.current === tabIdAtStart;

      setLoadingSize(true);
      setFolderSize(null);

      window.xplorer.request('fs.folderSize', { path: singleFile.path })
        .then((response) => {
          if (!isStillValid()) return;
          if (response.success && response.data && !(response.data as any).cancelled) {
            const data = response.data as { path: string; size: number };
            setFolderSize(data.size);
          }
        })
        .catch((error) => {
          if (isStillValid()) {
            console.error('Failed to fetch folder size:', error);
          }
        })
        .finally(() => {
          if (isStillValid()) {
            setLoadingSize(false);
          }
        });
    } else {
      setFolderSize(null);
    }

    return () => {
      if (folderSizeAbortRef.current) {
        folderSizeAbortRef.current.abort();
      }
    };
  }, [singleFile?.path, singleFile?.isDirectory, measureFolderSize]);

  // Fetch current directory info when no selection (for showing directory details)
  useEffect(() => {
    // Cancel previous requests
    if (currentDirAbortRef.current) {
      currentDirAbortRef.current.abort();
    }

    const hasSelection = selectedFiles.length > 0;
    const hasHomeSelection = homeSelectedFile !== null;

    if (!hasSelection && !hasHomeSelection && currentPath && currentPath !== 'Home') {
      const abortController = new AbortController();
      currentDirAbortRef.current = abortController;
      const tabIdAtStart = activeTabIdRef.current;

      // Helper to check if we should still update state
      const isStillValid = () => !abortController.signal.aborted && activeTabIdRef.current === tabIdAtStart;

      setLoadingCurrentDirStats(true);
      setCurrentDirStats(null);
      setCurrentDirInfo(null);

      // Fetch folder stats
      window.xplorer.request('fs.folderStats', { path: currentPath })
        .then((response) => {
          if (!isStillValid()) return;
          if (response.success && response.data) {
            setCurrentDirStats(response.data as FolderStats);
          }
        })
        .catch((error) => {
          if (isStillValid()) {
            console.error('Failed to fetch current dir stats:', error);
          }
        })
        .finally(() => {
          if (isStillValid()) {
            setLoadingCurrentDirStats(false);
          }
        });

      // Fetch directory metadata (created/modified dates)
      window.xplorer.request('fs.stat', { path: currentPath })
        .then((response) => {
          if (!isStillValid()) return;
          if (response.success && response.data) {
            const data = response.data as { createdAt: number; modifiedAt: number };
            setCurrentDirInfo({ createdAt: data.createdAt, modifiedAt: data.modifiedAt });
          }
        })
        .catch((error) => {
          if (isStillValid()) {
            console.error('Failed to fetch current dir info:', error);
          }
        });

      // Fetch size if enabled
      if (measureFolderSize) {
        setLoadingCurrentDirSize(true);
        setCurrentDirSize(null);

        window.xplorer.request('fs.folderSize', { path: currentPath })
          .then((response) => {
            if (!isStillValid()) return;
            if (response.success && response.data && !(response.data as any).cancelled) {
              const data = response.data as { path: string; size: number };
              setCurrentDirSize(data.size);
            }
          })
          .catch((error) => {
            if (isStillValid()) {
              console.error('Failed to fetch current dir size:', error);
            }
          })
          .finally(() => {
            if (isStillValid()) {
              setLoadingCurrentDirSize(false);
            }
          });
      }
    } else {
      setCurrentDirStats(null);
      setCurrentDirSize(null);
      setCurrentDirInfo(null);
    }

    return () => {
      if (currentDirAbortRef.current) {
        currentDirAbortRef.current.abort();
      }
    };
  }, [currentPath, selectedFiles.length, homeSelectedFile, measureFolderSize]);

  // Focus input when editing starts
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      // Select filename without extension for files
      if (singleFile && !singleFile.isDirectory) {
        const dotIndex = singleFile.name.lastIndexOf('.');
        if (dotIndex > 0) {
          inputRef.current.setSelectionRange(0, dotIndex);
        } else {
          inputRef.current.select();
        }
      } else {
        inputRef.current.select();
      }
    }
  }, [isEditing, singleFile]);

  const startEditing = useCallback(() => {
    if (singleFile) {
      setEditValue(singleFile.name);
      setEditError(null);
      setIsEditing(true);
    }
  }, [singleFile]);

  const cancelEditing = useCallback(() => {
    setIsEditing(false);
    setEditError(null);
  }, []);

  const handleRename = useCallback(async () => {
    if (!singleFile) return;

    const trimmed = editValue.trim();
    if (!trimmed) {
      setEditError('Name cannot be empty');
      return;
    }

    if (trimmed === singleFile.name) {
      cancelEditing();
      return;
    }

    // Check for invalid characters
    const invalidChars = /[<>:"/\\|?*]/;
    if (invalidChars.test(trimmed)) {
      setEditError('Name contains invalid characters');
      return;
    }

    try {
      const response = await window.xplorer.request('fs.rename', {
        path: singleFile.path,
        newName: trimmed,
      });

      if (response.success) {
        setIsEditing(false);
        setEditError(null);
        triggerRefresh();
      } else {
        setEditError(response.error?.message || 'Failed to rename');
      }
    } catch (error) {
      setEditError('Failed to rename');
    }
  }, [singleFile, editValue, cancelEditing, triggerRefresh]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleRename();
    } else if (e.key === 'Escape') {
      cancelEditing();
    }
  }, [handleRename, cancelEditing]);

  // Determine what to show
  const hasSelection = selectedFiles.length > 0;
  const singleSelection = selectedFiles.length === 1;
  const multiSelection = selectedFiles.length > 1;
  const hasHomeSelection = homeSelectedFile !== null && !hasSelection;

  const renderNoSelection = () => {
    // Show current directory details when no selection
    if (currentPath && currentPath !== 'Home') {
      return (
        <div className="info-panel-content">
          <div className="info-panel-preview">
            <Folder size={72} className="info-icon folder" />
          </div>
          <div className="info-panel-name-container">
            <div className="info-panel-name" title={currentPath}>
              <span>{currentDirName}</span>
            </div>
          </div>
          <div className="info-panel-type">File folder</div>

          <div className="info-panel-details">
            <div className="info-detail-row">
              <span className="info-detail-label">Contains</span>
              <span className="info-detail-value">
                {loadingCurrentDirStats ? (
                  'Loading...'
                ) : currentDirStats ? (
                  `${currentDirStats.fileCount} ${currentDirStats.fileCount === 1 ? 'File' : 'Files'}, ${currentDirStats.folderCount} ${currentDirStats.folderCount === 1 ? 'Folder' : 'Folders'}`
                ) : (
                  `${files.length} items`
                )}
              </span>
            </div>
            {measureFolderSize && (
              <div className="info-detail-row">
                <span className="info-detail-label">Size</span>
                <span className="info-detail-value">
                  {loadingCurrentDirSize ? 'Calculating...' : currentDirSize !== null ? formatSize(currentDirSize) : '—'}
                </span>
              </div>
            )}
            {currentDirInfo && (
              <>
                <div className="info-detail-row">
                  <span className="info-detail-label">Modified</span>
                  <span className="info-detail-value">{formatDate(currentDirInfo.modifiedAt)}</span>
                </div>
                <div className="info-detail-row">
                  <span className="info-detail-label">Created</span>
                  <span className="info-detail-value">{formatDate(currentDirInfo.createdAt)}</span>
                </div>
              </>
            )}
            <div className="info-detail-row info-path-row">
              <span className="info-detail-label">Path</span>
              <div className="info-path-container">
                <input
                  type="text"
                  readOnly
                  value={currentPath}
                  className="info-path-input"
                  title={currentPath}
                  onClick={(e) => e.currentTarget.select()}
                />
                <button
                  className="info-path-copy"
                  onClick={() => navigator.clipboard.writeText(currentPath)}
                  title="Copy path"
                >
                  <Copy size={12} />
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    // Special handling for Home page
    if (currentPath === 'Home') {
      return (
        <div className="info-panel-content">
          <div className="info-panel-preview">
            <Home size={72} className="info-icon home" />
          </div>
          <div className="info-panel-name-container">
            <div className="info-panel-name">
              <span>Home</span>
            </div>
          </div>
        </div>
      );
    }

    // Fallback for invalid/empty path
    return (
      <div className="info-panel-empty">
        <Folder size={64} className="info-icon folder" />
        <p>{files.length} items</p>
      </div>
    );
  };

  // Render a home-selected file (from Recent Files on home page)
  const renderHomeSelectedFile = () => {
    if (!homeSelectedFile) return null;
    const ext = homeSelectedFile.extension.toLowerCase();
    const fileCustomization = fileCustomizations.find((c) => c.path === homeSelectedFile.path);
    const fileAsInfo = { ...homeSelectedFile, isHidden: false, isSystem: false, isReadOnly: false, mimeType: undefined } as FileInfo;
    const fallbackIcon = getFileIcon(fileAsInfo, 72, customFileTypes, defaultTypeIcons, fileCustomization);
    const supportsThumbnail = !homeSelectedFile.isDirectory && (IMAGE_EXTENSIONS.has(ext) || VIDEO_EXTENSIONS.has(ext) || AUDIO_EXTENSIONS.has(ext));

    return (
      <div className="info-panel-content">
        <div className="info-panel-preview">
          {supportsThumbnail ? (
            <InfoPanelThumbnail file={homeSelectedFile} size={120} fallbackIcon={fallbackIcon} />
          ) : (
            fallbackIcon
          )}
        </div>
        <div className="info-panel-name-container">
          <div className="info-panel-name" title={homeSelectedFile.path}>
            <span>{homeSelectedFile.name}</span>
          </div>
        </div>
        <div className="info-panel-type">
          {homeSelectedFile.isDirectory ? 'File folder' : ext ? `${ext.slice(1).toUpperCase()} File` : 'File'}
        </div>

        <div className="info-panel-details">
          {!homeSelectedFile.isDirectory && (
            <div className="info-detail-row">
              <span className="info-detail-label">Size</span>
              <span className="info-detail-value">{formatSize(homeSelectedFile.size)}</span>
            </div>
          )}
          <div className="info-detail-row">
            <span className="info-detail-label">Modified</span>
            <span className="info-detail-value">{formatDate(homeSelectedFile.modifiedAt)}</span>
          </div>
          <div className="info-detail-row">
            <span className="info-detail-label">Created</span>
            <span className="info-detail-value">{formatDate(homeSelectedFile.createdAt)}</span>
          </div>
          <div className="info-detail-row info-path-row">
            <span className="info-detail-label">Path</span>
            <span className="info-detail-value" title={homeSelectedFile.path}>
              {homeSelectedFile.path}
            </span>
          </div>
        </div>
      </div>
    );
  };

  const renderSingleFile = (file: FileInfo) => {
    const fileCustomization = fileCustomizations.find((c) => c.path === file.path);
    const fallbackIcon = getFileIcon(file, 72, customFileTypes, defaultTypeIcons, fileCustomization);
    const ext = file.extension.toLowerCase();
    const supportsThumbnail = !file.isDirectory && (IMAGE_EXTENSIONS.has(ext) || VIDEO_EXTENSIONS.has(ext) || AUDIO_EXTENSIONS.has(ext));

    return (
    <div className="info-panel-content">
      <div className="info-panel-preview">
        {supportsThumbnail ? (
          <InfoPanelThumbnail file={file} size={120} fallbackIcon={fallbackIcon} />
        ) : (
          fallbackIcon
        )}
      </div>
      <div className="info-panel-name-container">
        {isEditing ? (
          <div className="info-panel-name-edit">
            <input
              ref={inputRef}
              type="text"
              className={`info-panel-name-input ${editError ? 'error' : ''}`}
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={handleRename}
            />
            {editError && <div className="info-panel-name-error">{editError}</div>}
          </div>
        ) : (
          <div className="info-panel-name" onClick={startEditing} title="Click to rename">
            <span>{file.name}</span>
            <Pencil size={14} className="info-panel-name-edit-icon" />
          </div>
        )}
      </div>
      <div className="info-panel-type">{getFileType(file)}</div>

      <div className="info-panel-details">
        {file.isDirectory && (
          <div className="info-detail-row">
            <span className="info-detail-label">Contains</span>
            <span className="info-detail-value">
              {loadingStats ? (
                'Loading...'
              ) : folderStats ? (
                `${folderStats.fileCount} ${folderStats.fileCount === 1 ? 'File' : 'Files'}, ${folderStats.folderCount} ${folderStats.folderCount === 1 ? 'Folder' : 'Folders'}`
              ) : (
                '—'
              )}
            </span>
          </div>
        )}
        {file.isDirectory && measureFolderSize && (
          <div className="info-detail-row">
            <span className="info-detail-label">Size</span>
            <span className="info-detail-value">
              {loadingSize ? 'Calculating...' : folderSize !== null ? formatSize(folderSize) : '—'}
            </span>
          </div>
        )}
        {!file.isDirectory && (
          <div className="info-detail-row">
            <span className="info-detail-label">Size</span>
            <span className="info-detail-value">{formatSize(file.size)}</span>
          </div>
        )}
        <div className="info-detail-row">
          <span className="info-detail-label">Modified</span>
          <span className="info-detail-value">{formatDate(file.modifiedAt)}</span>
        </div>
        <div className="info-detail-row">
          <span className="info-detail-label">Created</span>
          <span className="info-detail-value">{formatDate(file.createdAt)}</span>
        </div>
        <div className="info-detail-row info-path-row">
          <span className="info-detail-label">Path</span>
          <div className="info-path-container">
            <input
              type="text"
              readOnly
              value={file.path}
              className="info-path-input"
              title={file.path}
              onClick={(e) => e.currentTarget.select()}
            />
            <button
              className="info-path-copy"
              onClick={() => navigator.clipboard.writeText(file.path)}
              title="Copy path"
            >
              <Copy size={12} />
            </button>
          </div>
        </div>
        {file.isReadOnly && (
          <div className="info-detail-row">
            <span className="info-detail-label">Attributes</span>
            <span className="info-detail-value">Read-only</span>
          </div>
        )}
        {file.isHidden && (
          <div className="info-detail-row">
            <span className="info-detail-label">Attributes</span>
            <span className="info-detail-value">Hidden</span>
          </div>
        )}
      </div>
    </div>
    );
  };

  const renderMultiSelection = () => {
    const totalSize = selectedFiles.reduce((acc, f) => acc + (f.isDirectory ? 0 : f.size), 0);
    const folderCount = selectedFiles.filter((f) => f.isDirectory).length;
    const fileCount = selectedFiles.length - folderCount;

    return (
      <div className="info-panel-content">
        <div className="info-panel-preview multi">
          <Folder size={48} className="info-icon folder" />
          <File size={48} className="info-icon default" />
        </div>
        <div className="info-panel-name">{selectedFiles.length} items selected</div>

        <div className="info-panel-details">
          {folderCount > 0 && (
            <div className="info-detail-row">
              <span className="info-detail-label">Folders</span>
              <span className="info-detail-value">{folderCount}</span>
            </div>
          )}
          {fileCount > 0 && (
            <div className="info-detail-row">
              <span className="info-detail-label">Files</span>
              <span className="info-detail-value">{fileCount}</span>
            </div>
          )}
          <div className="info-detail-row">
            <span className="info-detail-label">Total Size</span>
            <span className="info-detail-value">{formatSize(totalSize)}</span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <aside className="info-panel">
      <div className="info-panel-header">
        <span>Details</span>
        <button className="info-panel-close" onClick={toggleInfoPanel} title="Close">
          <X size={16} />
        </button>
      </div>
      {!hasSelection && !hasHomeSelection && renderNoSelection()}
      {hasHomeSelection && renderHomeSelectedFile()}
      {singleSelection && renderSingleFile(selectedFiles[0])}
      {multiSelection && renderMultiSelection()}
    </aside>
  );
};
