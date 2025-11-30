import React, { useState, useEffect } from 'react';
import { useSettingsStore } from '../../store/settingsStore';
import './WindowControls.css';

export const WindowControls: React.FC = () => {
  const { uiStyle } = useSettingsStore();
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    // Check initial maximized state
    const checkMaximized = async () => {
      // We'll track this via the window events in main process
      // For now, assume not maximized
    };
    checkMaximized();
  }, []);

  const handleMinimize = () => {
    window.xplorer.window.minimize();
  };

  const handleMaximize = () => {
    window.xplorer.window.maximize();
    setIsMaximized(!isMaximized);
  };

  const handleClose = () => {
    window.xplorer.window.close();
  };

  return (
    <div className={`window-controls window-controls-${uiStyle}`}>
      <button
        className="window-control window-control-minimize"
        onClick={handleMinimize}
        title="Minimize"
      >
        <MinimizeIcon style={uiStyle} />
      </button>
      <button
        className="window-control window-control-maximize"
        onClick={handleMaximize}
        title={isMaximized ? 'Restore' : 'Maximize'}
      >
        {isMaximized ? <RestoreIcon style={uiStyle} /> : <MaximizeIcon style={uiStyle} />}
      </button>
      <button
        className="window-control window-control-close"
        onClick={handleClose}
        title="Close"
      >
        <CloseIcon style={uiStyle} />
      </button>
    </div>
  );
};

// Classic style icons - simple, flat design
const MinimizeIcon: React.FC<{ style: string }> = ({ style }) => {
  if (style === 'glass') {
    return (
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
        <rect x="2" y="5.5" width="8" height="1" rx="0.5" fill="currentColor" />
      </svg>
    );
  }
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <rect x="2" y="5.5" width="8" height="1" fill="currentColor" />
    </svg>
  );
};

const MaximizeIcon: React.FC<{ style: string }> = ({ style }) => {
  if (style === 'glass') {
    return (
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
        <rect x="2" y="2" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1" fill="none" />
      </svg>
    );
  }
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <rect x="2" y="2" width="8" height="8" stroke="currentColor" strokeWidth="1" fill="none" />
    </svg>
  );
};

const RestoreIcon: React.FC<{ style: string }> = ({ style }) => {
  if (style === 'glass') {
    return (
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
        <rect x="3.5" y="1" width="6.5" height="6.5" rx="1" stroke="currentColor" strokeWidth="1" fill="none" />
        <rect x="1" y="3.5" width="6.5" height="6.5" rx="1" stroke="currentColor" strokeWidth="1" fill="var(--bg-primary)" />
      </svg>
    );
  }
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <rect x="3.5" y="1" width="6.5" height="6.5" stroke="currentColor" strokeWidth="1" fill="none" />
      <rect x="1" y="3.5" width="6.5" height="6.5" stroke="currentColor" strokeWidth="1" fill="var(--bg-primary)" />
    </svg>
  );
};

const CloseIcon: React.FC<{ style: string }> = ({ style }) => {
  if (style === 'glass') {
    return (
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
        <path
          d="M2.5 2.5L9.5 9.5M9.5 2.5L2.5 9.5"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path
        d="M2.5 2.5L9.5 9.5M9.5 2.5L2.5 9.5"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="square"
      />
    </svg>
  );
};
