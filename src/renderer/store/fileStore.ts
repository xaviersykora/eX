import { create } from 'zustand';
import type { FileInfo, ViewMode, SortConfig } from '@shared/types';
import { useSettingsStore } from './settingsStore';

interface SearchState {
  isActive: boolean;
  searchId: string | null;
  query: string;
  progress: number; // 0-100
  totalItems: number;
  foundItems: number;
}

export interface ColumnConfig {
  name: boolean;
  modifiedAt: boolean;
  type: boolean;
  size: boolean;
  createdAt: boolean;
}

// Represents a file selected from the Home page (recent files, etc.)
export interface HomeSelectedFile {
  path: string;
  name: string;
  size: number;
  modifiedAt: number;
  createdAt: number;
  accessedAt: number;
  isDirectory: boolean;
  extension: string;
}

interface FileState {
  files: FileInfo[];
  selectedIds: Set<string>;
  loading: boolean;
  error: string | null;
  viewMode: ViewMode;
  sortConfig: SortConfig;
  showHidden: boolean;
  showInfoPanel: boolean;
  columnConfig: ColumnConfig;
  thumbnailSize: number; // Size for thumbnails view (32-128)
  iconSize: number; // Size for icons view (48-256)
  refreshCounter: number;
  search: SearchState;
  editingPath: string | null; // Path of file/folder currently being renamed
  pendingNewFolderPath: string | null; // Path of newly created folder to auto-edit
  folderSizes: Map<string, number>; // Cached folder sizes (path -> size in bytes)
  loadingFolderSizes: Set<string>; // Paths currently being calculated
  homeSelectedFile: HomeSelectedFile | null; // File selected from Home page
}

interface FileActions {
  setFiles: (files: FileInfo[]) => void;
  addFile: (file: FileInfo) => void;
  removeFile: (path: string) => void;
  updateFile: (path: string, updates: Partial<FileInfo>) => void;

  select: (path: string, additive?: boolean) => void;
  selectRange: (path: string) => void;
  selectAll: () => void;
  clearSelection: () => void;
  getSelectedFiles: () => FileInfo[];

  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;

  setViewMode: (mode: ViewMode) => void;
  setSortConfig: (config: Partial<SortConfig>) => void;
  setShowHidden: (show: boolean) => void;
  setShowInfoPanel: (show: boolean) => void;
  toggleInfoPanel: () => void;
  setColumnConfig: (config: Partial<ColumnConfig>) => void;
  toggleColumn: (column: keyof ColumnConfig) => void;
  setThumbnailSize: (size: number) => void;
  setIconSize: (size: number) => void;
  triggerRefresh: () => void;

  // Search actions
  startSearch: (query: string) => string; // Returns search ID
  cancelSearch: () => void;
  updateSearchProgress: (searchId: string, progress: number, foundItems: number, totalItems: number) => void;
  setSearchResults: (searchId: string, files: FileInfo[]) => void;
  isSearchActive: () => boolean;
  getCurrentSearchId: () => string | null;

  // Inline rename actions
  setEditingPath: (path: string | null) => void;
  setPendingNewFolderPath: (path: string | null) => void;

  // Folder size actions
  setFolderSize: (path: string, size: number) => void;
  setLoadingFolderSize: (path: string, loading: boolean) => void;
  getFolderSize: (path: string) => number | undefined;
  clearFolderSizes: () => void;

  // Home page selection
  setHomeSelectedFile: (file: HomeSelectedFile | null) => void;
  getHomeSelectedFile: () => HomeSelectedFile | null;
}

const sortFiles = (files: FileInfo[], config: SortConfig, folderSizes?: Map<string, number>): FileInfo[] => {
  // Check if user wants to sort files and folders together
  const { sortFilesAndFoldersTogether } = useSettingsStore.getState();
  const effectiveFoldersFirst = !sortFilesAndFoldersTogether && config.foldersFirst;

  const sorted = [...files].sort((a, b) => {
    // Folders first if enabled and not sorting together
    if (effectiveFoldersFirst) {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
    }

    let comparison = 0;

    switch (config.field) {
      case 'name':
        comparison = a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
        break;
      case 'size':
        // Use folder sizes if available, otherwise use file size
        const aSize = a.isDirectory ? (folderSizes?.get(a.path) ?? 0) : a.size;
        const bSize = b.isDirectory ? (folderSizes?.get(b.path) ?? 0) : b.size;
        comparison = aSize - bSize;
        break;
      case 'type':
        comparison = a.extension.localeCompare(b.extension);
        break;
      case 'modifiedAt':
        comparison = a.modifiedAt - b.modifiedAt;
        break;
      case 'createdAt':
        comparison = a.createdAt - b.createdAt;
        break;
    }

    return config.direction === 'asc' ? comparison : -comparison;
  });

  return sorted;
};

