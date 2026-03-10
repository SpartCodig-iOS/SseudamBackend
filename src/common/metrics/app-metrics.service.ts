/**
 * AppMetricsService
 *
 * prom-client 기반 Prometheus 메트릭 레지스트리.
 * 여행 정산 서비스에 특화된 핵심 메트릭을 관리한다.
 *
 * 등록된 메트릭:
 *   travel_created_total          - 여행 생성 횟수
 *   settlement_calculated_total   - 정산 계산 횟수
 *   auth_login_duration_seconds   - 로그인 처리 시간 히스토그램
 *   expense_added_total           - 지출 추가 횟수
 *   cache_hit_ratio               - 캐시 히트율 게이지
 *   http_requests_total           - HTTP 요청 횟수 (method, status, path 레이블)
 *   http_request_duration_seconds - HTTP 요청 처리 시간 히스토그램
 */
import { Injectable, OnModuleInit } from '@nestjs/common';
import {
  Registry,
  collectDefaultMetrics,
  Counter,
  Histogram,
  Gauge,
} from 'prom-client';

@Injectable()
export class AppMetricsService implements OnModuleInit {
  private readonly registry: Registry;

  // ── 비즈니스 메트릭 ──────────────────────────────────────────────────────

  readonly travelCreatedTotal: Counter<string>;
  readonly settlementCalculatedTotal: Counter<string>;
  readonly authLoginDurationSeconds: Histogram<string>;
  readonly expenseAddedTotal: Counter<string>;
  readonly cacheHitRatio: Gauge<string>;

  // ── HTTP 메트릭 ──────────────────────────────────────────────────────────

  readonly httpRequestsTotal: Counter<string>;
  readonly httpRequestDurationSeconds: Histogram<string>;

  constructor() {
    this.registry = new Registry();

    // Node.js 기본 메트릭 (process_cpu_*, nodejs_heap_*, etc.)
    collectDefaultMetrics({ register: this.registry });

    // ── 비즈니스 메트릭 정의 ───────────────────────────────────────────────

    this.travelCreatedTotal = new Counter({
      name: 'travel_created_total',
      help: 'Total number of travels created',
      labelNames: ['status'],
      registers: [this.registry],
    });

    this.settlementCalculatedTotal = new Counter({
      name: 'settlement_calculated_total',
      help: 'Total number of settlement calculations performed',
      labelNames: ['travel_id', 'status'],
      registers: [this.registry],
    });

    this.authLoginDurationSeconds = new Histogram({
      name: 'auth_login_duration_seconds',
      help: 'Duration of login processing in seconds',
      labelNames: ['method', 'status'],
      // p50/p90/p95/p99 등 분포 파악에 적합한 버킷
      buckets: [0.05, 0.1, 0.2, 0.3, 0.5, 1, 2, 5],
      registers: [this.registry],
    });

    this.expenseAddedTotal = new Counter({
      name: 'expense_added_total',
      help: 'Total number of expenses added to travels',
      labelNames: ['currency', 'category'],
      registers: [this.registry],
    });

    this.cacheHitRatio = new Gauge({
      name: 'cache_hit_ratio',
      help: 'Cache hit ratio (0.0 ~ 1.0)',
      labelNames: ['cache_type'],
      registers: [this.registry],
    });

    // ── HTTP 메트릭 정의 ───────────────────────────────────────────────────

    this.httpRequestsTotal = new Counter({
      name: 'http_requests_total',
      help: 'Total number of HTTP requests',
      labelNames: ['method', 'status_code', 'route'],
      registers: [this.registry],
    });

    this.httpRequestDurationSeconds = new Histogram({
      name: 'http_request_duration_seconds',
      help: 'Duration of HTTP requests in seconds',
      labelNames: ['method', 'status_code', 'route'],
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
      registers: [this.registry],
    });
  }

  onModuleInit() {
    // 초기 캐시 히트율 0으로 설정
    this.cacheHitRatio.set({ cache_type: 'redis' }, 0);
    this.cacheHitRatio.set({ cache_type: 'memory' }, 0);
  }

  // ── 비즈니스 이벤트 헬퍼 메서드 ─────────────────────────────────────────

  recordTravelCreated(status: 'success' | 'error' = 'success'): void {
    this.travelCreatedTotal.inc({ status });
  }

  recordSettlementCalculated(travelId: string, status: 'success' | 'error' = 'success'): void {
    // travelId는 카디널리티가 높으므로 Prometheus 레이블로 직접 쓰지 않는다.
    // 여기서는 'all' 로 집계하고 travelId는 로그에서 추적
    this.settlementCalculatedTotal.inc({ travel_id: 'all', status });
  }

  recordLoginAttempt(
    method: 'email' | 'google' | 'apple' | 'kakao' | 'username',
    durationMs: number,
    status: 'success' | 'failure',
  ): void {
    this.authLoginDurationSeconds.observe(
      { method, status },
      durationMs / 1000,
    );
  }

  recordExpenseAdded(currency: string, category: string | null): void {
    this.expenseAddedTotal.inc({
      currency: currency || 'unknown',
      category: category || 'uncategorized',
    });
  }

  updateCacheHitRatio(cacheType: 'redis' | 'memory', ratio: number): void {
    this.cacheHitRatio.set({ cache_type: cacheType }, ratio);
  }

  recordHttpRequest(
    method: string,
    statusCode: number,
    route: string,
    durationMs: number,
  ): void {
    const labels = {
      method: method.toUpperCase(),
      status_code: String(statusCode),
      route,
    };
    this.httpRequestsTotal.inc(labels);
    this.httpRequestDurationSeconds.observe(labels, durationMs / 1000);
  }

  // ── Prometheus 텍스트 형식으로 직렬화 ────────────────────────────────────

  async getMetricsAsText(): Promise<string> {
    return this.registry.metrics();
  }

  getContentType(): string {
    return this.registry.contentType;
  }
}
