import { useCallback, useEffect, useState } from 'react';

export type ThemeMode = 'light' | 'dark';
export type Density = 'compact' | 'comfortable';

const THEME_KEY = 'brabo_theme';
const DENSITY_KEY = 'brabo_density';

function getPreferredTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function readThemeFromDom(): ThemeMode {
  if (typeof document === 'undefined') return getPreferredTheme();
  const attr = document.documentElement.getAttribute('data-theme');
  if (attr === 'dark' || attr === 'light') return attr;
  return getPreferredTheme();
}

function readDensityFromDom(): Density {
  if (typeof document === 'undefined') return 'compact';
  return document.documentElement.getAttribute('data-density') === 'comfortable'
    ? 'comfortable'
    : 'compact';
}

/**
 * Theme + density control.
 * index.html applies persisted theme before first paint.
 */
export function useTheme() {
  const [theme, setTheme] = useState<ThemeMode>(readThemeFromDom);
  const [density, setDensity] = useState<Density>(readDensityFromDom);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      // ignore
    }
  }, [theme]);

  useEffect(() => {
    if (density === 'comfortable') {
      document.documentElement.setAttribute('data-density', 'comfortable');
    } else {
      document.documentElement.removeAttribute('data-density');
    }
    try {
      localStorage.setItem(DENSITY_KEY, density);
    } catch {
      // ignore
    }
  }, [density]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  const toggleDensity = useCallback(() => {
    setDensity((prev) => (prev === 'compact' ? 'comfortable' : 'compact'));
  }, []);

  return {
    theme,
    density,
    setTheme,
    setDensity,
    toggleTheme,
    toggleDensity,
  };
}
