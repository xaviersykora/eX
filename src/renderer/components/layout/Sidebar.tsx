import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  ChevronRight,
  ChevronDown,
  HardDrive,
  Folder,
  Star,
  Clock,
  Download,
  Home,
  Monitor,
  FileText,
  Image,
  Music,
  Video,
  Settings,
  Plus,
  X,
  Eye,
  EyeOff,
  GripVertical,
  Layers,
} from 'lucide-react';
import { useSharedState } from '../../contexts/StateProvider';
import { useSettingsStore, type QuickAccessItem, type CustomSidebarSection } from '../../store/settingsStore';
import { useFileStore } from '../../store/fileStore';
import { InputContextMenu, useInputContextMenu } from '../common/InputContextMenu';
import type { DriveInfo } from '@shared/types';
import { HOME_PATH } from '@shared/types';
import './Sidebar.css';

// Icon mapping
const iconMap: Record<string, React.ReactNode> = {
  Home: <Home size={16} />,
  Monitor: <Monitor size={16} />,
  Download: <Download size={16} />,
  FileText: <FileText size={16} />,
  Image: <Image size={16} />,
  Music: <Music size={16} />,
  Video: <Video size={16} />,
  Folder: <Folder size={16} />,
};

const getIcon = (iconName: string): React.ReactNode => {
  return iconMap[iconName] || <Folder size={16} />;
};

