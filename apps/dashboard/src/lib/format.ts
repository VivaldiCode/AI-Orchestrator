import type { NodeStatus } from '@ai-orchestrator/shared';

export function formatLatency(ms: number | null | undefined): string {
  if (ms == null) return '—';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

export function formatNumber(n: number | null | undefined): string {
  if (n == null) return '—';
  return new Intl.NumberFormat('en-US').format(n);
}

export function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export function formatRelativeTime(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return 'never';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return 'unknown';
  const diff = Math.max(0, now - then);
  const s = Math.round(diff / 1000);
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
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
