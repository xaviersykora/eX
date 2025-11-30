import React, { useState, useRef } from 'react';
import { GripVertical, Pencil, Trash2, Plus, Check, X, Folder, Upload, Star, HardDrive, Eye, EyeOff, Layers } from 'lucide-react';
import { useSettingsStore } from '../../../store/settingsStore';
import type { CustomSidebarSection, SidebarSectionConfig } from '../../../store/settingsStore';

export const SidebarTab: React.FC = () => {
  const {
    customSidebarSections,
    addCustomSidebarSection,
    removeCustomSidebarSection,
    updateCustomSidebarSection,
    reorderCustomSidebarSections,
    sidebarSectionOrder,
    updateSidebarSectionOrder,
    setSidebarSectionVisibility,
  } = useSettingsStore();

  const [showAddForm, setShowAddForm] = useState(false);
  const [newSectionName, setNewSectionName] = useState('');
  const [newSectionColor, setNewSectionColor] = useState('#0078d4');
  const [draggedOrderIndex, setDraggedOrderIndex] = useState<number | null>(null);
  const [newSectionIcon, setNewSectionIcon] = useState<string | undefined>(undefined);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  const newIconInputRef = useRef<HTMLInputElement>(null);
  const sectionIconInputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});

  const handleImageUpload = (file: File, callback: (base64: string) => void) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      callback(result);
    };
    reader.readAsDataURL(file);
  };

  const handleNewIconChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleImageUpload(file, setNewSectionIcon);
    }
  };

  const handleSectionIconChange = (sectionId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleImageUpload(file, (base64) => {
        updateCustomSidebarSection(sectionId, { icon: base64 });
      });
    }
  };

  const handleAddSection = () => {
    if (!newSectionName.trim()) return;

    addCustomSidebarSection({
      name: newSectionName.trim(),
      color: newSectionColor,
      icon: newSectionIcon,
      items: [],
    });

    setNewSectionName('');
    setNewSectionColor('#0078d4');
    setNewSectionIcon(undefined);
    if (newIconInputRef.current) {
      newIconInputRef.current.value = '';
    }
    setShowAddForm(false);
  };

  const startEditing = (section: CustomSidebarSection) => {
    setEditingId(section.id);
    setEditName(section.name);
  };

  const saveEditing = () => {
    if (editingId && editName.trim()) {
      updateCustomSidebarSection(editingId, { name: editName.trim() });
    }
    setEditingId(null);
    setEditName('');
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditName('');
  };

  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;

    const newOrder = [...customSidebarSections];
    const [removed] = newOrder.splice(draggedIndex, 1);
    newOrder.splice(index, 0, removed);
    reorderCustomSidebarSections(newOrder.map(s => s.id));
    setDraggedIndex(index);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
  };

  // Handlers for sidebar section order drag and drop
  const handleOrderDragStart = (index: number) => {
    setDraggedOrderIndex(index);
  };

  const handleOrderDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedOrderIndex === null || draggedOrderIndex === index) return;

    const sortedSections = [...sidebarSectionOrder].sort((a, b) => a.order - b.order);
    const newOrder = [...sortedSections];
    const [removed] = newOrder.splice(draggedOrderIndex, 1);
    newOrder.splice(index, 0, removed);

    // Update order numbers
    const updatedSections = newOrder.map((section, idx) => ({
      ...section,
      order: idx,
    }));

    updateSidebarSectionOrder(updatedSections);
    setDraggedOrderIndex(index);
  };

  const handleOrderDragEnd = () => {
    setDraggedOrderIndex(null);
  };

  // Get section display info
  const getSectionInfo = (sectionId: string) => {
    if (sectionId === 'quickAccess') {
      return { name: 'Quick Access', icon: <Star size={16} />, isDefault: true };
    }
    if (sectionId === 'thisPC') {
      return { name: 'This PC', icon: <HardDrive size={16} />, isDefault: true };
    }
    const customSection = customSidebarSections.find((s) => s.id === sectionId);
    if (customSection) {
      return {
        name: customSection.name,
        icon: customSection.icon ? (
          <img src={customSection.icon} alt="" style={{ width: 16, height: 16, objectFit: 'contain' }} />
        ) : (
          <Layers size={16} style={{ color: customSection.color }} />
        ),
        isDefault: false,
      };
    }
    return { name: 'Unknown', icon: <Folder size={16} />, isDefault: false };
  };

  // Get sorted section order, merging with custom sections
  const getSortedSectionOrder = (): SidebarSectionConfig[] => {
    const existingIds = new Set(sidebarSectionOrder.map((s) => s.id));
    const customIds = customSidebarSections.map((s) => s.id);

    // Add any custom sections not yet in the order
    let maxOrder = Math.max(...sidebarSectionOrder.map((s) => s.order), -1);
    const newSections = customIds
      .filter((id) => !existingIds.has(id))
      .map((id) => ({ id, visible: true, order: ++maxOrder }));

    return [...sidebarSectionOrder, ...newSections].sort((a, b) => a.order - b.order);
  };

  const sortedSectionOrder = getSortedSectionOrder();

  return (
    <div className="settings-tab-content">
      <div className="settings-section">
        <h3 className="settings-section-title">Custom Sections</h3>
        <p className="settings-section-description">
          Create custom sidebar sections to organize your favorite folders
        </p>

        <div className="sidebar-section-list">
          {customSidebarSections.map((section, index) => (
            <div
              key={section.id}
              className={`sidebar-section-item ${draggedIndex === index ? 'dragging' : ''}`}
              draggable
              onDragStart={() => handleDragStart(index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDragEnd={handleDragEnd}
            >
              <div className="sidebar-section-drag-handle">
                <GripVertical size={16} />
              </div>

              <div
                className="sidebar-section-icon-preview"
                onClick={() => sectionIconInputRefs.current[section.id]?.click()}
                title="Click to change icon"
                style={{ cursor: 'pointer' }}
              >
                {section.icon ? (
                  <img src={section.icon} alt="" style={{ width: 20, height: 20, objectFit: 'contain' }} />
                ) : (
                  <Folder size={20} style={{ color: section.color }} />
                )}
                <input
                  ref={(el) => { sectionIconInputRefs.current[section.id] = el; }}
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={(e) => handleSectionIconChange(section.id, e)}
                />
              </div>

              {section.icon && (
                <button
                  className="sidebar-section-action"
                  onClick={() => updateCustomSidebarSection(section.id, { icon: undefined })}
                  title="Remove custom icon"
                  style={{ marginRight: 4 }}
                >
                  <X size={14} />
                </button>
              )}

              <div className="color-picker-wrapper">
                <input
                  type="color"
                  className="color-input-inline"
                  value={section.color}
                  onChange={(e) => updateCustomSidebarSection(section.id, { color: e.target.value })}
                  title="Section color"
                />
              </div>

              {editingId === section.id ? (
                <>
                  <input
                    type="text"
                    className="settings-input inline"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') saveEditing();
                      if (e.key === 'Escape') cancelEditing();
                    }}
                    autoFocus
                  />
                  <div className="sidebar-section-actions">
                    <button className="sidebar-section-action" onClick={saveEditing} title="Save">
                      <Check size={16} />
                    </button>
                    <button className="sidebar-section-action" onClick={cancelEditing} title="Cancel">
                      <X size={16} />
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <span className="sidebar-section-name">{section.name}</span>
                  <span className="sidebar-section-count">
                    {section.items.length} {section.items.length === 1 ? 'item' : 'items'}
                  </span>
                  <div className="sidebar-section-actions">
                    <button
                      className="sidebar-section-action"
                      onClick={() => startEditing(section)}
                      title="Rename"
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      className="sidebar-section-action"
                      onClick={() => removeCustomSidebarSection(section.id)}
                      title="Remove"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}

          {showAddForm ? (
            <div className="sidebar-section-item add-form">
              <div
                className="sidebar-section-icon-preview"
                onClick={() => newIconInputRef.current?.click()}
                title="Click to set custom icon"
                style={{ cursor: 'pointer' }}
              >
                {newSectionIcon ? (
                  <img src={newSectionIcon} alt="" style={{ width: 20, height: 20, objectFit: 'contain' }} />
                ) : (
                  <Folder size={20} style={{ color: newSectionColor }} />
                )}
                <input
                  ref={newIconInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={handleNewIconChange}
                />
              </div>
              {newSectionIcon && (
                <button
                  className="sidebar-section-action"
                  onClick={() => {
                    setNewSectionIcon(undefined);
                    if (newIconInputRef.current) newIconInputRef.current.value = '';
                  }}
                  title="Remove icon"
                  style={{ marginRight: 4 }}
                >
                  <X size={14} />
                </button>
              )}
              <input
                type="color"
                className="color-input-inline"
                value={newSectionColor}
                onChange={(e) => setNewSectionColor(e.target.value)}
              />
              <input
                type="text"
                className="settings-input inline"
                placeholder="Section name"
                value={newSectionName}
                onChange={(e) => setNewSectionName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddSection();
                  if (e.key === 'Escape') setShowAddForm(false);
                }}
                autoFocus
              />
              <div className="sidebar-section-actions">
                <button className="sidebar-section-action" onClick={handleAddSection} title="Add">
                  <Check size={16} />
                </button>
                <button className="sidebar-section-action" onClick={() => setShowAddForm(false)} title="Cancel">
                  <X size={16} />
                </button>
              </div>
            </div>
          ) : (
            <button className="settings-add-button" onClick={() => setShowAddForm(true)}>
              <Plus size={16} />
              <span>Add custom section</span>
            </button>
          )}
        </div>
      </div>

      <div className="settings-section">
        <h3 className="settings-section-title">Section Order & Visibility</h3>
        <p className="settings-section-description">
          Drag to reorder sidebar sections. Click the eye icon to show/hide sections.
        </p>
        <div className="sidebar-section-list">
          {sortedSectionOrder.map((section, index) => {
            const sectionInfo = getSectionInfo(section.id);
            // Skip if section no longer exists (custom section was deleted)
            if (sectionInfo.name === 'Unknown') return null;

            return (
              <div
                key={section.id}
                className={`sidebar-section-item ${draggedOrderIndex === index ? 'dragging' : ''} ${!section.visible ? 'hidden-section' : ''}`}
                draggable
                onDragStart={() => handleOrderDragStart(index)}
                onDragOver={(e) => handleOrderDragOver(e, index)}
                onDragEnd={handleOrderDragEnd}
              >
                <div className="sidebar-section-drag-handle">
                  <GripVertical size={16} />
                </div>
                <span className="section-order-number">{index + 1}</span>
                <div className="sidebar-section-icon-preview">
                  {sectionInfo.icon}
                </div>
                <span className="sidebar-section-name">{sectionInfo.name}</span>
                {sectionInfo.isDefault && (
                  <span className="sidebar-section-badge">Default</span>
                )}
                <button
                  className="sidebar-section-action visibility-toggle"
                  onClick={() => setSidebarSectionVisibility(section.id, !section.visible)}
                  title={section.visible ? 'Hide section' : 'Show section'}
                >
                  {section.visible ? <Eye size={16} /> : <EyeOff size={16} />}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
