import type { NodeStatus } from '@ai-orchestrator/shared';

export function formatLatency(ms: number | null | undefined): string {
  if (ms == null) return '—';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  return `${value.toFixed(i > 0 && value < 10 ? 1 : 0)} ${units[i]}`;
}

export function formatNumber(n: number | null | undefined, locale = 'en'): string {
  if (n == null) return '—';
  return new Intl.NumberFormat(locale).format(n);
}

export function formatPercent(value: number, locale = 'en'): string {
  return new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 1 }).format(
    value,
  );
}

/** Localized relative time via Intl (e.g. "2 hours ago" / "há 2 horas"). */
export function formatRelativeTime(
  iso: string | null | undefined,
  locale = 'en',
  now = Date.now(),
): string {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diffSec = Math.round((then - now) / 1000);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  if (Math.abs(diffSec) < 60) return rtf.format(diffSec, 'second');
  const min = Math.round(diffSec / 60);
  if (Math.abs(min) < 60) return rtf.format(min, 'minute');
  const hr = Math.round(diffSec / 3600);
  if (Math.abs(hr) < 24) return rtf.format(hr, 'hour');
  return rtf.format(Math.round(diffSec / 86400), 'day');
}

export function statusColor(status: NodeStatus): string {
  switch (status) {
    case 'up':
      return 'text-emerald-400';
    case 'degraded':
      return 'text-amber-400';
    case 'down':
      return 'text-rose-400';
    default:
      return 'text-slate-400';
  }
}

export function statusDot(status: NodeStatus): string {
  switch (status) {
    case 'up':
      return 'bg-emerald-400';
    case 'degraded':
      return 'bg-amber-400';
    case 'down':
      return 'bg-rose-400';
    default:
      return 'bg-slate-500';
  }
}
