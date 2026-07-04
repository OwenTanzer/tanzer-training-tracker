import { setTheme, useTheme } from '../lib/theme';

export function ThemeToggle() {
  const theme = useTheme();
  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isDark}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
        isDark ? 'bg-sky-600' : 'bg-gray-300'
      }`}
    >
      <span
        className={`inline-flex h-4 w-4 transform items-center justify-center rounded-full bg-white text-[10px] leading-none transition-transform ${
          isDark ? 'translate-x-6' : 'translate-x-1'
        }`}
      >
        {isDark ? '🌙' : '☀️'}
      </span>
    </button>
  );
}
