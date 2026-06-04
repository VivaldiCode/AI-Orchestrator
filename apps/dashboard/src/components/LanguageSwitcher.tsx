import { useI18n } from '../i18n';
import { cn } from './ui';

export function LanguageSwitcher() {
  const { lang, setLang, locales, t } = useI18n();
  return (
    <div className="flex items-center gap-1" role="group" aria-label={t('common.language')}>
      {locales.map((l) => (
        <button
          key={l.code}
          type="button"
          onClick={() => setLang(l.code)}
          aria-pressed={lang === l.code}
          title={l.label}
          className={cn(
            'rounded px-2 py-1 text-xs font-medium transition-colors',
            lang === l.code
              ? 'bg-concert-600/30 text-concert-100'
              : 'text-slate-500 hover:text-slate-200',
          )}
        >
          {l.code.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
