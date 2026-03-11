import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { getPool, getPoolStats } from '../../db/pool';

// ────────────────────────────────────────────────────────────
// 타입 정의
// ────────────────────────────────────────────────────────────

export interface PoolHealthStatus {
  status: 'healthy' | 'warning' | 'critical' | 'unknown';
  totalCount: number;
  idleCount: number;
  activeCount: number;
  waitingCount: number;
  /** 활성 연결 비율 (activeCount / totalCount) */
  utilizationPercent: number;
  /** 경고 메시지 목록 */
  warnings: string[];
  timestamp: string;
}

export interface PoolSnapshot {
  timestamp: number;
  totalCount: number;
  idleCount: number;
  activeCount: number;
  waitingCount: number;
}

export interface PoolMonitorReport {
  current: PoolHealthStatus;
  history: PoolSnapshot[];
  avgUtilizationPercent: number;
  peakActiveCount: number;
  peakWaitingCount: number;
}

// ────────────────────────────────────────────────────────────
// 임계값 상수
// ────────────────────────────────────────────────────────────

const THRESHOLD = {
  /** 대기 중 연결이 이 값 이상이면 WARNING */
  WAITING_WARN: 3,
  /** 대기 중 연결이 이 값 이상이면 CRITICAL */
  WAITING_CRITICAL: 8,
  /** 활성 연결 비율이 이 값 이상이면 WARNING (%) */
  UTILIZATION_WARN: 70,
  /** 활성 연결 비율이 이 값 이상이면 CRITICAL (%) */
  UTILIZATION_CRITICAL: 90,
  /** 유지할 히스토리 스냅샷 수 */
  HISTORY_SIZE: 60,
  /** 스냅샷 수집 간격 (ms) */
  SNAPSHOT_INTERVAL_MS: 30_000, // 30초
  /** DB 연결 검증 간격 (ms) - 스냅샷과 독립적 */
  PING_INTERVAL_MS: 60_000, // 1분
} as const;

// ────────────────────────────────────────────────────────────
// PoolMonitorService
// ────────────────────────────────────────────────────────────

/**
 * 데이터베이스 커넥션 풀 모니터링 서비스.
 *
 * - 30초마다 풀 스냅샷을 수집해 히스토리를 유지합니다.
 * - waiting/utilization 임계값을 초과하면 Logger.warn 경고를 발생시킵니다.
 * - HealthController에서 `/metrics` 응답에 포함됩니다.
 * - Railway Sleep 모드 호환: 타이머에 unref() 적용.
 */
@Injectable()
export class PoolMonitorService implements OnModuleDestroy {
  private readonly logger = new Logger(PoolMonitorService.name);

