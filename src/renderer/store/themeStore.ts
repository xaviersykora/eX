import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ThemeName = 'dark' | 'light' | 'system';

export interface CustomTheme {
  id: string;
  name: string;
  base: 'dark' | 'light';
  colors: Record<string, string>;
}

interface ThemeState {
  theme: ThemeName;
  customThemes: CustomTheme[];
  activeCustomTheme: string | null;
  accentColor: string;
}

interface ThemeActions {
  setTheme: (theme: ThemeName) => void;
  setAccentColor: (color: string) => void;
  addCustomTheme: (theme: CustomTheme) => void;
  removeCustomTheme: (id: string) => void;
  setActiveCustomTheme: (id: string | null) => void;
  initTheme: () => void;
  getEffectiveTheme: () => 'dark' | 'light';
}

const DEFAULT_ACCENT = '#0078d4';

export const useThemeStore = create<ThemeState & ThemeActions>()(
  persist(
    (set, get) => ({
      theme: 'dark',
      customThemes: [],
      activeCustomTheme: null,
      accentColor: DEFAULT_ACCENT,

      setTheme: (theme) => {
        set({ theme });
        applyTheme(get().getEffectiveTheme(), get().accentColor);
      },

      setAccentColor: (color) => {
        set({ accentColor: color });
        document.documentElement.style.setProperty('--accent-color', color);
        // Calculate hover and active variants
        document.documentElement.style.setProperty(
          '--accent-color-hover',
          adjustColor(color, 10)
        );
        document.documentElement.style.setProperty(
          '--accent-color-active',
          adjustColor(color, -10)
        );
      },

      addCustomTheme: (theme) => {
        set((state) => ({
          customThemes: [...state.customThemes, theme],
        }));
      },

      removeCustomTheme: (id) => {
        set((state) => ({
          customThemes: state.customThemes.filter((t) => t.id !== id),
          activeCustomTheme:
            state.activeCustomTheme === id ? null : state.activeCustomTheme,
        }));
      },

      setActiveCustomTheme: (id) => {
        set({ activeCustomTheme: id });
        const { customThemes, accentColor } = get();
        const theme = customThemes.find((t) => t.id === id);
        if (theme) {
          applyCustomTheme(theme, accentColor);
        } else {
          applyTheme(get().getEffectiveTheme(), accentColor);
        }
      },

      initTheme: () => {
        const { theme, accentColor, activeCustomTheme, customThemes, getEffectiveTheme } = get();

        if (activeCustomTheme) {
          const customTheme = customThemes.find((t) => t.id === activeCustomTheme);
          if (customTheme) {
            applyCustomTheme(customTheme, accentColor);
            return;
          }
        }

        applyTheme(getEffectiveTheme(), accentColor);

        // Listen for system theme changes
        if (theme === 'system') {
          window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
            if (get().theme === 'system') {
              applyTheme(e.matches ? 'dark' : 'light', get().accentColor);
            }
          });
        }
      },

      getEffectiveTheme: () => {
        const { theme } = get();
        if (theme === 'system') {
          return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        }
        return theme;
      },
    }),
    {
      name: 'xp-theme',
      partialize: (state) => ({
        theme: state.theme,
        customThemes: state.customThemes,
        activeCustomTheme: state.activeCustomTheme,
        accentColor: state.accentColor,
      }),
    }
  )
);

function applyTheme(theme: 'dark' | 'light', accentColor: string): void {
  document.documentElement.setAttribute('data-theme', theme);
  document.documentElement.style.setProperty('--accent-color', accentColor);
  document.documentElement.style.setProperty('--accent-color-hover', adjustColor(accentColor, 10));
  document.documentElement.style.setProperty('--accent-color-active', adjustColor(accentColor, -10));
}

function applyCustomTheme(theme: CustomTheme, accentColor: string): void {
  document.documentElement.setAttribute('data-theme', theme.base);

  for (const [key, value] of Object.entries(theme.colors)) {
    document.documentElement.style.setProperty(`--${key}`, value);
  }

  document.documentElement.style.setProperty('--accent-color', accentColor);
  document.documentElement.style.setProperty('--accent-color-hover', adjustColor(accentColor, 10));
  document.documentElement.style.setProperty('--accent-color-active', adjustColor(accentColor, -10));
}

function adjustColor(hex: string, percent: number): string {
  // Convert hex to RGB
  const num = parseInt(hex.replace('#', ''), 16);
  let r = (num >> 16) + percent;
  let g = ((num >> 8) & 0x00ff) + percent;
  let b = (num & 0x0000ff) + percent;

  // Clamp values
  r = Math.min(255, Math.max(0, r));
  g = Math.min(255, Math.max(0, g));
  b = Math.min(255, Math.max(0, b));

  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}
