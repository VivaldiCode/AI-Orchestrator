import type { Settings } from '@ai-orchestrator/shared';
import { config } from '../config/index';
import type { DB } from '../db/client';
import type { ProviderManager } from '../providers/manager';
import type { RequestArchive } from '../archive/index';
import { settings as settingsTable } from '../db/schema';
import { nowIso } from '../lib/ids';
import { logger } from '../lib/logger';
import { AnalyticsRecorder } from '../analytics/recorder';
import { getNodePerformance } from '../analytics/queries';
import { RealtimeHub } from '../realtime/hub';
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
  ) {
    this.registry = new NodeRegistry(db);
    this.hub = new RealtimeHub();
    this.recorder = new AnalyticsRecorder(db);
    this.settings = {
      strategy: config.defaultStrategy,
      modelAware: true,
      contextAware: true,
      autoPull: false,
      failoverRetries: config.failoverRetries,
      triageEnabled: false,
      triageModel: '',
      maxToolCalls: 5,
      cloudOverflow: false,
      cloudOverflowProviderId: '',
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
    this.perfTimer = setInterval(() => void this.refreshPerformance(), PERF_REFRESH_MS);
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
    } catch (err) {
      logger.warn({ err }, 'failed to refresh node performance stats');
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
          cloudOverflow: row.cloudOverflow,
          cloudOverflowProviderId: row.cloudOverflowProviderId,
          privacyMode: row.privacyMode,
        };
      }
    } catch (err) {
      logger.warn({ err }, 'could not load settings; using defaults');
    }
  }
}
