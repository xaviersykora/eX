import React, { useRef, useState } from 'react';
import {
  Folder,
  FileImage,
  FileVideo,
  FileAudio,
  FileCode,
  FileArchive,
  FileText,
  File,
  Plus,
  Trash2,
  Upload,
  X,
  Sparkles,
  Layers,
} from 'lucide-react';
import { useSettingsStore } from '../../../store/settingsStore';
import type { CustomFileType, IconColors, DefaultTypeIcons, UIStyle } from '../../../store/settingsStore';

const ACCENT_PRESETS = [
  '#0078d4', // Windows Blue
  '#107c10', // Green
  '#e81123', // Red
  '#ff8c00', // Orange
  '#881798', // Purple
  '#00b7c3', // Teal
  '#e3008c', // Pink
  '#767676', // Gray
];

interface IconTypeConfig {
  id: string;
  name: string;
  extensions: string;
  icon: React.ReactNode;
  colorKey: keyof IconColors;
}

const DEFAULT_ICON_TYPES: IconTypeConfig[] = [
  { id: 'folder', name: 'Folders', extensions: 'directories', icon: <Folder size={24} />, colorKey: 'folder' },
  { id: 'image', name: 'Images', extensions: '.jpg, .png, .gif, .svg, .webp', icon: <FileImage size={24} />, colorKey: 'image' },
  { id: 'video', name: 'Videos', extensions: '.mp4, .mkv, .avi, .mov, .webm', icon: <FileVideo size={24} />, colorKey: 'video' },
  { id: 'audio', name: 'Audio', extensions: '.mp3, .wav, .flac, .ogg, .m4a', icon: <FileAudio size={24} />, colorKey: 'audio' },
  { id: 'code', name: 'Code', extensions: '.js, .ts, .py, .java, .cpp, .rs', icon: <FileCode size={24} />, colorKey: 'code' },
  { id: 'archive', name: 'Archives', extensions: '.zip, .rar, .7z, .tar, .gz', icon: <FileArchive size={24} />, colorKey: 'archive' },
  { id: 'text', name: 'Text', extensions: '.txt, .md, .log, .ini, .cfg', icon: <FileText size={24} />, colorKey: 'text' },
  { id: 'default', name: 'Other Files', extensions: 'all other files', icon: <File size={24} />, colorKey: 'default' },
];

