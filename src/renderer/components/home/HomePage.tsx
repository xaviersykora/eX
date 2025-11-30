import React, { useEffect, useState, useCallback, useRef, memo } from 'react';
import {
  Home,
  Monitor,
  Download,
  FileText,
  Image,
  Music,
  Video,
  Folder,
  Clock,
  Star,
  File,
  RefreshCw,
  FolderOpen,
  ExternalLink,
  FolderInput,
  Clipboard,
  Trash2,
  FileImage,
  FileVideo,
  FileAudio,
  FileCode,
  FileArchive,
} from 'lucide-react';
import type { CustomFileType, DefaultTypeIcons } from '../../store/settingsStore';
import { useTabStore } from '../../store/tabStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useFileStore } from '../../store/fileStore';
import './HomePage.css';

interface RecentFile {
  path: string;
  name: string;
  accessedAt: number;
}

// Extensions that support thumbnails
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.ico', '.tiff', '.tif']);
const VIDEO_EXTENSIONS = new Set(['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.webm', '.flv', '.m4v', '.mpg', '.mpeg']);

// Thumbnail cache for recent files
const recentThumbnailCache = new Map<string, string>();

// Thumbnail component for recent files
interface RecentFileThumbnailProps {
  file: RecentFile;
  size: number;
  fallbackIcon: React.ReactNode;
}

