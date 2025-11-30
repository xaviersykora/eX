import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ViewMode, SortConfig } from '@shared/types';

export interface QuickAccessItem {
  id: string;
  name: string;
  path: string;
  icon: string; // Icon name from lucide-react
  visible: boolean;
  order: number;
  isDefault: boolean;
}

export interface RecentFile {
  path: string;
  name: string;
  accessedAt: number;
}

export interface IconColors {
  folder: string;
  image: string;
  video: string;
  audio: string;
  code: string;
  archive: string;
  text: string;
  default: string;
}

export interface DefaultTypeIcons {
  folder?: string;
  image?: string;
  video?: string;
  audio?: string;
  code?: string;
  archive?: string;
  text?: string;
  default?: string;
}

export interface CustomFileType {
  id: string;
  name: string;
  extensions: string[];
  color: string;
  customIcon?: string; // Base64 encoded image or Lucide icon name
  lucideIcon?: string; // Lucide icon name
}

export interface CustomSidebarSection {
  id: string;
  name: string;
  color: string;
  icon?: string; // Base64 encoded custom icon
  items: { id: string; name: string; path: string }[];
  order: number;
}

export interface ColumnWidths {
  name: number;
  modifiedAt: number;
  type: number;
  size: number;
  createdAt: number;
}

// Sidebar section configuration for ordering and visibility
export interface SidebarSectionConfig {
  id: string; // 'quickAccess', 'thisPC', or custom section ID
  visible: boolean;
  order: number;
}

export type DefaultSidebarSectionId = 'quickAccess' | 'thisPC';

// Individual file/folder customization
export interface FileCustomization {
  path: string;
  color?: string;      // Custom color for icon
  customIcon?: string; // Base64 encoded custom icon
}

// UI Style types
export type UIStyle = 'classic' | 'glass';

interface SettingsState {
  // UI Style
  uiStyle: UIStyle;
  // View settings
  defaultViewMode: ViewMode;
  defaultSortConfig: SortConfig;
  showHiddenFiles: boolean;
  showFileExtensions: boolean;
  showStatusBar: boolean;

  // Navigation
  singleClickToOpen: boolean;
  openFoldersInNewTab: boolean;

  // Layout
  sidebarWidth: number;
  showNavigationPane: boolean;
  columnWidths: ColumnWidths;

  // Dual pane
  dualPaneEnabled: boolean;
  dualPaneOrientation: 'horizontal' | 'vertical';

  // Confirmations
  confirmDelete: boolean;
  confirmMove: boolean;

  // Performance
  thumbnailSize: number;
  maxThumbnailCache: number;

  // Quick Access
  quickAccessItems: QuickAccessItem[];

  // Recent Files
  recentFiles: RecentFile[];
  maxRecentFiles: number;

  // Appearance
  accentColor: string;
  iconColors: IconColors;
  defaultTypeIcons: DefaultTypeIcons;
  customFileTypes: CustomFileType[];

  // Sidebar
  customSidebarSections: CustomSidebarSection[];
  sidebarSectionOrder: SidebarSectionConfig[]; // Order and visibility of all sections

  // Behavior
  measureFolderSize: boolean;
  sortFilesAndFoldersTogether: boolean;
  closeToTray: boolean;
  trayRestoreBehavior: 'restore' | 'newWindow';
  promptBeforeOpen: boolean;

  // Individual file/folder customizations
  fileCustomizations: FileCustomization[];
}

interface SettingsActions {
  setSetting: <K extends keyof SettingsState>(key: K, value: SettingsState[K]) => void;

  // Quick Access actions
  addQuickAccess: (item: Omit<QuickAccessItem, 'order' | 'isDefault'>) => void;
  removeQuickAccess: (id: string) => void;
  updateQuickAccess: (id: string, updates: Partial<QuickAccessItem>) => void;
  reorderQuickAccess: (items: QuickAccessItem[]) => void;
  initializeDefaultQuickAccess: (userHome: string) => Promise<void>;
  refreshDefaultQuickAccessPaths: () => Promise<void>;

