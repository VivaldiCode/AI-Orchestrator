import { useI18n } from '../i18n';
import { useTheme } from '../lib/theme';

export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const { t } = useI18n();
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={t('common.theme')}
      title={t('common.theme')}
      className="rounded-lg border border-slate-700 px-2 py-1 text-sm text-slate-400 hover:text-slate-100"
    >
      {theme === 'dark' ? '☀️' : '🌙'}
    </button>
  );
}
