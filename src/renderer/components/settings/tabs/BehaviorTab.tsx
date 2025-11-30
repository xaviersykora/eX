import React from 'react';
import { useSettingsStore } from '../../../store/settingsStore';

export const BehaviorTab: React.FC = () => {
  const {
    measureFolderSize,
    setMeasureFolderSize,
    sortFilesAndFoldersTogether,
    setSortFilesAndFoldersTogether,
    promptBeforeOpen,
    setPromptBeforeOpen,
    closeToTray,
    setCloseToTray,
    trayRestoreBehavior,
    setTrayRestoreBehavior,
  } = useSettingsStore();

  return (
    <div className="settings-tab-content">
      <div className="settings-section">
        <h3 className="settings-section-title">File Display</h3>

        <div className="settings-row">
          <div className="settings-row-info">
            <span className="settings-row-label">Measure folder sizes</span>
            <span className="settings-row-description">
              Calculate and display the total size of folder contents. May impact performance for large directories.
            </span>
          </div>
          <button
            className={`toggle-switch ${measureFolderSize ? 'active' : ''}`}
            onClick={() => setMeasureFolderSize(!measureFolderSize)}
            role="switch"
            aria-checked={measureFolderSize}
          >
            <div className="toggle-switch-handle" />
          </button>
        </div>

        <div className="settings-row">
          <div className="settings-row-info">
            <span className="settings-row-label">Sort files and folders together</span>
            <span className="settings-row-description">
              When enabled, files and folders are sorted together alphabetically. When disabled, folders appear first.
            </span>
          </div>
          <button
            className={`toggle-switch ${sortFilesAndFoldersTogether ? 'active' : ''}`}
            onClick={() => setSortFilesAndFoldersTogether(!sortFilesAndFoldersTogether)}
            role="switch"
            aria-checked={sortFilesAndFoldersTogether}
          >
            <div className="toggle-switch-handle" />
          </button>
        </div>

        <div className="settings-row">
          <div className="settings-row-info">
            <span className="settings-row-label">Prompt before opening files</span>
            <span className="settings-row-description">
              Show a confirmation dialog before opening files with external applications
            </span>
          </div>
          <button
            className={`toggle-switch ${promptBeforeOpen ? 'active' : ''}`}
            onClick={() => setPromptBeforeOpen(!promptBeforeOpen)}
            role="switch"
            aria-checked={promptBeforeOpen}
          >
            <div className="toggle-switch-handle" />
          </button>
        </div>
      </div>

      <div className="settings-section">
        <h3 className="settings-section-title">System Tray</h3>

        <div className="settings-row">
          <div className="settings-row-info">
            <span className="settings-row-label">Close to system tray</span>
            <span className="settings-row-description">
              Minimize to system tray instead of closing when the window close button is clicked
            </span>
          </div>
          <button
            className={`toggle-switch ${closeToTray ? 'active' : ''}`}
            onClick={() => setCloseToTray(!closeToTray)}
            role="switch"
            aria-checked={closeToTray}
          >
            <div className="toggle-switch-handle" />
          </button>
        </div>

        {closeToTray && (
          <div className="settings-row">
            <div className="settings-row-info">
              <span className="settings-row-label">Tray click behavior</span>
              <span className="settings-row-description">
                What happens when clicking the tray icon
              </span>
            </div>
            <select
              className="settings-select"
              value={trayRestoreBehavior}
              onChange={(e) => setTrayRestoreBehavior(e.target.value as 'restore' | 'newWindow')}
            >
              <option value="newWindow">Open new window</option>
              <option value="restore">Restore last window</option>
            </select>
          </div>
        )}
      </div>
    </div>
  );
};