  // Recent Files actions
  addRecentFile: (path: string, name: string) => void;
  clearRecentFiles: () => void;

  // Appearance actions
  setAccentColor: (color: string) => void;
  setIconColor: (type: keyof IconColors, color: string) => void;
  setDefaultTypeIcon: (type: keyof DefaultTypeIcons, icon: string | undefined) => void;

  // Custom file types actions
  addCustomFileType: (type: Omit<CustomFileType, 'id'>) => void;
  removeCustomFileType: (id: string) => void;
  updateCustomFileType: (id: string, updates: Partial<CustomFileType>) => void;

  // Custom sidebar sections actions
  addCustomSidebarSection: (section: Omit<CustomSidebarSection, 'id' | 'order'>) => void;
  removeCustomSidebarSection: (id: string) => void;
  updateCustomSidebarSection: (id: string, updates: Partial<CustomSidebarSection>) => void;
  reorderCustomSidebarSections: (ids: string[]) => void;
  addItemToSidebarSection: (sectionId: string, item: { name: string; path: string }) => void;
  removeItemFromSidebarSection: (sectionId: string, itemId: string) => void;

  // Sidebar section order actions
  updateSidebarSectionOrder: (sections: SidebarSectionConfig[]) => void;
  setSidebarSectionVisibility: (sectionId: string, visible: boolean) => void;
  getSidebarSectionOrder: () => SidebarSectionConfig[];

  // Layout actions
  setColumnWidth: (column: keyof ColumnWidths, width: number) => void;

  // Behavior actions
  setMeasureFolderSize: (enabled: boolean) => void;
  setSortFilesAndFoldersTogether: (enabled: boolean) => void;
  setCloseToTray: (enabled: boolean) => void;
  setTrayRestoreBehavior: (behavior: 'restore' | 'newWindow') => void;
  setPromptBeforeOpen: (enabled: boolean) => void;

  // File customization actions
  setFileCustomization: (path: string, customization: Partial<Omit<FileCustomization, 'path'>>) => void;
  removeFileCustomization: (path: string) => void;
  getFileCustomization: (path: string) => FileCustomization | undefined;

  // UI Style actions
  setUIStyle: (style: UIStyle) => void;

  // Reset
  resetSettings: () => void;
}

const defaultIconColors: IconColors = {
  folder: '#dcb67a',
  image: '#c586c0',
  video: '#ce9178',
  audio: '#4ec9b0',
  code: '#569cd6',
  archive: '#d7ba7d',
  text: '#9cdcfe',
  default: '#9cdcfe',
};

const defaultSettings: SettingsState = {
  // UI Style
  uiStyle: 'classic',

  defaultViewMode: 'details',
  defaultSortConfig: {
    field: 'name',
    direction: 'asc',
    foldersFirst: true,
  },
  showHiddenFiles: false,
  showFileExtensions: true,
  showStatusBar: true,
  singleClickToOpen: false,
  openFoldersInNewTab: false,
  sidebarWidth: 220,
  showNavigationPane: true,
  columnWidths: {
    name: 300,
    modifiedAt: 150,
    type: 100,
    size: 100,
    createdAt: 150,
  },
  dualPaneEnabled: false,
  dualPaneOrientation: 'horizontal',
  confirmDelete: true,
  confirmMove: false,
  thumbnailSize: 96,
  maxThumbnailCache: 1000,
  quickAccessItems: [],
  recentFiles: [],
  maxRecentFiles: 20,

  // Appearance
  accentColor: '#0078d4',
  iconColors: defaultIconColors,
  defaultTypeIcons: {},
  customFileTypes: [],

  // Sidebar
  customSidebarSections: [],
  sidebarSectionOrder: [
    { id: 'quickAccess', visible: true, order: 0 },
    { id: 'thisPC', visible: true, order: 1 },
  ],

  // Behavior
  measureFolderSize: false,
  sortFilesAndFoldersTogether: false,
  closeToTray: false,
  trayRestoreBehavior: 'newWindow',
  promptBeforeOpen: true,

  // Individual file/folder customizations
  fileCustomizations: [],
};

