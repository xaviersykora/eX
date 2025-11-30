import React from 'react';
import { useFileStore } from '../../store/fileStore';
import { useTabStore, HOME_PATH } from '../../store/tabStore';
import './StatusBar.css';

const formatSize = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

export const StatusBar: React.FC = () => {
  const { files, selectedIds, getSelectedFiles } = useFileStore();
  const { tabs, activeTabId } = useTabStore();

  const activeTab = tabs.find((t) => t.id === activeTabId);
  const isHomePage = activeTab?.path === HOME_PATH;

  const selectedFiles = getSelectedFiles();
  const selectedSize = selectedFiles.reduce((acc, f) => acc + (f.isDirectory ? 0 : f.size), 0);
  const folderCount = files.filter((f) => f.isDirectory).length;
  const fileCount = files.filter((f) => !f.isDirectory).length;

  return (
    <div className="statusbar">
      <div className="statusbar-section">
        {isHomePage ? (
          <span>Home</span>
        ) : selectedIds.size > 0 ? (
          <span>
            {selectedIds.size} item{selectedIds.size !== 1 ? 's' : ''} selected
            {selectedSize > 0 && ` (${formatSize(selectedSize)})`}
          </span>
        ) : (
          <span>
            {files.length} item{files.length !== 1 ? 's' : ''}
            {folderCount > 0 && ` (${folderCount} folder${folderCount !== 1 ? 's' : ''})`}
            {fileCount > 0 && ` (${fileCount} file${fileCount !== 1 ? 's' : ''})`}
          </span>
        )}
      </div>

      <div className="statusbar-spacer" />

      <div className="statusbar-section">
        {/* Additional status info can go here */}
      </div>
    </div>
  );
};
