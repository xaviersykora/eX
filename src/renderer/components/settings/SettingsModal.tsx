import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Palette, Sidebar, Settings, RotateCcw } from 'lucide-react';
import { AppearanceTab } from './tabs/AppearanceTab';
import { SidebarTab } from './tabs/SidebarTab';
import { BehaviorTab } from './tabs/BehaviorTab';
import { useSettingsStore } from '../../store/settingsStore';
import './SettingsModal.css';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type TabId = 'appearance' | 'sidebar' | 'behavior';

interface Tab {
  id: TabId;
  label: string;
  icon: React.ReactNode;
}

const tabs: Tab[] = [
  { id: 'appearance', label: 'Appearance', icon: <Palette size={18} /> },
  { id: 'sidebar', label: 'Sidebar', icon: <Sidebar size={18} /> },
  { id: 'behavior', label: 'Behavior', icon: <Settings size={18} /> },
];

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<TabId>('appearance');
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const { resetSettings } = useSettingsStore();

  if (!isOpen) return null;

  const handleReset = () => {
    resetSettings();
    setShowResetConfirm(false);
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case 'appearance':
        return <AppearanceTab />;
      case 'sidebar':
        return <SidebarTab />;
      case 'behavior':
        return <BehaviorTab />;
      default:
        return null;
    }
  };

  // Use portal to render modal at document.body level
  // This avoids stacking context issues with backdrop-filter in glass mode
  return createPortal(
    <div className="settings-modal-backdrop" onClick={handleBackdropClick}>
      <div className="settings-modal">
        <div className="settings-modal-header">
          <h2>Settings</h2>
          <button className="settings-modal-close" onClick={onClose} title="Close">
            <X size={18} />
          </button>
        </div>

        <div className="settings-modal-body">
          <nav className="settings-modal-tabs">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                className={`settings-tab ${activeTab === tab.id ? 'active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            ))}
          </nav>

          <div className="settings-modal-content">
            {renderTabContent()}
          </div>
        </div>

        <div className="settings-modal-footer">
          {showResetConfirm ? (
            <div className="settings-reset-confirm">
              <span>Reset all settings to defaults?</span>
              <button className="settings-reset-confirm-btn" onClick={handleReset}>
                Confirm
              </button>
              <button className="settings-reset-cancel-btn" onClick={() => setShowResetConfirm(false)}>
                Cancel
              </button>
            </div>
          ) : (
            <button className="settings-reset-btn" onClick={() => setShowResetConfirm(true)}>
              <RotateCcw size={16} />
              <span>Reset to Defaults</span>
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};
