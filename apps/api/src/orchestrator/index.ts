import type { Settings } from '@ai-orchestrator/shared';
import { config } from '../config/index';
import type { DB } from '../db/client';
import type { ProviderManager } from '../providers/manager';
import type { RequestArchive } from '../archive/index';
import { settings as settingsTable } from '../db/schema';
import { nowIso } from '../lib/ids';
import { logger } from '../lib/logger';
import { AnalyticsRecorder } from '../analytics/recorder';
import { getNodePerformance, getProviderSpend, trimRequestEvents } from '../analytics/queries';
import { RealtimeHub } from '../realtime/hub';
import type { PriceBook } from '../cost/pricebook';
import { Dispatcher } from './dispatcher';
import { HealthChecker } from './health';
import { NodeRegistry } from './registry';

/** How often to recompute per-node performance stats from analytics. */
const PERF_REFRESH_MS = 60_000;
/** Look-back window for performance-aware routing. */
const PERF_WINDOW_HOURS = 24;

/** Top-level facade wiring the registry, health checker and dispatcher. */
export class Orchestrator {
  readonly registry: NodeRegistry;
  readonly hub: RealtimeHub;
  readonly recorder: AnalyticsRecorder;
  readonly dispatcher: Dispatcher;
  private readonly health: HealthChecker;
  private settings: Settings;
  /** Set after construction (server.ts) so the dispatcher can spill to cloud. */
  private providerManager: ProviderManager | null = null;
  private perfTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly db: DB,
    private readonly archive: RequestArchive,
    private readonly prices: PriceBook,
  ) {
    this.registry = new NodeRegistry(db);
    this.hub = new RealtimeHub();
    this.recorder = new AnalyticsRecorder(db, prices);
    this.settings = {
      strategy: config.defaultStrategy,
      modelAware: true,
      contextAware: true,
      autoPull: false,
      failoverRetries: config.failoverRetries,
      triageEnabled: false,
      triageModel: '',
      maxToolCalls: 5,
      requestLogMax: 0,
      cloudOverflow: false,
      cloudOverflowProviderId: '',
      embedOverflow: false,
      embedOverflowProviderId: '',
      embedOverflowModel: '',
      privacyMode: false,
    };
    this.dispatcher = new Dispatcher(
      this.registry,
      this.hub,
      this.recorder,
      () => this.settings,
      () => this.providerManager,
      this.archive,
    );
    this.health = new HealthChecker(
      this.registry,
      this.hub,
      config.healthcheckIntervalMs,
      config.healthcheckTimeoutMs,
    );
    this.hub.setSnapshotProvider(() => ({
      type: 'snapshot',
      nodes: this.registry.snapshot(),
      at: nowIso(),
    }));
  }

  getSettings(): Settings {
    return this.settings;
  }

  setSettings(s: Settings): void {
    this.settings = s;
  }

  /** Provide the provider manager so the dispatcher can overflow to the cloud. */
  setProviderManager(pm: ProviderManager): void {
    this.providerManager = pm;
  }

  /** Load persisted state and begin health checks. */
  async start(): Promise<void> {
    await this.loadSettings();
    await this.registry.load();
    this.health.start();
    await this.refreshPerformance();
    await this.refreshProviderSpend();
    this.perfTimer = setInterval(() => {
      void this.refreshPerformance();
      void this.refreshProviderSpend();
    }, PERF_REFRESH_MS);
    this.perfTimer.unref?.();
    logger.info({ nodes: this.registry.list().length }, 'orchestrator started');
  }

  async stop(): Promise<void> {
    this.health.stop();
    if (this.perfTimer) {
      clearInterval(this.perfTimer);
      this.perfTimer = null;
    }
  }

  /**
   * Recompute per-node inference performance (24h) from analytics and push it
   * into the registry, so the performance strategy routes by measured speed.
   */
  async refreshPerformance(): Promise<void> {
    try {
      const perf = await getNodePerformance(PERF_WINDOW_HOURS);
      this.registry.setPerformance(perf);
      // Cyclic retention of the request log (oldest trimmed) when configured.
      if (this.settings.requestLogMax > 0) await trimRequestEvents(this.settings.requestLogMax);
    } catch (err) {
      logger.warn({ err }, 'failed to refresh node performance stats');
    }
  }

  /**
   * Recompute month-to-date spend per provider and push it to the provider
   * manager, so budget-exceeded providers are skipped during routing.
   */
  async refreshProviderSpend(): Promise<void> {
    if (!this.providerManager) return;
    try {
      const now = new Date();
      const monthStart = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
      ).toISOString();
      const spend = await getProviderSpend(monthStart);
      this.providerManager.setSpend(spend);
    } catch (err) {
      logger.warn({ err }, 'failed to refresh provider spend');
    }
  }

  /** Re-read nodes from the database (after a CRUD change). */
  async reloadNodes(): Promise<void> {
    await this.registry.load();
  }

  private async loadSettings(): Promise<void> {
    try {
      const rows = await this.db.select().from(settingsTable).limit(1);
      const row = rows[0];
      if (row) {
        this.settings = {
          strategy: row.strategy as Settings['strategy'],
          modelAware: row.modelAware,
          contextAware: row.contextAware,
          autoPull: row.autoPull,
          failoverRetries: row.failoverRetries,
          triageEnabled: row.triageEnabled,
          triageModel: row.triageModel,
          maxToolCalls: row.maxToolCalls,
          requestLogMax: row.requestLogMax,
          cloudOverflow: row.cloudOverflow,
          cloudOverflowProviderId: row.cloudOverflowProviderId,
          embedOverflow: row.embedOverflow,
          embedOverflowProviderId: row.embedOverflowProviderId,
          embedOverflowModel: row.embedOverflowModel,
          privacyMode: row.privacyMode,
        };
      }
    } catch (err) {
      logger.warn({ err }, 'could not load settings; using defaults');
    }
  }
}