export const useSettingsStore = create<SettingsState & SettingsActions>()(
  persist(
    (set, get) => ({
      ...defaultSettings,

      setSetting: (key, value) => {
        set({ [key]: value });
      },

      addQuickAccess: (item) => {
        set((state) => {
          const maxOrder = Math.max(...state.quickAccessItems.map((i) => i.order), -1);
          const newItem: QuickAccessItem = {
            ...item,
            order: maxOrder + 1,
            isDefault: false,
          };
          return { quickAccessItems: [...state.quickAccessItems, newItem] };
        });
      },

      removeQuickAccess: (id) => {
        set((state) => ({
          quickAccessItems: state.quickAccessItems.filter((item) => item.id !== id),
        }));
      },

      updateQuickAccess: (id, updates) => {
        set((state) => ({
          quickAccessItems: state.quickAccessItems.map((item) =>
            item.id === id ? { ...item, ...updates } : item
          ),
        }));
      },

      reorderQuickAccess: (items) => {
        set({ quickAccessItems: items.map((item, index) => ({ ...item, order: index })) });
      },

      initializeDefaultQuickAccess: async (userHome) => {
        const { quickAccessItems, refreshDefaultQuickAccessPaths } = get();
        // Only initialize if empty
        if (quickAccessItems.length === 0) {
          // Try to get actual Windows library paths
          let knownFolders: Record<string, string> = {};
          try {
            const response = await window.xplorer.request('shell.knownFolders', {});
            if (response.success && response.data) {
              knownFolders = response.data as Record<string, string>;
            }
          } catch (error) {
            console.error('Failed to get known folder paths:', error);
          }

          // Use actual paths if available, fall back to defaults
          const defaultItems: QuickAccessItem[] = [
            { id: 'home', name: 'User Library', path: knownFolders.Profile || userHome, icon: 'Home', visible: true, order: 0, isDefault: true },
            { id: 'desktop', name: 'Desktop', path: knownFolders.Desktop || `${userHome}\\Desktop`, icon: 'Monitor', visible: true, order: 1, isDefault: true },
            { id: 'downloads', name: 'Downloads', path: knownFolders.Downloads || `${userHome}\\Downloads`, icon: 'Download', visible: true, order: 2, isDefault: true },
            { id: 'documents', name: 'Documents', path: knownFolders.Documents || `${userHome}\\Documents`, icon: 'FileText', visible: true, order: 3, isDefault: true },
            { id: 'pictures', name: 'Pictures', path: knownFolders.Pictures || `${userHome}\\Pictures`, icon: 'Image', visible: true, order: 4, isDefault: true },
            { id: 'music', name: 'Music', path: knownFolders.Music || `${userHome}\\Music`, icon: 'Music', visible: true, order: 5, isDefault: true },
            { id: 'videos', name: 'Videos', path: knownFolders.Videos || `${userHome}\\Videos`, icon: 'Video', visible: true, order: 6, isDefault: true },
          ];
          set({ quickAccessItems: defaultItems });
        } else {
          // Refresh paths for existing default items
          await refreshDefaultQuickAccessPaths();
        }
      },

      refreshDefaultQuickAccessPaths: async () => {
        // Get the actual Windows library paths and update existing default items
        try {
          const response = await window.xplorer.request('shell.knownFolders', {});
          if (response.success && response.data) {
            const knownFolders = response.data as Record<string, string>;

            // Map of item IDs to their known folder names
            const idToFolderMap: Record<string, string> = {
              'home': 'Profile',
              'desktop': 'Desktop',
              'downloads': 'Downloads',
              'documents': 'Documents',
              'pictures': 'Pictures',
              'music': 'Music',
              'videos': 'Videos',
            };

            set((state) => ({
              quickAccessItems: state.quickAccessItems.map((item) => {
                // Only update default items
                if (item.isDefault && idToFolderMap[item.id]) {
                  const folderName = idToFolderMap[item.id];
                  const newPath = knownFolders[folderName];
                  const updates: Partial<QuickAccessItem> = {};

                  if (newPath && newPath !== item.path) {
                    updates.path = newPath;
                  }

                  // Migrate "Home" to "User Library" for existing users
                  if (item.id === 'home' && item.name === 'Home') {
                    updates.name = 'User Library';
                  }

                  if (Object.keys(updates).length > 0) {
                    return { ...item, ...updates };
                  }
                }
                return item;
              }),
            }));
          }
        } catch (error) {
          console.error('Failed to refresh quick access paths:', error);
        }
      },

      addRecentFile: (path, name) => {
        set((state) => {
          const filtered = state.recentFiles.filter((f) => f.path !== path);
          const newRecent: RecentFile = { path, name, accessedAt: Date.now() };
          const updated = [newRecent, ...filtered].slice(0, state.maxRecentFiles);
          return { recentFiles: updated };
        });
      },

      clearRecentFiles: () => {
        set({ recentFiles: [] });
      },

      // Appearance actions
      setAccentColor: (color) => {
        set({ accentColor: color });
        // Also update CSS variable
        document.documentElement.style.setProperty('--accent-color', color);
      },

      setIconColor: (type, color) => {
        set((state) => ({
          iconColors: { ...state.iconColors, [type]: color },
        }));
      },

      setDefaultTypeIcon: (type, icon) => {
        set((state) => ({
          defaultTypeIcons: { ...state.defaultTypeIcons, [type]: icon },
        }));
      },

      // Custom file types actions
      addCustomFileType: (type) => {
        set((state) => ({
          customFileTypes: [
            ...state.customFileTypes,
            { ...type, id: `custom-${Date.now()}` },
          ],
        }));
      },

      removeCustomFileType: (id) => {
        set((state) => ({
          customFileTypes: state.customFileTypes.filter((t) => t.id !== id),
        }));
      },

      updateCustomFileType: (id, updates) => {
        set((state) => ({
          customFileTypes: state.customFileTypes.map((t) =>
            t.id === id ? { ...t, ...updates } : t
          ),
        }));
      },

      // Custom sidebar sections actions
      addCustomSidebarSection: (section) => {
        set((state) => {
          const newId = `section-${Date.now()}`;
          const maxOrder = Math.max(...state.sidebarSectionOrder.map((s) => s.order), -1);
          return {
            customSidebarSections: [
              ...state.customSidebarSections,
              { ...section, id: newId, order: state.customSidebarSections.length },
            ],
            sidebarSectionOrder: [
              ...state.sidebarSectionOrder,
              { id: newId, visible: true, order: maxOrder + 1 },
            ],
          };
        });
      },

      removeCustomSidebarSection: (id) => {
        set((state) => ({
          customSidebarSections: state.customSidebarSections.filter((s) => s.id !== id),
          sidebarSectionOrder: state.sidebarSectionOrder.filter((s) => s.id !== id),
        }));
      },

      updateCustomSidebarSection: (id, updates) => {
        set((state) => ({
          customSidebarSections: state.customSidebarSections.map((s) =>
            s.id === id ? { ...s, ...updates } : s
          ),
        }));
      },

      reorderCustomSidebarSections: (ids) => {
        set((state) => ({
          customSidebarSections: ids
            .map((id, index) => {
              const section = state.customSidebarSections.find((s) => s.id === id);
              return section ? { ...section, order: index } : null;
            })
            .filter((s): s is CustomSidebarSection => s !== null),
        }));
      },

      addItemToSidebarSection: (sectionId, item) => {
        set((state) => ({
          customSidebarSections: state.customSidebarSections.map((s) =>
            s.id === sectionId
              ? { ...s, items: [...s.items, { ...item, id: `item-${Date.now()}` }] }
              : s
          ),
        }));
      },

      removeItemFromSidebarSection: (sectionId, itemId) => {
        set((state) => ({
          customSidebarSections: state.customSidebarSections.map((s) =>
            s.id === sectionId
              ? { ...s, items: s.items.filter((i) => i.id !== itemId) }
              : s
          ),
        }));
      },

      // Sidebar section order actions
      updateSidebarSectionOrder: (sections) => {
        set({ sidebarSectionOrder: sections });
      },

      setSidebarSectionVisibility: (sectionId, visible) => {
        set((state) => ({
          sidebarSectionOrder: state.sidebarSectionOrder.map((s) =>
            s.id === sectionId ? { ...s, visible } : s
          ),
        }));
      },

      getSidebarSectionOrder: () => {
        const state = get();
        // Merge default sections with custom sections, ensuring all are present
        const existingIds = new Set(state.sidebarSectionOrder.map((s) => s.id));
        const customIds = state.customSidebarSections.map((s) => s.id);

        // Add any custom sections not yet in the order
        let maxOrder = Math.max(...state.sidebarSectionOrder.map((s) => s.order), -1);
        const newSections = customIds
          .filter((id) => !existingIds.has(id))
          .map((id) => ({ id, visible: true, order: ++maxOrder }));

        return [...state.sidebarSectionOrder, ...newSections];
      },

      // Layout actions
      setColumnWidth: (column, width) => {
        set((state) => ({
          columnWidths: {
            ...state.columnWidths,
            [column]: Math.max(50, width), // Minimum 50px width
          },
        }));
      },

      // Behavior actions
      setMeasureFolderSize: (enabled) => {
        set({ measureFolderSize: enabled });
      },

      setSortFilesAndFoldersTogether: (enabled) => {
        set({ sortFilesAndFoldersTogether: enabled });
      },

      setCloseToTray: (enabled) => {
        set({ closeToTray: enabled });
        // Sync with main process
        window.xplorer.settings.setCloseToTray(enabled);
      },

      setTrayRestoreBehavior: (behavior) => {
        set({ trayRestoreBehavior: behavior });
        // Sync with main process
        window.xplorer.settings.setTrayRestoreBehavior(behavior);
      },

      setPromptBeforeOpen: (enabled) => {
        set({ promptBeforeOpen: enabled });
      },

      // File customization actions
      setFileCustomization: (path, customization) => {
        set((state) => {
          const existing = state.fileCustomizations.findIndex((c) => c.path === path);
          if (existing >= 0) {
            // Update existing customization
            const updated = [...state.fileCustomizations];
            updated[existing] = { ...updated[existing], ...customization };
            // Remove if empty (no color and no icon)
            if (!updated[existing].color && !updated[existing].customIcon) {
              updated.splice(existing, 1);
            }
            return { fileCustomizations: updated };
          } else {
            // Add new customization
            return {
              fileCustomizations: [...state.fileCustomizations, { path, ...customization }],
            };
          }
        });
      },

      removeFileCustomization: (path) => {
        set((state) => ({
          fileCustomizations: state.fileCustomizations.filter((c) => c.path !== path),
        }));
      },

      getFileCustomization: (path) => {
        return get().fileCustomizations.find((c) => c.path === path);
      },

      // UI Style actions
      setUIStyle: (style) => {
        set({ uiStyle: style });
        // Update the data attribute on the document
        document.documentElement.setAttribute('data-ui-style', style);
        // Notify main process to update window transparency/blur
        window.xplorer.window.setUIStyle(style);
      },

      // Reset all settings to defaults
      resetSettings: () => {
        // Keep quick access items as they're initialized from user home
        const { quickAccessItems } = get();
        set({
          ...defaultSettings,
          quickAccessItems,
        });
        // Sync tray settings with main process
        window.xplorer.settings.setCloseToTray(defaultSettings.closeToTray);
        window.xplorer.settings.setTrayRestoreBehavior(defaultSettings.trayRestoreBehavior);
      },
    }),
    {
      name: 'xp-settings',
    }
  )
);