const generateSearchId = () => `search-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

export const useFileStore = create<FileState & FileActions>()((set, get) => ({
  files: [],
  selectedIds: new Set(),
  loading: false,
  error: null,
  viewMode: 'details',
  sortConfig: {
    field: 'name',
    direction: 'asc',
    foldersFirst: true,
  },
  showHidden: false,
  showInfoPanel: false,
  columnConfig: {
    name: true,
    modifiedAt: true,
    type: true,
    size: true,
    createdAt: false,
  },
  thumbnailSize: 48,
  iconSize: 96,
  refreshCounter: 0,
  search: {
    isActive: false,
    searchId: null,
    query: '',
    progress: 0,
    totalItems: 0,
    foundItems: 0,
  },
  editingPath: null,
  pendingNewFolderPath: null,
  folderSizes: new Map(),
  loadingFolderSizes: new Set(),
  homeSelectedFile: null,

  setFiles: (files) => {
    const { sortConfig, showHidden, pendingNewFolderPath, folderSizes } = get();
    let filtered = files;

    if (!showHidden) {
      filtered = files.filter((f) => !f.isHidden);
    }

    const sorted = sortFiles(filtered, sortConfig, folderSizes);

    // Check if we have a pending new folder to auto-edit
    let editingPath: string | null = null;
    let selectedIds = new Set<string>();

    if (pendingNewFolderPath) {
      // Find the new folder in the files list
      const newFolder = sorted.find((f) => f.path === pendingNewFolderPath);
      if (newFolder) {
        editingPath = pendingNewFolderPath;
        selectedIds.add(pendingNewFolderPath);
      }
    }

    set({
      files: sorted,
      selectedIds,
      error: null,
      editingPath,
      pendingNewFolderPath: null,
    });
  },

  addFile: (file) => {
    set((state) => {
      const { sortConfig, showHidden, folderSizes } = state;

      if (!showHidden && file.isHidden) {
        return state;
      }

      const newFiles = [...state.files, file];
      return { files: sortFiles(newFiles, sortConfig, folderSizes) };
    });
  },

  removeFile: (path) => {
    set((state) => {
      const newFiles = state.files.filter((f) => f.path !== path);
      const newSelected = new Set(state.selectedIds);
      newSelected.delete(path);
      return { files: newFiles, selectedIds: newSelected };
    });
  },

  updateFile: (path, updates) => {
    set((state) => {
      const newFiles = state.files.map((f) =>
        f.path === path ? { ...f, ...updates } : f
      );
      return { files: sortFiles(newFiles, state.sortConfig, state.folderSizes) };
    });
  },

  select: (path, additive = false) => {
    set((state) => {
      const newSelected = additive ? new Set(state.selectedIds) : new Set<string>();
      if (state.selectedIds.has(path) && additive) {
        newSelected.delete(path);
      } else {
        newSelected.add(path);
      }
      return { selectedIds: newSelected };
    });
  },

  selectRange: (path) => {
    const { files, selectedIds } = get();
    if (selectedIds.size === 0) {
      set({ selectedIds: new Set([path]) });
      return;
    }

    const lastSelected = Array.from(selectedIds).pop();
    if (!lastSelected) {
      set({ selectedIds: new Set([path]) });
      return;
    }

    const startIndex = files.findIndex((f) => f.path === lastSelected);
    const endIndex = files.findIndex((f) => f.path === path);

    if (startIndex === -1 || endIndex === -1) {
      set({ selectedIds: new Set([path]) });
      return;
    }

    const [from, to] = startIndex < endIndex ? [startIndex, endIndex] : [endIndex, startIndex];
    const newSelected = new Set<string>();

    for (let i = from; i <= to; i++) {
      newSelected.add(files[i].path);
    }

    set({ selectedIds: newSelected });
  },

  selectAll: () => {
    const { files } = get();
    set({ selectedIds: new Set(files.map((f) => f.path)) });
  },

  clearSelection: () => {
    set({ selectedIds: new Set() });
  },

  getSelectedFiles: () => {
    const { files, selectedIds } = get();
    return files.filter((f) => selectedIds.has(f.path));
  },

  setLoading: (loading) => {
    set({ loading });
  },

  setError: (error) => {
    set({ error, loading: false });
  },

  setViewMode: (mode) => {
    set({ viewMode: mode });
  },

  setSortConfig: (config) => {
    const { sortConfig, files, folderSizes } = get();
    const newConfig = { ...sortConfig, ...config };
    set({
      sortConfig: newConfig,
      files: sortFiles(files, newConfig, folderSizes),
    });
  },

  setShowHidden: (show) => {
    set({ showHidden: show });
    // Files will need to be reloaded
  },

  setShowInfoPanel: (show) => {
    set({ showInfoPanel: show });
  },

  toggleInfoPanel: () => {
    set((state) => ({ showInfoPanel: !state.showInfoPanel }));
  },

  setColumnConfig: (config) => {
    set((state) => ({
      columnConfig: { ...state.columnConfig, ...config },
    }));
  },

  toggleColumn: (column) => {
    // Don't allow disabling the name column
    if (column === 'name') return;
    set((state) => ({
      columnConfig: {
        ...state.columnConfig,
        [column]: !state.columnConfig[column],
      },
    }));
  },

  setThumbnailSize: (size) => {
    set({ thumbnailSize: Math.max(32, Math.min(128, size)) });
  },

  setIconSize: (size) => {
    set({ iconSize: Math.max(48, Math.min(256, size)) });
  },

  triggerRefresh: () => {
    set((state) => ({ refreshCounter: state.refreshCounter + 1 }));
  },

  // Search actions
  startSearch: (query: string) => {
    const searchId = generateSearchId();
    set({
      search: {
        isActive: true,
        searchId,
        query,
        progress: 0,
        totalItems: 0,
        foundItems: 0,
      },
    });
    return searchId;
  },

  cancelSearch: () => {
    set({
      search: {
        isActive: false,
        searchId: null,
        query: '',
        progress: 0,
        totalItems: 0,
        foundItems: 0,
      },
    });
  },

  updateSearchProgress: (searchId: string, progress: number, foundItems: number, totalItems: number) => {
    const { search } = get();
    // Only update if this is the current search
    if (search.searchId === searchId) {
      set({
        search: {
          ...search,
          progress,
          foundItems,
          totalItems,
        },
      });
    }
  },

  setSearchResults: (searchId: string, files: FileInfo[]) => {
    const { search, sortConfig, showHidden, folderSizes } = get();
    // Only set results if this is the current search
    if (search.searchId === searchId && search.isActive) {
      let filtered = files;

      if (!showHidden) {
        filtered = files.filter((f) => !f.isHidden);
      }

      const sorted = sortFiles(filtered, sortConfig, folderSizes);
      set({
        files: sorted,
        selectedIds: new Set(),
        error: null,
        search: {
          ...search,
          isActive: false,
          progress: 100,
        },
      });
    }
  },

  isSearchActive: () => {
    return get().search.isActive;
  },

  getCurrentSearchId: () => {
    return get().search.searchId;
  },

  // Inline rename actions
  setEditingPath: (path: string | null) => {
    set({ editingPath: path });
  },

  setPendingNewFolderPath: (path: string | null) => {
    set({ pendingNewFolderPath: path });
  },

  // Folder size actions
  setFolderSize: (path: string, size: number) => {
    set((state) => {
      const newMap = new Map(state.folderSizes);
      newMap.set(path, size);
      const newLoading = new Set(state.loadingFolderSizes);
      newLoading.delete(path);
      // Re-sort if sorting by size
      if (state.sortConfig.field === 'size') {
        return {
          folderSizes: newMap,
          loadingFolderSizes: newLoading,
          files: sortFiles(state.files, state.sortConfig, newMap),
        };
      }
      return { folderSizes: newMap, loadingFolderSizes: newLoading };
    });
  },

  setLoadingFolderSize: (path: string, loading: boolean) => {
    set((state) => {
      const newLoading = new Set(state.loadingFolderSizes);
      if (loading) {
        newLoading.add(path);
      } else {
        newLoading.delete(path);
      }
      return { loadingFolderSizes: newLoading };
    });
  },

  getFolderSize: (path: string) => {
    return get().folderSizes.get(path);
  },

  clearFolderSizes: () => {
    set({ folderSizes: new Map(), loadingFolderSizes: new Set() });
  },

  // Home page selection
  setHomeSelectedFile: (file: HomeSelectedFile | null) => {
    set({ homeSelectedFile: file });
  },

  getHomeSelectedFile: () => {
    return get().homeSelectedFile;
  },
}));