export const Sidebar: React.FC = () => {
  const [drives, setDrives] = useState<DriveInfo[]>([]);
  const [expandedSections, setExpandedSections] = useState({
    quickAccess: true,
    thisPC: true,
  });
  const [showQuickAccessMenu, setShowQuickAccessMenu] = useState(false);
  const [quickAccessMenuPos, setQuickAccessMenuPos] = useState({ top: 0, left: 0 });
  const [showCustomSectionMenu, setShowCustomSectionMenu] = useState<string | null>(null);
  const [customSectionMenuPos, setCustomSectionMenuPos] = useState({ top: 0, left: 0 });
  const [newFolderPath, setNewFolderPath] = useState('');
  const [newCustomSectionPath, setNewCustomSectionPath] = useState('');
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null);
  const [dragOverItemId, setDragOverItemId] = useState<string | null>(null);
  const [dropTargetPath, setDropTargetPath] = useState<string | null>(null);
  const quickAccessButtonRef = useRef<HTMLButtonElement>(null);
  const quickAccessMenuRef = useRef<HTMLDivElement>(null);
  const customSectionButtonRefs = useRef<{ [key: string]: HTMLButtonElement | null }>({});
  const customSectionMenuRef = useRef<HTMLDivElement>(null);

  const { tabs: tabActions, tabState } = useSharedState();

  // Get current path from active tab
  const currentPath = (() => {
    const activeTab = tabState.tabs.find(t => t.id === tabState.activeTabId);
    return activeTab?.path || '';
  })();
  const {
    quickAccessItems,
    initializeDefaultQuickAccess,
    updateQuickAccess,
    removeQuickAccess,
    addQuickAccess,
    reorderQuickAccess,
    customSidebarSections,
    addItemToSidebarSection,
    removeItemFromSidebarSection,
    sidebarSectionOrder,
  } = useSettingsStore();
  const { triggerRefresh } = useFileStore();
  const { contextMenu: inputContextMenu, handleContextMenu: handleInputContextMenu, closeContextMenu: closeInputContextMenu } = useInputContextMenu();

  const [expandedCustomSections, setExpandedCustomSections] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const fetchDrives = async () => {
      try {
        const response = await window.xplorer.request('fs.drives');
        if (response.success && response.data) {
          setDrives(response.data as DriveInfo[]);
        }
      } catch (error) {
        console.error('Failed to fetch drives:', error);
        setDrives([{ letter: 'C:', name: 'Local Disk', type: 3, totalSize: 0, freeSpace: 0, fileSystem: 'NTFS', isReady: true }]);
      }
    };
    const initQuickAccess = async () => {
      try {
        const userHome = await window.xplorer.getUserHome();
        await initializeDefaultQuickAccess(userHome);
      } catch (error) {
        console.error('Failed to get user home:', error);
        await initializeDefaultQuickAccess('C:\\Users');
      }
    };
    fetchDrives();
    initQuickAccess();
  }, [initializeDefaultQuickAccess]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (showQuickAccessMenu) {
        const menuEl = quickAccessMenuRef.current;
        const buttonEl = quickAccessButtonRef.current;
        if (menuEl && buttonEl && !menuEl.contains(target) && !buttonEl.contains(target)) {
          setShowQuickAccessMenu(false);
        }
      }
      if (showCustomSectionMenu) {
        const menuEl = customSectionMenuRef.current;
        const buttonEl = customSectionButtonRefs.current[showCustomSectionMenu];
        if (menuEl && !menuEl.contains(target) && (!buttonEl || !buttonEl.contains(target))) {
          setShowCustomSectionMenu(null);
          setNewCustomSectionPath('');
        }
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showQuickAccessMenu, showCustomSectionMenu]);

  const visibleQuickAccess = [...quickAccessItems]
    .filter((item) => item.visible)
    .sort((a, b) => a.order - b.order);

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const toggleCustomSection = (sectionId: string) => {
    setExpandedCustomSections((prev) => ({ ...prev, [sectionId]: !prev[sectionId] }));
  };

  const sortedCustomSections = [...customSidebarSections].sort((a, b) => a.order - b.order);

  const getSortedSectionOrder = () => {
    const existingIds = new Set(sidebarSectionOrder.map((s) => s.id));
    const customIds = customSidebarSections.map((s) => s.id);
    let maxOrder = Math.max(...sidebarSectionOrder.map((s) => s.order), -1);
    const newSections = customIds
      .filter((id) => !existingIds.has(id))
      .map((id) => ({ id, visible: true, order: ++maxOrder }));
    return [...sidebarSectionOrder, ...newSections].sort((a, b) => a.order - b.order);
  };

  const sortedSectionOrder = getSortedSectionOrder();

  const isSectionVisible = (sectionId: string) => {
    const section = sortedSectionOrder.find((s) => s.id === sectionId);
    return section?.visible ?? true;
  };

  const handleNavigate = (path: string) => {
    tabActions.navigateTo(path);
  };

  const handleAddQuickAccess = () => {
    if (!newFolderPath.trim()) return;
    const name = newFolderPath.split('\\').pop() || newFolderPath;
    addQuickAccess({
      id: `custom-${Date.now()}`,
      name,
      path: newFolderPath,
      icon: 'Folder',
      visible: true,
    });
    setNewFolderPath('');
  };

  const handleAddToCustomSection = (sectionId: string) => {
    if (!newCustomSectionPath.trim()) return;
    const name = newCustomSectionPath.split('\\').pop() || newCustomSectionPath;
    addItemToSidebarSection(sectionId, {
      name,
      path: newCustomSectionPath,
    });
    setNewCustomSectionPath('');
  };

  const handleDragStart = (e: React.DragEvent, itemId: string) => {
    setDraggedItemId(itemId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, itemId: string) => {
    e.preventDefault();
    if (draggedItemId && draggedItemId !== itemId) {
      setDragOverItemId(itemId);
    }
  };

  const handleDragLeave = () => {
    setDragOverItemId(null);
  };

  const handleDrop = (e: React.DragEvent, targetItemId: string) => {
    e.preventDefault();
    if (!draggedItemId || draggedItemId === targetItemId) {
      setDraggedItemId(null);
      setDragOverItemId(null);
      return;
    }
    const sortedItems = [...quickAccessItems].sort((a, b) => a.order - b.order);
    const draggedIndex = sortedItems.findIndex((item) => item.id === draggedItemId);
    const targetIndex = sortedItems.findIndex((item) => item.id === targetItemId);
    if (draggedIndex === -1 || targetIndex === -1) {
      setDraggedItemId(null);
      setDragOverItemId(null);
      return;
    }
    const newItems = [...sortedItems];
    const [draggedItem] = newItems.splice(draggedIndex, 1);
    newItems.splice(targetIndex, 0, draggedItem);
    reorderQuickAccess(newItems);
    setDraggedItemId(null);
    setDragOverItemId(null);
  };

  const handleDragEnd = () => {
    setDraggedItemId(null);
    setDragOverItemId(null);
  };

  const handleFileDragOver = useCallback((e: React.DragEvent, targetPath: string) => {
    if (e.dataTransfer.types.includes('application/x-xplorer-files')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      setDropTargetPath(targetPath);
    }
  }, []);

  const handleFileDragLeave = useCallback(() => {
    setDropTargetPath(null);
  }, []);

  const handleFileDrop = useCallback(async (e: React.DragEvent, targetPath: string) => {
    e.preventDefault();
    setDropTargetPath(null);
    const xplorerData = e.dataTransfer.getData('application/x-xplorer-files');
    if (!xplorerData) return;
    try {
      const paths = JSON.parse(xplorerData) as string[];
      const isInvalidTarget = paths.some(
        (p) => p === targetPath || targetPath.startsWith(p + '\\')
      );
      if (isInvalidTarget) return;
      await window.xplorer.request('fs.move', {
        sources: paths,
        destination: targetPath,
      });
      triggerRefresh();
    } catch (error) {
      console.error('Failed to move files:', error);
    }
  }, [triggerRefresh]);

  const renderQuickAccessSection = () => {
    if (!isSectionVisible('quickAccess')) return null;

    return (
      <div key="quickAccess" className="sidebar-section">
        <div className="sidebar-section-header-group">
          <button
            className="sidebar-section-header"
            onClick={() => toggleSection('quickAccess')}
          >
            {expandedSections.quickAccess ? (
              <ChevronDown size={16} />
            ) : (
              <ChevronRight size={16} />
            )}
            <Star size={16} className="section-icon" />
            <span>Quick Access</span>
          </button>
          <button
            ref={quickAccessButtonRef}
            className="sidebar-config-button"
            onClick={(e) => {
              e.stopPropagation();
              if (!showQuickAccessMenu && quickAccessButtonRef.current) {
                const rect = quickAccessButtonRef.current.getBoundingClientRect();
                setQuickAccessMenuPos({
                  top: rect.top,
                  left: rect.right + 8,
                });
              }
              setShowQuickAccessMenu(!showQuickAccessMenu);
            }}
            title="Configure Quick Access"
          >
            <Settings size={14} />
          </button>
        </div>

        {showQuickAccessMenu && createPortal(
          <div
            ref={quickAccessMenuRef}
            className="quick-access-menu"
            style={{ top: quickAccessMenuPos.top, left: quickAccessMenuPos.left }}
          >
            <div className="quick-access-menu-header">
              <h4>Manage Quick Access</h4>
              <button type="button" onClick={() => setShowQuickAccessMenu(false)}>
                <X size={16} />
              </button>
            </div>
            <div className="quick-access-menu-items">
              {quickAccessItems.sort((a, b) => a.order - b.order).map((item) => (
                <div
                  key={item.id}
                  className={`quick-access-menu-item${dragOverItemId === item.id ? ' drag-over' : ''}${draggedItemId === item.id ? ' dragging' : ''}`}
                  draggable
                  onDragStart={(e) => handleDragStart(e, item.id)}
                  onDragOver={(e) => handleDragOver(e, item.id)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, item.id)}
                  onDragEnd={handleDragEnd}
                >
                  <GripVertical size={14} className="drag-handle" />
                  {getIcon(item.icon)}
                  <span className="item-name">{item.name}</span>
                  <button
                    className="visibility-toggle"
                    onClick={() => updateQuickAccess(item.id, { visible: !item.visible })}
                    title={item.visible ? 'Hide' : 'Show'}
                  >
                    {item.visible ? <Eye size={14} /> : <EyeOff size={14} />}
                  </button>
                  {!item.isDefault && (
                    <button
                      className="remove-button"
                      onClick={() => removeQuickAccess(item.id)}
                      title="Remove"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <div className="quick-access-menu-add">
              <input
                type="text"
                placeholder="Add folder path..."
                value={newFolderPath}
                onChange={(e) => setNewFolderPath(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddQuickAccess()}
                onContextMenu={handleInputContextMenu}
              />
              <button onClick={handleAddQuickAccess}>
                <Plus size={16} />
              </button>
            </div>
          </div>,
          document.body
        )}

        {expandedSections.quickAccess && (
          <div className="sidebar-section-content">
            {visibleQuickAccess.map((item) => {
              const isActive = currentPath === item.path;
              return (
                <button
                  key={item.id}
                  className={`sidebar-item${dropTargetPath === item.path ? ' drop-target' : ''}${isActive ? ' active' : ''}`}
                  onClick={() => handleNavigate(item.path)}
                  onDragOver={(e) => handleFileDragOver(e, item.path)}
                  onDragLeave={handleFileDragLeave}
                  onDrop={(e) => handleFileDrop(e, item.path)}
                >
                  {getIcon(item.icon)}
                  <span>{item.name}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const renderThisPCSection = () => {
    if (!isSectionVisible('thisPC')) return null;

    return (
      <div key="thisPC" className="sidebar-section">
        <button
          className="sidebar-section-header"
          onClick={() => toggleSection('thisPC')}
        >
          {expandedSections.thisPC ? (
            <ChevronDown size={16} />
          ) : (
            <ChevronRight size={16} />
          )}
          <HardDrive size={16} className="section-icon" />
          <span>This PC</span>
        </button>

        {expandedSections.thisPC && (
          <div className="sidebar-section-content">
            {drives.map((drive) => {
              const drivePath = drive.letter + '\\';
              const isActive = currentPath === drivePath;
              return (
                <button
                  key={drive.letter}
                  className={`sidebar-item${dropTargetPath === drivePath ? ' drop-target' : ''}${isActive ? ' active' : ''}`}
                  onClick={() => handleNavigate(drivePath)}
                  onDragOver={(e) => handleFileDragOver(e, drivePath)}
                  onDragLeave={handleFileDragLeave}
                  onDrop={(e) => handleFileDrop(e, drivePath)}
                >
                  <HardDrive size={16} />
                  <span>
                    {drive.name ? `${drive.name} (${drive.letter})` : drive.letter}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const renderCustomSection = (section: CustomSidebarSection) => {
    if (!isSectionVisible(section.id)) return null;

    return (
      <div key={section.id} className="sidebar-section">
        <div className="sidebar-section-header-group">
          <button
            className="sidebar-section-header"
            onClick={() => toggleCustomSection(section.id)}
          >
            {expandedCustomSections[section.id] ? (
              <ChevronDown size={16} />
            ) : (
              <ChevronRight size={16} />
            )}
            {section.icon ? (
              <img src={section.icon} alt="" className="section-icon" style={{ width: 16, height: 16, objectFit: 'contain' }} />
            ) : (
              <Layers size={16} className="section-icon" style={{ color: section.color }} />
            )}
            <span>{section.name}</span>
          </button>
          <button
            ref={(el) => { customSectionButtonRefs.current[section.id] = el; }}
            className="sidebar-config-button"
            onClick={(e) => {
              e.stopPropagation();
              const buttonRef = customSectionButtonRefs.current[section.id];
              if (showCustomSectionMenu !== section.id && buttonRef) {
                const rect = buttonRef.getBoundingClientRect();
                setCustomSectionMenuPos({
                  top: rect.top,
                  left: rect.right + 8,
                });
              }
              setShowCustomSectionMenu(showCustomSectionMenu === section.id ? null : section.id);
              setNewCustomSectionPath('');
            }}
            title={`Manage ${section.name}`}
          >
            <Settings size={14} />
          </button>
        </div>

        {showCustomSectionMenu === section.id && createPortal(
          <div
            ref={customSectionMenuRef}
            className="quick-access-menu"
            style={{ top: customSectionMenuPos.top, left: customSectionMenuPos.left }}
          >
            <div className="quick-access-menu-header">
              <h4>Manage {section.name}</h4>
              <button type="button" onClick={() => setShowCustomSectionMenu(null)}>
                <X size={16} />
              </button>
            </div>
            <div className="quick-access-menu-items">
              {section.items.map((item) => (
                <div key={item.id} className="quick-access-menu-item">
                  <Folder size={14} />
                  <span className="item-name">{item.name}</span>
                  <button
                    className="remove-button"
                    onClick={() => removeItemFromSidebarSection(section.id, item.id)}
                    title="Remove"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
            <div className="quick-access-menu-add">
              <input
                type="text"
                placeholder="Add folder path..."
                value={newCustomSectionPath}
                onChange={(e) => setNewCustomSectionPath(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddToCustomSection(section.id)}
                onContextMenu={handleInputContextMenu}
              />
              <button onClick={() => handleAddToCustomSection(section.id)}>
                <Plus size={16} />
              </button>
            </div>
          </div>,
          document.body
        )}

        {expandedCustomSections[section.id] && (
          <div className="sidebar-section-content">
            {section.items.length === 0 ? (
              <div className="sidebar-empty-section">
                No items yet
              </div>
            ) : (
              section.items.map((item) => {
                const isActive = currentPath === item.path;
                return (
                  <button
                    key={item.id}
                    className={`sidebar-item${dropTargetPath === item.path ? ' drop-target' : ''}${isActive ? ' active' : ''}`}
                    onClick={() => handleNavigate(item.path)}
                    onDragOver={(e) => handleFileDragOver(e, item.path)}
                    onDragLeave={handleFileDragLeave}
                    onDrop={(e) => handleFileDrop(e, item.path)}
                  >
                    <Folder size={16} />
                    <span>{item.name}</span>
                  </button>
                );
              })
            )}
          </div>
        )}
      </div>
    );
  };

  const renderSection = (sectionId: string) => {
    if (sectionId === 'quickAccess') {
      return renderQuickAccessSection();
    }
    if (sectionId === 'thisPC') {
      return renderThisPCSection();
    }
    const customSection = customSidebarSections.find((s) => s.id === sectionId);
    if (customSection) {
      return renderCustomSection(customSection);
    }
    return null;
  };

  return (
    <aside className="sidebar">
      {/* Home Button */}
      <button
        className={`sidebar-item sidebar-home-button${currentPath === HOME_PATH ? ' active' : ''}`}
        onClick={() => handleNavigate(HOME_PATH)}
      >
        <Home size={16} />
        <span>Home</span>
      </button>

      <div className="sidebar-divider" />

      {/* Render sections in configured order */}
      {sortedSectionOrder.map((sectionConfig) => renderSection(sectionConfig.id))}

      {/* Input context menu */}
      {inputContextMenu && (
        <InputContextMenu
          x={inputContextMenu.x}
          y={inputContextMenu.y}
          inputElement={inputContextMenu.element}
          onClose={closeInputContextMenu}
        />
      )}
    </aside>
  );
};
