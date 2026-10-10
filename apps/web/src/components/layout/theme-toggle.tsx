import { MoonIcon, SunIcon } from 'lucide-react';
import { useTheme } from '@/components/theme-provider';
import { Button } from '@/components/ui/button';

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const dark = resolvedTheme === 'dark';
  return (
    <Button variant="ghost" size="icon" onClick={() => setTheme(dark ? 'light' : 'dark')} aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}>
      {dark ? <SunIcon /> : <MoonIcon />}
    </Button>
  );
}
