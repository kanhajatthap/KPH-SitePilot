'use client';

import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from 'react';

export type ThemeMode = 'light' | 'dark' | 'system';

interface ThemeContextValue {
  theme: ThemeMode;
  resolvedTheme: 'light' | 'dark';
  setTheme: (theme: ThemeMode) => void;
  toggleTheme: (theme: 'light' | 'dark') => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);
const STORAGE_KEY = 'sitepilot.theme-preference.v1';

function getPreferredColorScheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Start from a value that is identical on the server and during hydration. The
  // theme is applied to <html> by the inline script in the root layout, so nothing
  // flashes while we read the stored preference on mount.
  const [theme, setThemeState] = useState<ThemeMode>('system');
  const [osPrefers, setOsPrefers] = useState<'light' | 'dark'>('light');
  const [hydrated, setHydrated] = useState(false);

  const resolvedTheme = useMemo<'light' | 'dark'>(() => {
    return theme === 'system' ? osPrefers : theme;
  }, [theme, osPrefers]);

  // Read the saved preference after hydration (localStorage is client-only). Doing
  // this in an effect instead of a useState initializer avoids a hydration mismatch.
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as ThemeMode | null;
    if (stored === 'light' || stored === 'dark' || stored === 'system') {
      setThemeState(stored);
    }
    setOsPrefers(getPreferredColorScheme());
    setHydrated(true);
  }, []);

  // Apply the class to <html> once the stored preference is known.
  useEffect(() => {
    if (!hydrated) return;
    const root = document.documentElement;
    root.classList.toggle('dark', resolvedTheme === 'dark');
  }, [hydrated, resolvedTheme]);

  // Listen for OS changes when on system
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => setOsPrefers(mq.matches ? 'dark' : 'light');
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const setTheme = (next: ThemeMode) => {
    localStorage.setItem(STORAGE_KEY, next);
    setThemeState(next);
  };

  const toggleTheme = (t: 'light' | 'dark') => {
    localStorage.setItem(STORAGE_KEY, t);
    setThemeState(t);
  };

  const value = useMemo(
    () => ({ theme, resolvedTheme, setTheme, toggleTheme }),
    [theme, resolvedTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
};