  private readonly history: PoolSnapshot[] = [];
  private snapshotTimer: NodeJS.Timeout | null = null;
  private pingTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.startSnapshotTimer();
    this.startPingTimer();
  }

  onModuleDestroy(): void {
    if (this.snapshotTimer) clearInterval(this.snapshotTimer);
    if (this.pingTimer) clearInterval(this.pingTimer);
  }

  // ── 공개 API ──────────────────────────────────────────────

  /**
   * 현재 풀 상태를 즉시 반환합니다.
   */
  getCurrentStatus(): PoolHealthStatus {
    const raw = getPoolStats();

    if (!raw) {
      return {
        status: 'unknown',
        totalCount: 0,
        idleCount: 0,
        activeCount: 0,
        waitingCount: 0,
        utilizationPercent: 0,
        warnings: ['Pool not initialized'],
        timestamp: new Date().toISOString(),
      };
    }

    const utilizationPercent =
      raw.totalCount > 0
        ? parseFloat(((raw.activeCount / raw.totalCount) * 100).toFixed(1))
        : 0;

    const warnings: string[] = [];
    let status: PoolHealthStatus['status'] = 'healthy';

    // 대기 연결 경고
    if (raw.waitingCount >= THRESHOLD.WAITING_CRITICAL) {
      warnings.push(
        `CRITICAL: ${raw.waitingCount} connections waiting (threshold: ${THRESHOLD.WAITING_CRITICAL})`,
      );
      status = 'critical';
    } else if (raw.waitingCount >= THRESHOLD.WAITING_WARN) {
      warnings.push(
        `WARNING: ${raw.waitingCount} connections waiting (threshold: ${THRESHOLD.WAITING_WARN})`,
      );
      if (status === 'healthy') status = 'warning';
    }

    // 활성 연결 비율 경고
    if (utilizationPercent >= THRESHOLD.UTILIZATION_CRITICAL) {
      warnings.push(
        `CRITICAL: Pool utilization ${utilizationPercent}% (threshold: ${THRESHOLD.UTILIZATION_CRITICAL}%)`,
      );
      status = 'critical';
    } else if (utilizationPercent >= THRESHOLD.UTILIZATION_WARN) {
      warnings.push(
        `WARNING: Pool utilization ${utilizationPercent}% (threshold: ${THRESHOLD.UTILIZATION_WARN}%)`,
      );
      if (status === 'healthy') status = 'warning';
    }

    return {
      status,
      totalCount: raw.totalCount,
      idleCount: raw.idleCount,
      activeCount: raw.activeCount,
      waitingCount: raw.waitingCount,
      utilizationPercent,
      warnings,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * 히스토리 포함 전체 리포트를 반환합니다.
   */
  getReport(): PoolMonitorReport {
    const current = this.getCurrentStatus();

    const avgUtilizationPercent =
      this.history.length > 0
        ? parseFloat(
            (
              this.history.reduce((sum, s) => {
                const u = s.totalCount > 0 ? (s.activeCount / s.totalCount) * 100 : 0;
                return sum + u;
              }, 0) / this.history.length
            ).toFixed(1),
          )
        : 0;

    const peakActiveCount = this.history.reduce(
      (max, s) => Math.max(max, s.activeCount),
      0,
    );
    const peakWaitingCount = this.history.reduce(
      (max, s) => Math.max(max, s.waitingCount),
      0,
    );

    return {
      current,
      history: [...this.history],
      avgUtilizationPercent,
      peakActiveCount,
      peakWaitingCount,
    };
  }

  /**
   * DB 연결 ping 테스트 결과를 반환합니다.
   */
  async ping(): Promise<{ ok: boolean; latencyMs: number }> {
    const start = Date.now();
    try {
      const pool = await getPool();
      const client = await pool.connect();
      await client.query('SELECT 1');
      client.release();
      return { ok: true, latencyMs: Date.now() - start };
    } catch {
      return { ok: false, latencyMs: Date.now() - start };
    }
  }

  // ── 내부 메서드 ───────────────────────────────────────────

  private collectSnapshot(): void {
    const raw = getPoolStats();
    if (!raw) return;

    const snapshot: PoolSnapshot = {
      timestamp: Date.now(),
      totalCount: raw.totalCount,
      idleCount: raw.idleCount,
      activeCount: raw.activeCount,
      waitingCount: raw.waitingCount,
    };

    this.history.push(snapshot);

    // 히스토리 크기 제한
    if (this.history.length > THRESHOLD.HISTORY_SIZE) {
      this.history.splice(0, this.history.length - THRESHOLD.HISTORY_SIZE);
    }

    // 경고 상태 로깅
    const status = this.getCurrentStatus();
    if (status.status === 'critical') {
      this.logger.error(
        `[PoolMonitor] CRITICAL pool status: ${status.warnings.join(' | ')}`,
        {
          totalCount: status.totalCount,
          activeCount: status.activeCount,
          waitingCount: status.waitingCount,
        },
      );
    } else if (status.status === 'warning') {
      this.logger.warn(
        `[PoolMonitor] WARNING pool status: ${status.warnings.join(' | ')}`,
        {
          totalCount: status.totalCount,
          activeCount: status.activeCount,
          waitingCount: status.waitingCount,
        },
      );
    }
  }

  private startSnapshotTimer(): void {
    this.snapshotTimer = setInterval(() => {
      this.collectSnapshot();
    }, THRESHOLD.SNAPSHOT_INTERVAL_MS);

    this.snapshotTimer.unref?.();
  }

  private startPingTimer(): void {
    this.pingTimer = setInterval(async () => {
      const result = await this.ping();
      if (!result.ok) {
        this.logger.error('[PoolMonitor] DB ping failed - connection may be lost');
      } else if (result.latencyMs > 1000) {
        this.logger.warn(
          `[PoolMonitor] Slow DB ping: ${result.latencyMs}ms`,
        );
      }
    }, THRESHOLD.PING_INTERVAL_MS);

    this.pingTimer.unref?.();
  }
}
