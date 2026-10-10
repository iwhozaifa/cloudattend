import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type Theme = 'dark' | 'light' | 'system';
type ThemeContextValue = { theme: Theme; resolvedTheme: 'dark' | 'light'; setTheme: (theme: Theme) => void };

const STORAGE_KEY = 'cloudattend.theme';
const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

function readStoredTheme(): Theme {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === 'dark' || value === 'light' || value === 'system' ? value : 'system';
  } catch {
    return 'system';
  }
}
const systemPrefersDark = () => typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches;

/** The shadcn/ui Vite dark-mode provider: toggles the `dark` class on <html> and remembers the choice. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(readStoredTheme);
  const [systemDark, setSystemDark] = useState(systemPrefersDark);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setSystemDark(query.matches);
    query.addEventListener?.('change', onChange);
    return () => query.removeEventListener?.('change', onChange);
  }, []);

  const resolvedTheme = theme === 'system' ? (systemDark ? 'dark' : 'light') : theme;
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(resolvedTheme);
    root.style.colorScheme = resolvedTheme;
  }, [resolvedTheme]);

  const setTheme = useCallback((next: Theme) => {
    try { localStorage.setItem(STORAGE_KEY, next); } catch { /* preference lasts for this visit */ }
    setThemeState(next);
  }, []);
  const value = useMemo(() => ({ theme, resolvedTheme, setTheme }), [theme, resolvedTheme, setTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useTheme must be used inside <ThemeProvider>.');
  return value;
}
