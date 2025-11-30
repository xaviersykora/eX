import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Entry in the folder size cache
interface FolderSizeCacheEntry {
  size: number;
  modifiedAt: number; // Timestamp when folder was last modified (from fs stat)
  cachedAt: number;   // Timestamp when this cache entry was created
}

interface FolderSizeCacheState {
  cache: Record<string, FolderSizeCacheEntry>;
}

interface FolderSizeCacheActions {
  getEntry: (path: string) => FolderSizeCacheEntry | undefined;
  setEntry: (path: string, size: number, modifiedAt: number) => void;
  removeEntry: (path: string) => void;
  clearCache: () => void;
  isValid: (path: string, currentModifiedAt: number) => boolean;
}

export const useFolderSizeCacheStore = create<FolderSizeCacheState & FolderSizeCacheActions>()(
  persist(
    (set, get) => ({
      cache: {},

      getEntry: (path) => {
        return get().cache[path];
      },

      setEntry: (path, size, modifiedAt) => {
        set((state) => ({
          cache: {
            ...state.cache,
            [path]: {
              size,
              modifiedAt,
              cachedAt: Date.now(),
            },
          },
        }));
      },

      removeEntry: (path) => {
        set((state) => {
          const newCache = { ...state.cache };
          delete newCache[path];
          return { cache: newCache };
        });
      },

      clearCache: () => {
        set({ cache: {} });
      },

      // Check if cached entry is still valid (folder hasn't been modified)
      isValid: (path, currentModifiedAt) => {
        const entry = get().cache[path];
        if (!entry) return false;
        // Cache is valid if folder modification time matches
        return entry.modifiedAt === currentModifiedAt;
      },
    }),
    {
      name: 'xp-folder-size-cache',
    }
  )
);