export const AppearanceTab: React.FC = () => {
  const {
    uiStyle,
    setUIStyle,
    accentColor,
    setAccentColor,
    iconColors,
    setIconColor,
    defaultTypeIcons,
    setDefaultTypeIcon,
    customFileTypes,
    addCustomFileType,
    removeCustomFileType,
    updateCustomFileType
  } = useSettingsStore();

  const accentColorInputRef = useRef<HTMLInputElement>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTypeName, setNewTypeName] = useState('');
  const [newTypeExtensions, setNewTypeExtensions] = useState('');
  const [newTypeColor, setNewTypeColor] = useState('#569cd6');
  const [newTypeIcon, setNewTypeIcon] = useState<string | undefined>(undefined);
  const colorInputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const editFileInputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});
  const defaultTypeFileInputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});

  const handleAccentSwatchClick = () => {
    accentColorInputRef.current?.click();
  };

  const handleAccentColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setAccentColor(e.target.value);
  };

  const handleAccentPresetClick = (color: string) => {
    setAccentColor(color);
  };

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
      handleImageUpload(file, setNewTypeIcon);
    }
  };

  const handleEditIconChange = (typeId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleImageUpload(file, (base64) => {
        updateCustomFileType(typeId, { customIcon: base64 });
      });
    }
  };

  const handleDefaultTypeIconChange = (typeId: keyof DefaultTypeIcons, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleImageUpload(file, (base64) => {
        setDefaultTypeIcon(typeId, base64);
      });
    }
  };

  const clearNewIcon = () => {
    setNewTypeIcon(undefined);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleColorClick = (typeId: string) => {
    colorInputRefs.current[typeId]?.click();
  };

  const handleColorChange = (colorKey: keyof typeof iconColors, color: string) => {
    setIconColor(colorKey, color);
  };

  const handleAddCustomType = () => {
    if (!newTypeName.trim() || !newTypeExtensions.trim()) return;

    addCustomFileType({
      name: newTypeName.trim(),
      extensions: newTypeExtensions.split(',').map(ext => ext.trim().toLowerCase()),
      color: newTypeColor,
      customIcon: newTypeIcon,
    });

    setNewTypeName('');
    setNewTypeExtensions('');
    setNewTypeColor('#569cd6');
    setNewTypeIcon(undefined);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    setShowAddForm(false);
  };

  return (
    <div className="settings-tab-content">
      {/* UI Style Section */}
      <div className="settings-section">
        <h3 className="settings-section-title">UI Style</h3>
        <div className="ui-style-selector">
          <button
            className={`ui-style-option ${uiStyle === 'classic' ? 'active' : ''}`}
            onClick={() => setUIStyle('classic')}
          >
            <div className="ui-style-preview ui-style-classic">
              <div className="preview-titlebar" />
              <div className="preview-content">
                <div className="preview-sidebar" />
                <div className="preview-main" />
              </div>
            </div>
            <div className="ui-style-info">
              <Layers size={16} />
              <span className="ui-style-name">Classic</span>
            </div>
            <span className="ui-style-description">Traditional solid backgrounds with clean, flat design</span>
          </button>
          <button
            className={`ui-style-option ${uiStyle === 'glass' ? 'active' : ''}`}
            onClick={() => setUIStyle('glass')}
          >
            <div className="ui-style-preview ui-style-glass">
              <div className="preview-titlebar" />
              <div className="preview-content">
                <div className="preview-sidebar" />
                <div className="preview-main" />
              </div>
            </div>
            <div className="ui-style-info">
              <Sparkles size={16} />
              <span className="ui-style-name">Glass</span>
            </div>
            <span className="ui-style-description">Modern translucent surfaces with blur effects</span>
          </button>
        </div>
      </div>

      {/* Accent Color Section */}
      <div className="settings-section">
        <h3 className="settings-section-title">Accent Color</h3>

        <div className="settings-row">
          <div className="settings-row-info">
            <span className="settings-row-label">Theme accent color</span>
            <span className="settings-row-description">
              Used for selections, buttons, and highlights
            </span>
          </div>

          <div className="color-picker-wrapper">
            <div className="color-presets">
              {ACCENT_PRESETS.map((color) => (
                <button
                  key={color}
                  className={`color-preset ${accentColor === color ? 'active' : ''}`}
                  style={{ backgroundColor: color }}
                  onClick={() => handleAccentPresetClick(color)}
                  title={color}
                />
              ))}
            </div>
            <button
              className="color-swatch"
              style={{ backgroundColor: accentColor }}
              onClick={handleAccentSwatchClick}
              title="Choose custom color"
            />
            <input
              ref={accentColorInputRef}
              type="color"
              className="color-input"
              value={accentColor}
              onChange={handleAccentColorChange}
            />
          </div>
        </div>
      </div>

      {/* Default Icon Colors Section */}
      <div className="settings-section">
        <h3 className="settings-section-title">Default Icon Colors</h3>
        <div className="icon-type-list">
          {DEFAULT_ICON_TYPES.map((type) => {
            const customIcon = defaultTypeIcons[type.colorKey as keyof DefaultTypeIcons];
            return (
              <div key={type.id} className="icon-type-item">
                <div
                  className="icon-type-preview"
                  style={{ color: iconColors[type.colorKey], cursor: 'pointer' }}
                  onClick={() => defaultTypeFileInputRefs.current[type.id]?.click()}
                  title="Click to upload custom icon"
                >
                  {customIcon ? (
                    <img src={customIcon} alt="" style={{ width: 24, height: 24, objectFit: 'contain' }} />
                  ) : (
                    type.icon
                  )}
                  <input
                    ref={(el) => { defaultTypeFileInputRefs.current[type.id] = el; }}
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={(e) => handleDefaultTypeIconChange(type.colorKey as keyof DefaultTypeIcons, e)}
                  />
                </div>
                <div className="icon-type-info">
                  <div className="icon-type-name">{type.name}</div>
                  <div className="icon-type-extensions">{type.extensions}</div>
                </div>
                {customIcon && (
                  <button
                    className="sidebar-section-action"
                    onClick={() => setDefaultTypeIcon(type.colorKey as keyof DefaultTypeIcons, undefined)}
                    title="Remove custom icon"
                    style={{ marginRight: 4 }}
                  >
                    <X size={14} />
                  </button>
                )}
                <div className="color-picker-wrapper">
                  <button
                    className="color-swatch"
                    style={{ backgroundColor: iconColors[type.colorKey] }}
                    onClick={() => handleColorClick(type.id)}
                    title="Change color"
                  />
                  <input
                    ref={(el) => { colorInputRefs.current[type.id] = el; }}
                    type="color"
                    className="color-input"
                    value={iconColors[type.colorKey]}
                    onChange={(e) => handleColorChange(type.colorKey, e.target.value)}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Custom File Types Section */}
      <div className="settings-section">
        <h3 className="settings-section-title">Custom File Types</h3>
        <div className="icon-type-list">
          {customFileTypes.map((customType) => (
            <div key={customType.id} className="icon-type-item">
              <div className="icon-type-preview" style={{ cursor: 'pointer' }} onClick={() => editFileInputRefs.current[customType.id]?.click()} title="Click to upload custom icon">
                {customType.customIcon ? (
                  <img src={customType.customIcon} alt="" style={{ width: 24, height: 24, objectFit: 'contain' }} />
                ) : (
                  <File size={24} style={{ color: customType.color }} />
                )}
                <input
                  ref={(el) => { editFileInputRefs.current[customType.id] = el; }}
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={(e) => handleEditIconChange(customType.id, e)}
                />
              </div>
              <div className="icon-type-info">
                <div className="icon-type-name">{customType.name}</div>
                <div className="icon-type-extensions">{customType.extensions.join(', ')}</div>
              </div>
              {customType.customIcon && (
                <button
                  className="sidebar-section-action"
                  onClick={() => updateCustomFileType(customType.id, { customIcon: undefined })}
                  title="Remove custom icon"
                  style={{ marginRight: 4 }}
                >
                  <X size={14} />
                </button>
              )}
              <div className="color-picker-wrapper">
                <button
                  className="color-swatch"
                  style={{ backgroundColor: customType.color }}
                  onClick={() => handleColorClick(`custom-${customType.id}`)}
                  title="Change color"
                />
                <input
                  ref={(el) => { colorInputRefs.current[`custom-${customType.id}`] = el; }}
                  type="color"
                  className="color-input"
                  value={customType.color}
                  onChange={(e) => updateCustomFileType(customType.id, { color: e.target.value })}
                />
              </div>
              <button
                className="sidebar-section-action"
                onClick={() => removeCustomFileType(customType.id)}
                title="Remove"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}

          {showAddForm ? (
            <div className="icon-type-item" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 'var(--spacing-sm)' }}>
              <input
                type="text"
                className="settings-input"
                placeholder="Type name (e.g., Documents)"
                value={newTypeName}
                onChange={(e) => setNewTypeName(e.target.value)}
                autoFocus
              />
              <input
                type="text"
                className="settings-input"
                placeholder="Extensions (e.g., .doc, .docx, .odt)"
                value={newTypeExtensions}
                onChange={(e) => setNewTypeExtensions(e.target.value)}
              />
              <div style={{ display: 'flex', gap: 'var(--spacing-sm)', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-xs)' }}>
                  <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-tertiary)' }}>Icon:</span>
                  {newTypeIcon ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-xs)' }}>
                      <img src={newTypeIcon} alt="" style={{ width: 24, height: 24, objectFit: 'contain' }} />
                      <button
                        className="sidebar-section-action"
                        onClick={clearNewIcon}
                        title="Remove icon"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ) : (
                    <button
                      className="settings-button secondary"
                      style={{ padding: 'var(--spacing-xs)', display: 'flex', alignItems: 'center', gap: 'var(--spacing-xs)' }}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Upload size={14} />
                      <span>Upload</span>
                    </button>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={handleNewIconChange}
                  />
                </div>
                <div style={{ flex: 1 }} />
                <button
                  className="color-swatch"
                  style={{ backgroundColor: newTypeColor }}
                  onClick={() => colorInputRefs.current['new']?.click()}
                  title="Select color"
                />
                <input
                  ref={(el) => { colorInputRefs.current['new'] = el; }}
                  type="color"
                  className="color-input"
                  value={newTypeColor}
                  onChange={(e) => setNewTypeColor(e.target.value)}
                />
                <button className="settings-button secondary" onClick={() => { setShowAddForm(false); clearNewIcon(); }}>
                  Cancel
                </button>
                <button className="settings-button primary" onClick={handleAddCustomType}>
                  Add
                </button>
              </div>
            </div>
          ) : (
            <button className="settings-add-button" onClick={() => setShowAddForm(true)}>
              <Plus size={16} />
              <span>Add custom file type</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