const RecentFileThumbnail: React.FC<RecentFileThumbnailProps> = memo(({ file, size, fallbackIcon }) => {
  const [thumbnail, setThumbnail] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const ext = '.' + (file.name.split('.').pop()?.toLowerCase() || '');
  const supportsThumbnail = IMAGE_EXTENSIONS.has(ext) || VIDEO_EXTENSIONS.has(ext);

  useEffect(() => {
    if (!supportsThumbnail) {
      return;
    }

    const cacheKey = `${file.path}:${size}`;

    // Check cache first
    if (recentThumbnailCache.has(cacheKey)) {
      setThumbnail(recentThumbnailCache.get(cacheKey)!);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(false);

    const fetchThumbnail = async () => {
      try {
        const response = await window.xplorer.request('shell.thumbnail', {
          path: file.path,
          size,
        });

        if (cancelled) return;

        if (response.success && response.data) {
          const dataUrl = `data:image/png;base64,${response.data}`;
          recentThumbnailCache.set(cacheKey, dataUrl);
          setThumbnail(dataUrl);
        } else {
          setError(true);
        }
      } catch (err) {
        if (!cancelled) {
          setError(true);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    fetchThumbnail();

    return () => {
      cancelled = true;
    };
  }, [file.path, size, supportsThumbnail]);

  if (!supportsThumbnail || error || loading) {
    return <>{fallbackIcon}</>;
  }

  if (thumbnail) {
    return (
      <img
        src={thumbnail}
        alt={file.name}
        className="recent-file-thumbnail"
        style={{ width: size, height: size, objectFit: 'cover' }}
      />
    );
  }

  return <>{fallbackIcon}</>;
});

// Icon mapping
const iconMap: Record<string, React.ReactNode> = {
  Home: <Home size={24} />,
  Monitor: <Monitor size={24} />,
  Download: <Download size={24} />,
  FileText: <FileText size={24} />,
  Image: <Image size={24} />,
  Music: <Music size={24} />,
  Video: <Video size={24} />,
  Folder: <Folder size={24} />,
};

const getIcon = (iconName: string): React.ReactNode => {
  return iconMap[iconName] || <Folder size={24} />;
};

// Get file icon based on extension - supports custom file types and default type icons
// Uses CSS classes for colors (set via CSS variables from App.tsx)
const getFileIcon = (
  fileName: string,
  customFileTypes: CustomFileType[] = [],
  defaultTypeIcons: DefaultTypeIcons = {},
  size: number = 20
): React.ReactNode => {
  const ext = '.' + (fileName.split('.').pop()?.toLowerCase() || '');

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
  if (['.mp3', '.wav', '.flac', '.aac', '.ogg', '.m4a'].includes(ext)) {
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
  if (['.txt', '.md', '.log', '.ini', '.cfg', '.conf', '.doc', '.docx', '.pdf', '.rtf', '.odt'].includes(ext)) {
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

// Format relative time
const formatRelativeTime = (timestamp: number): string => {
  const now = Date.now();
  const diff = now - timestamp;

  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  if (days < 7) return `${days} day${days > 1 ? 's' : ''} ago`;

  return new Date(timestamp).toLocaleDateString();
};

// Context menu for recent files
interface RecentFileContextMenuProps {
  x: number;
  y: number;
  file: RecentFile;
  onClose: () => void;
  onAction: (action: string, file: RecentFile) => void;
}

const RecentFileContextMenu: React.FC<RecentFileContextMenuProps> = ({
  x,
  y,
  file,
  onClose,
  onAction,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
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

  const menuItems = [
    { id: 'open', label: 'Open', icon: <FolderOpen size={16} /> },
    { id: 'open-with', label: 'Open with...', icon: <ExternalLink size={16} /> },
    { id: 'separator-1' },
    { id: 'open-file-location', label: 'Open file location', icon: <FolderInput size={16} /> },
    { id: 'copy-path', label: 'Copy path', icon: <Clipboard size={16} /> },
    { id: 'separator-2' },
    { id: 'remove-from-recent', label: 'Remove from recent', icon: <Trash2 size={16} />, danger: true },
  ];

  return (
    <div ref={menuRef} className="recent-context-menu" style={{ left: x, top: y }}>
      {menuItems.map((item) =>
        item.id.startsWith('separator') ? (
          <div key={item.id} className="recent-context-menu-separator" />
        ) : (
          <button
            key={item.id}
            className={`recent-context-menu-item ${(item as any).danger ? 'danger' : ''}`}
            onClick={() => {
              onAction(item.id, file);
              onClose();
            }}
          >
            <span className="recent-context-menu-icon">{(item as any).icon}</span>
            <span>{item.label}</span>
          </button>
        )
      )}
    </div>
  );
};

export const HomePage: React.FC = () => {
  const { navigateTo } = useTabStore();
  const { quickAccessItems, customFileTypes, defaultTypeIcons, promptBeforeOpen } = useSettingsStore();
  const { setHomeSelectedFile, clearSelection } = useFileStore();
  const [recentFiles, setRecentFiles] = useState<RecentFile[]>([]);
  const [loadingRecent, setLoadingRecent] = useState(true);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; file: RecentFile } | null>(null);
  const [selectedRecentFile, setSelectedRecentFile] = useState<string | null>(null);

  // Fetch recent files from Windows on mount
  useEffect(() => {
    fetchRecentFiles();
  }, []);

  // Clear file store selection when homepage mounts, and clear home selection when unmounting
  useEffect(() => {
    // Clear regular file selection so InfoPanel re-initializes for home page
    clearSelection();

    return () => {
      setHomeSelectedFile(null);
    };
  }, [setHomeSelectedFile, clearSelection]);

  const fetchRecentFiles = async () => {
    setLoadingRecent(true);
    try {
      const response = await window.xplorer.request('shell.recent', { limit: 20 });
      if (response.success && response.data) {
        setRecentFiles(response.data as RecentFile[]);
      }
    } catch (error) {
      console.error('Failed to fetch recent files:', error);
    } finally {
      setLoadingRecent(false);
    }
  };

  // Sort quick access items by order and filter visible ones
  const visibleQuickAccess = [...quickAccessItems]
    .filter((item) => item.visible)
    .sort((a, b) => a.order - b.order);

  const handleNavigate = (path: string) => {
    navigateTo(path);
  };

  const handleOpenFile = async (path: string, fileName?: string) => {
    try {
      // Check if prompt is needed
      if (promptBeforeOpen) {
        const name = fileName || path.split('\\').pop() || path;
        const confirmed = window.confirm(`Open "${name}" with the default application?`);
        if (!confirmed) return;
      }
      await window.xplorer.request('shell.open', { path });
    } catch (error) {
      console.error('Failed to open file:', error);
    }
  };

  const handleRecentFileContextMenu = useCallback((e: React.MouseEvent, file: RecentFile) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedRecentFile(file.path);
    setContextMenu({ x: e.clientX, y: e.clientY, file });
  }, []);

  // Single click selects the file and fetches its info for the InfoPanel
  const handleRecentFileClick = useCallback(async (file: RecentFile) => {
    setSelectedRecentFile(file.path);

    // Fetch full file info for the InfoPanel
    try {
      const response = await window.xplorer.request('fs.info', { path: file.path });
      if (response.success && response.data) {
        const fileInfo = response.data as {
          name: string;
          path: string;
          size: number;
          modifiedAt: number;
          createdAt: number;
          accessedAt: number;
          isDirectory: boolean;
          extension: string;
        };
        setHomeSelectedFile({
          path: fileInfo.path,
          name: fileInfo.name,
          size: fileInfo.size,
          modifiedAt: fileInfo.modifiedAt,
          createdAt: fileInfo.createdAt,
          accessedAt: fileInfo.accessedAt,
          isDirectory: fileInfo.isDirectory,
          extension: fileInfo.extension,
        });
      }
    } catch (error) {
      console.error('Failed to fetch file info:', error);
    }
  }, [setHomeSelectedFile]);

  // Double click opens the file
  const handleRecentFileDoubleClick = useCallback((file: RecentFile) => {
    handleOpenFile(file.path, file.name);
  }, []);

  // Handle drag start for recent files
  const handleRecentFileDragStart = useCallback((e: React.DragEvent, file: RecentFile) => {
    const paths = [file.path];

    // Set data for internal moves
    e.dataTransfer.effectAllowed = 'copyMove';
    e.dataTransfer.setData('application/x-xplorer-files', JSON.stringify(paths));
    e.dataTransfer.setData('text/plain', file.path);

    // Trigger native drag for external applications
    window.xplorer.startDrag(paths);
  }, []);

  // Handle drop on Quick Access item
  const handleQuickAccessDrop = useCallback(async (e: React.DragEvent, targetPath: string) => {
    e.preventDefault();
    e.stopPropagation();

    // Check for internal XPlorer file data first
    const xplorerData = e.dataTransfer.getData('application/x-xplorer-files');
    if (xplorerData) {
      try {
        const paths = JSON.parse(xplorerData) as string[];

        // Don't move if target is one of the sources or within them
        if (paths.includes(targetPath)) return;
        const isTargetWithinSource = paths.some(
          (p) => targetPath.startsWith(p + '\\')
        );
        if (isTargetWithinSource) return;

        await window.xplorer.request('fs.move', {
          sources: paths,
          destination: targetPath,
        });
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
            destination: targetPath,
          });
        } catch (error) {
          console.error('Failed to copy files:', error);
        }
      }
    }
  }, []);

  // Track which Quick Access item is being dragged over
  const [dragOverQuickAccess, setDragOverQuickAccess] = useState<string | null>(null);

  const handleRecentFileAction = useCallback(async (action: string, file: RecentFile) => {
    switch (action) {
      case 'open':
        handleOpenFile(file.path, file.name);
        break;

      case 'open-with':
        await window.xplorer.request('shell.execute', {
          path: 'rundll32.exe',
          verb: 'open',
          args: `shell32.dll,OpenAs_RunDLL ${file.path}`,
        });
        break;

      case 'open-file-location':
        const parentPath = file.path.substring(0, file.path.lastIndexOf('\\'));
        navigateTo(parentPath);
        break;

      case 'copy-path':
        await navigator.clipboard.writeText(file.path);
        break;

      case 'remove-from-recent':
        // Remove the .lnk file from the Recent folder
        const recentFolder = `${process.env.APPDATA || ''}\\Microsoft\\Windows\\Recent`;
        const lnkPath = `${recentFolder}\\${file.name}.lnk`;
        try {
          await window.xplorer.request('fs.delete', {
            paths: [lnkPath],
            recycleBin: false,
          });
          // Refresh the list
          fetchRecentFiles();
        } catch (error) {
          console.error('Failed to remove from recent:', error);
        }
        break;
    }
  }, [navigateTo]);

  return (
    <div className="home-page">
      {/* Quick Access Section */}
      <section className="home-section">
        <div className="home-section-header">
          <Star size={20} />
          <h2>Quick Access</h2>
        </div>
        <div className="quick-access-grid">
          {visibleQuickAccess.map((item) => (
            <button
              key={item.id}
              className={`quick-access-card ${dragOverQuickAccess === item.id ? 'drag-over' : ''}`}
              onClick={() => handleNavigate(item.path)}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                setDragOverQuickAccess(item.id);
              }}
              onDragLeave={() => setDragOverQuickAccess(null)}
              onDrop={(e) => {
                setDragOverQuickAccess(null);
                handleQuickAccessDrop(e, item.path);
              }}
            >
              <div className="quick-access-icon">
                {getIcon(item.icon)}
              </div>
              <span className="quick-access-name">{item.name}</span>
            </button>
          ))}
          {visibleQuickAccess.length === 0 && (
            <p className="home-empty-text">
              No quick access items configured. Use the settings icon in the sidebar to add locations.
            </p>
          )}
        </div>
      </section>

      {/* Recent Files Section */}
      <section className="home-section">
        <div className="home-section-header">
          <Clock size={20} />
          <h2>Recent Files</h2>
          <button
            className="refresh-recent-btn"
            onClick={fetchRecentFiles}
            disabled={loadingRecent}
            title="Refresh recent files"
          >
            <RefreshCw size={16} className={loadingRecent ? 'spinning' : ''} />
          </button>
        </div>
        <div className="recent-files-list">
          {loadingRecent ? (
            <p className="home-empty-text">Loading recent files...</p>
          ) : recentFiles.length === 0 ? (
            <p className="home-empty-text">
              No recent files found.
            </p>
          ) : (
            recentFiles.map((file) => (
              <button
                key={file.path}
                className={`recent-file-item ${selectedRecentFile === file.path ? 'selected' : ''}`}
                onClick={() => handleRecentFileClick(file)}
                onDoubleClick={() => handleRecentFileDoubleClick(file)}
                onContextMenu={(e) => handleRecentFileContextMenu(e, file)}
                draggable
                onDragStart={(e) => handleRecentFileDragStart(e, file)}
              >
                <div className="recent-file-icon">
                  <RecentFileThumbnail
                    file={file}
                    size={40}
                    fallbackIcon={getFileIcon(file.name, customFileTypes, defaultTypeIcons, 40)}
                  />
                </div>
                <div className="recent-file-info">
                  <span className="recent-file-name">{file.name}</span>
                  <span className="recent-file-path">{file.path}</span>
                </div>
                <span className="recent-file-time">
                  {formatRelativeTime(file.accessedAt)}
                </span>
              </button>
            ))
          )}
        </div>
      </section>

      {/* Context menu for recent files */}
      {contextMenu && (
        <RecentFileContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          file={contextMenu.file}
          onClose={() => setContextMenu(null)}
          onAction={handleRecentFileAction}
        />
      )}
    </div>
  );
};
