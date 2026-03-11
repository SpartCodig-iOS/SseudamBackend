import { Logger } from '@nestjs/common';

// ────────────────────────────────────────────────────────────
// 타입 정의
// ────────────────────────────────────────────────────────────

export interface BatchOptions {
  /**
   * 청크당 항목 수
   * @default 100
   */
  chunkSize?: number;
  /**
   * 동시에 처리할 최대 청크 수 (0 = 순차)
   * @default 3
   */
  concurrency?: number;
  /**
   * 메모리 임계값 (MB). 초과 시 청크 사이에 GC를 시도합니다.
   * @default 300
   */
  memoryThresholdMb?: number;
  /**
   * 각 청크 처리 후 진행률 콜백
   */
  onProgress?: (progress: BatchProgress) => void;
  /**
   * 청크 처리 실패 시 재시도 횟수
   * @default 0
   */
  retries?: number;
  /**
   * 재시도 사이 대기 시간 (ms)
   * @default 200
   */
  retryDelayMs?: number;
}

export interface BatchProgress {
  processedItems: number;
  totalItems: number;
  processedChunks: number;
  totalChunks: number;
  percentComplete: number;
  elapsedMs: number;
  estimatedRemainingMs: number;
  memoryUsageMb: number;
}

export interface BatchResult<R> {
  results: R[];
  errors: Array<{ chunkIndex: number; error: Error }>;
  totalItems: number;
  processedItems: number;
  failedItems: number;
  elapsedMs: number;
}

// ────────────────────────────────────────────────────────────
// BatchProcessor
// ────────────────────────────────────────────────────────────

/**
 * 대용량 데이터 처리 헬퍼.
 *
 * - 청크 분할 + 동시성 제어 (semaphore 패턴)
 * - 메모리 임계값 초과 시 청크 간격에 GC 요청
 * - 진행률 콜백으로 실시간 모니터링 가능
 * - 에러 격리: 한 청크 실패가 전체를 멈추지 않음
 *
 * 사용 예:
 * ```typescript
 * const result = await BatchProcessor.process(
 *   largeUserIds,
 *   async (chunk) => db.findUsersByIds(chunk),
 *   { chunkSize: 50, concurrency: 5, onProgress: (p) => logger.debug(p) }
 * );
 * ```
 */
export class BatchProcessor {
  private static readonly logger = new Logger(BatchProcessor.name);

  /**
   * 데이터를 청크로 나눠 병렬·순차 처리합니다.
   *
   * @param data      처리할 전체 데이터 배열
   * @param processor 청크를 받아 결과를 반환하는 비동기 함수
   * @param options   배치 옵션
   */
  static async process<T, R>(
    data: T[],
    processor: (chunk: T[], chunkIndex: number) => Promise<R[]>,
    options: BatchOptions = {},
  ): Promise<BatchResult<R>> {
    const {
      chunkSize = 100,
      concurrency = 3,
      memoryThresholdMb = 300,
      onProgress,
      retries = 0,
      retryDelayMs = 200,
    } = options;

    if (data.length === 0) {
      return {
        results: [],
        errors: [],
        totalItems: 0,
        processedItems: 0,
        failedItems: 0,
        elapsedMs: 0,
      };
    }

    const startTime = Date.now();
    const chunks = this.splitIntoChunks(data, chunkSize);
    const totalChunks = chunks.length;
    const allResults: R[] = [];
    const errors: Array<{ chunkIndex: number; error: Error }> = [];

    let processedChunks = 0;
    let processedItems = 0;
    const memoryThresholdBytes = memoryThresholdMb * 1024 * 1024;

    if (concurrency <= 1) {
      // 순차 처리
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        try {
          const chunkResult = await this.executeWithRetry(
            () => processor(chunk, i),
            retries,
            retryDelayMs,
          );
          allResults.push(...chunkResult);
        } catch (err) {
          errors.push({ chunkIndex: i, error: err as Error });
          this.logger.warn(`Chunk ${i}/${totalChunks} failed: ${(err as Error).message}`);
        }

        processedChunks++;
        processedItems += chunk.length;

        this.checkMemoryAndGc(memoryThresholdBytes);
        onProgress?.(
          this.buildProgress(
            processedItems,
            data.length,
            processedChunks,
            totalChunks,
            startTime,
          ),
        );
      }
    } else {
      // 동시성 제한 병렬 처리 (세마포어 패턴)
      await this.runWithConcurrency(
        chunks,
        async (chunk, i) => {
          try {
            const chunkResult = await this.executeWithRetry(
              () => processor(chunk, i),
              retries,
              retryDelayMs,
            );
            allResults.push(...chunkResult);
          } catch (err) {
            errors.push({ chunkIndex: i, error: err as Error });
            this.logger.warn(`Chunk ${i}/${totalChunks} failed: ${(err as Error).message}`);
          } finally {
            processedChunks++;
            processedItems += chunk.length;

            this.checkMemoryAndGc(memoryThresholdBytes);
            onProgress?.(
              this.buildProgress(
                processedItems,
                data.length,
                processedChunks,
                totalChunks,
                startTime,
              ),
            );
          }
        },
        concurrency,
      );
    }

