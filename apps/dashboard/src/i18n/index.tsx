import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { formatLatency, formatNumber, formatPercent, formatRelativeTime } from '../lib/format';
import { en, type Dict, type TranslationKey } from './en';
import { pt } from './pt';

export type Lang = 'en' | 'pt';

const DICTS: Record<Lang, Dict> = { en, pt };

export const LOCALES: { code: Lang; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'pt', label: 'Português' },
];

const STORAGE_KEY = 'aio.lang';

function detectLang(): Lang {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'en' || stored === 'pt') return stored;
  } catch {
    /* localStorage unavailable */
  }
  return navigator.language?.toLowerCase().startsWith('pt') ? 'pt' : 'en';
}

type TParams = Record<string, string | number>;

function interpolate(template: string, params?: TParams): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, key: string) =>
    key in params ? String(params[key]) : `{${key}}`,
  );
}

interface Formatters {
  number: (n: number | null | undefined) => string;
  percent: (value: number) => string;
  latency: (ms: number | null | undefined) => string;
  relativeTime: (iso: string | null | undefined) => string;
}

interface I18nValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: TranslationKey, params?: TParams) => string;
  fmt: Formatters;
  locales: typeof LOCALES;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => detectLang());

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = (next: Lang): void => {
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
    setLangState(next);
  };

  const value = useMemo<I18nValue>(() => {
    const dict = DICTS[lang];
    const t = (key: TranslationKey, params?: TParams): string =>
      interpolate(dict[key] ?? en[key] ?? key, params);
    const fmt: Formatters = {
      number: (n) => formatNumber(n, lang),
      percent: (v) => formatPercent(v, lang),
      latency: (ms) => formatLatency(ms),
      relativeTime: (iso) => formatRelativeTime(iso, lang),
    };
    return { lang, setLang, t, fmt, locales: LOCALES };
  }, [lang]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}
