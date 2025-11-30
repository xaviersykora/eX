import React, { useState, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Upload, Trash2 } from 'lucide-react';
import { useSettingsStore, type FileCustomization } from '../../store/settingsStore';
import './CustomizeDialog.css';

interface CustomizeDialogProps {
  file: {
    path: string;
    name: string;
    isDirectory: boolean;
  };
  onClose: () => void;
}

// Preset colors for quick selection
const PRESET_COLORS = [
  '#ef4444', // red
  '#f97316', // orange
  '#f59e0b', // amber
  '#eab308', // yellow
  '#84cc16', // lime
  '#22c55e', // green
  '#14b8a6', // teal
  '#06b6d4', // cyan
  '#0ea5e9', // sky
  '#3b82f6', // blue
  '#6366f1', // indigo
  '#8b5cf6', // violet
  '#a855f7', // purple
  '#d946ef', // fuchsia
  '#ec4899', // pink
  '#78716c', // stone
];

export const CustomizeDialog: React.FC<CustomizeDialogProps> = ({ file, onClose }) => {
  const { getFileCustomization, setFileCustomization, removeFileCustomization } = useSettingsStore();
  const existingCustomization = getFileCustomization(file.path);

  const [color, setColor] = useState<string>(existingCustomization?.color || '');
  const [customIcon, setCustomIcon] = useState<string>(existingCustomization?.customIcon || '');
  const [iconPreview, setIconPreview] = useState<string | null>(existingCustomization?.customIcon || null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Close on escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dialogRef.current && !dialogRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    // Delay to prevent immediate close from the context menu click
    const timeout = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 100);
    return () => {
      clearTimeout(timeout);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  const handleIconUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check file size (max 100KB)
    if (file.size > 100 * 1024) {
      alert('Icon file must be smaller than 100KB');
      return;
    }

    // Check file type
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      setCustomIcon(base64);
      setIconPreview(base64);
    };
    reader.readAsDataURL(file);
  }, []);

  const handleClearIcon = useCallback(() => {
    setCustomIcon('');
    setIconPreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  const handleSave = useCallback(() => {
    if (color || customIcon) {
      setFileCustomization(file.path, {
        color: color || undefined,
        customIcon: customIcon || undefined,
      });
    } else {
      // Remove customization if both are cleared
      removeFileCustomization(file.path);
    }
    onClose();
  }, [file.path, color, customIcon, setFileCustomization, removeFileCustomization, onClose]);

  const handleReset = useCallback(() => {
    removeFileCustomization(file.path);
    onClose();
  }, [file.path, removeFileCustomization, onClose]);

  // Use portal to render at document.body level
  // This avoids stacking context issues with backdrop-filter in glass mode
  return createPortal(
    <div className="customize-dialog-overlay">
      <div className="customize-dialog" ref={dialogRef}>
        <div className="customize-dialog-header">
          <h3>Customize {file.isDirectory ? 'Folder' : 'File'}</h3>
          <button className="customize-dialog-close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="customize-dialog-content">
          <div className="customize-dialog-file-name">
            {file.name}
          </div>

          {/* Color Section */}
          <div className="customize-section">
            <label className="customize-label">Icon Color</label>
            <div className="customize-color-picker">
              <div className="customize-color-presets">
                {PRESET_COLORS.map((presetColor) => (
                  <button
                    key={presetColor}
                    className={`customize-color-preset ${color === presetColor ? 'selected' : ''}`}
                    style={{ backgroundColor: presetColor }}
                    onClick={() => setColor(presetColor)}
                    title={presetColor}
                  />
                ))}
              </div>
              <div className="customize-color-custom">
                <input
                  type="color"
                  value={color || '#808080'}
                  onChange={(e) => setColor(e.target.value)}
                  className="customize-color-input"
                />
                <input
                  type="text"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  placeholder="No color"
                  className="customize-color-text"
                />
                {color && (
                  <button
                    className="customize-color-clear"
                    onClick={() => setColor('')}
                    title="Clear color"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Custom Icon Section */}
          <div className="customize-section">
            <label className="customize-label">Custom Icon</label>
            <div className="customize-icon-picker">
              {iconPreview ? (
                <div className="customize-icon-preview-container">
                  <img src={iconPreview} alt="Preview" className="customize-icon-preview" />
                  <button
                    className="customize-icon-remove"
                    onClick={handleClearIcon}
                    title="Remove icon"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ) : (
                <button
                  className="customize-icon-upload"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload size={20} />
                  <span>Upload Icon</span>
                </button>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleIconUpload}
                className="customize-icon-input"
              />
              <p className="customize-icon-hint">
                Max 100KB, recommended 64x64 or larger
              </p>
            </div>
          </div>
        </div>

        <div className="customize-dialog-footer">
          {existingCustomization && (
            <button className="customize-btn customize-btn-danger" onClick={handleReset}>
              Reset to Default
            </button>
          )}
          <div className="customize-dialog-footer-right">
            <button className="customize-btn" onClick={onClose}>
              Cancel
            </button>
            <button className="customize-btn customize-btn-primary" onClick={handleSave}>
              Save
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