    const elapsedMs = Date.now() - startTime;
    const failedItems = errors.reduce((sum, e) => {
      return sum + (chunks[e.chunkIndex]?.length ?? 0);
    }, 0);

    this.logger.debug(
      `BatchProcessor completed: ${processedItems} items in ${elapsedMs}ms ` +
        `(${errors.length} chunk errors, ${failedItems} failed items)`,
    );

    return {
      results: allResults,
      errors,
      totalItems: data.length,
      processedItems: processedItems - failedItems,
      failedItems,
      elapsedMs,
    };
  }

  /**
   * 스트리밍 방식 처리 - 결과를 배열에 모으지 않고 즉시 콜백으로 전달합니다.
   * 매우 큰 데이터셋에서 메모리 피크를 낮출 수 있습니다.
   */
  static async processStream<T, R>(
    data: T[],
    processor: (chunk: T[], chunkIndex: number) => Promise<R[]>,
    onChunkResult: (results: R[], chunkIndex: number, progress: BatchProgress) => void | Promise<void>,
    options: BatchOptions = {},
  ): Promise<{ totalItems: number; processedChunks: number; elapsedMs: number }> {
    const { chunkSize = 100, memoryThresholdMb = 300, onProgress } = options;
    const chunks = this.splitIntoChunks(data, chunkSize);
    const startTime = Date.now();
    let processedChunks = 0;
    let processedItems = 0;

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const results = await processor(chunk, i);
      processedItems += chunk.length;
      processedChunks++;

      const progress = this.buildProgress(
        processedItems,
        data.length,
        processedChunks,
        chunks.length,
        startTime,
      );

      await onChunkResult(results, i, progress);
      onProgress?.(progress);

      // 메모리 체크
      const mem = process.memoryUsage();
      if (mem.heapUsed > memoryThresholdMb * 1024 * 1024) {
        this.tryGc();
      }
    }

    return {
      totalItems: data.length,
      processedChunks,
      elapsedMs: Date.now() - startTime,
    };
  }

  // ── 내부 유틸 ─────────────────────────────────────────────

  private static splitIntoChunks<T>(data: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < data.length; i += chunkSize) {
      chunks.push(data.slice(i, i + chunkSize));
    }
    return chunks;
  }

  private static async runWithConcurrency<T>(
    items: T[],
    task: (item: T, index: number) => Promise<void>,
    concurrency: number,
  ): Promise<void> {
    let index = 0;

    const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (index < items.length) {
        const current = index++;
        await task(items[current], current);
      }
    });

    await Promise.all(workers);
  }

  private static async executeWithRetry<R>(
    fn: () => Promise<R>,
    retries: number,
    delayMs: number,
  ): Promise<R> {
    let lastError: Error | undefined;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastError = err as Error;
        if (attempt < retries) {
          await new Promise((resolve) => setTimeout(resolve, delayMs * (attempt + 1)));
        }
      }
    }
    throw lastError;
  }

  private static buildProgress(
    processedItems: number,
    totalItems: number,
    processedChunks: number,
    totalChunks: number,
    startTime: number,
  ): BatchProgress {
    const elapsedMs = Date.now() - startTime;
    const percentComplete =
      totalItems > 0 ? parseFloat(((processedItems / totalItems) * 100).toFixed(1)) : 100;

    const itemsPerMs = processedItems > 0 ? processedItems / elapsedMs : 0;
    const remainingItems = totalItems - processedItems;
    const estimatedRemainingMs = itemsPerMs > 0 ? Math.round(remainingItems / itemsPerMs) : 0;

    const mem = process.memoryUsage();

    return {
      processedItems,
      totalItems,
      processedChunks,
      totalChunks,
      percentComplete,
      elapsedMs,
      estimatedRemainingMs,
      memoryUsageMb: Math.round(mem.heapUsed / 1024 / 1024),
    };
  }

  private static checkMemoryAndGc(thresholdBytes: number): void {
    const mem = process.memoryUsage();
    if (mem.heapUsed > thresholdBytes) {
      this.tryGc();
    }
  }

  private static tryGc(): void {
    if (typeof global.gc === 'function') {
      try {
        global.gc();
      } catch {
        // GC 실패는 무시
      }
    }
  }
}
