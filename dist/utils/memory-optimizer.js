"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MemoryOptimizer = void 0;
const common_1 = require("@nestjs/common");
class MemoryOptimizer {
    static initialize() {
        this.setupMemoryMonitoring();
        this.setupGCOptimization();
        this.setupProcessEventHandlers();
    }
    static setupMemoryMonitoring() {
        // Railway Sleep 모드 지원: 개발환경 또는 RAILWAY_SLEEP_MODE에서는 백그라운드 모니터링 완전 비활성화
        if (process.env.NODE_ENV !== 'production' || process.env.RAILWAY_SLEEP_MODE === 'true') {
            this.logger.log('Memory monitoring disabled for Railway Sleep mode support');
            return;
        }
        // 운영환경에서만 메모리 모니터링 (2시간마다)
        const monitoringInterval = 2 * 60 * 60 * 1000; // 2시간
        setInterval(() => {
            const memoryUsage = process.memoryUsage();
            const heapUsedMB = Math.round(memoryUsage.heapUsed / 1024 / 1024);
            const heapTotalMB = Math.round(memoryUsage.heapTotal / 1024 / 1024);
            const rssMB = Math.round(memoryUsage.rss / 1024 / 1024);
            // 메모리 사용량이 임계값을 초과하면 경고
            if (memoryUsage.heapUsed > this.memoryThreshold) {
                this.logger.warn(`High memory usage detected`, {
                    heapUsed: `${heapUsedMB}MB`,
                    heapTotal: `${heapTotalMB}MB`,
                    rss: `${rssMB}MB`,
                    external: `${Math.round(memoryUsage.external / 1024 / 1024)}MB`,
                    timestamp: new Date().toISOString(),
                });
                // 메모리 정리 시도
                this.performMemoryCleanup();
            }
            else {
                this.logger.debug(`Memory usage normal`, {
                    heapUsed: `${heapUsedMB}MB`,
                    heapTotal: `${heapTotalMB}MB`,
                    rss: `${rssMB}MB`,
                });
            }
        }, monitoringInterval);
    }
    static setupGCOptimization() {
        // Railway Sleep 모드 지원: 개발환경 또는 RAILWAY_SLEEP_MODE에서는 백그라운드 GC 완전 비활성화
        if (process.env.NODE_ENV !== 'production' || process.env.RAILWAY_SLEEP_MODE === 'true') {
            this.logger.log('Background GC disabled in development for Railway Sleep mode support');
            return;
        }
        // 운영환경에서만 강제 GC (2시간마다)
        if (typeof global.gc === 'function') {
            this.gcInterval = setInterval(() => {
                const beforeGC = process.memoryUsage();
                global.gc();
                const afterGC = process.memoryUsage();
                const heapFreed = beforeGC.heapUsed - afterGC.heapUsed;
                if (heapFreed > 1024 * 1024) { // 1MB 이상 해제된 경우에만 로그
                    this.logger.debug(`GC completed`, {
                        heapFreed: `${Math.round(heapFreed / 1024 / 1024)}MB`,
                        heapUsedAfter: `${Math.round(afterGC.heapUsed / 1024 / 1024)}MB`,
                    });
                }
            }, 2 * 60 * 60 * 1000); // 2시간
        }
    }
    static setupProcessEventHandlers() {
        // 메모리 부족 이벤트 처리
        process.on('warning', (warning) => {
            if (warning.name === 'MaxListenersExceededWarning') {
                this.logger.warn('Memory leak detected - MaxListeners exceeded', {
                    warning: warning.message,
                });
            }
        });
        // 프로세스 종료 시 정리
        process.on('SIGTERM', () => {
            this.cleanup();
        });
        process.on('SIGINT', () => {
            this.cleanup();
        });
    }
    static performMemoryCleanup() {
        try {
            // V8 힌트를 사용하여 메모리 정리
            if (typeof global.gc === 'function') {
                global.gc();
                this.logger.debug('Emergency GC performed');
            }
            // 큰 객체들을 null로 설정하여 GC 유도
            // 이는 특정 케이스에서만 사용해야 함
        }
        catch (error) {
            this.logger.error('Memory cleanup failed', {
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    }
    static getMemoryStats() {
        const memoryUsage = process.memoryUsage();
        return {
            heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024),
            heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024),
            external: Math.round(memoryUsage.external / 1024 / 1024),
            rss: Math.round(memoryUsage.rss / 1024 / 1024),
            timestamp: new Date().toISOString(),
        };
    }
    static setMemoryThreshold(thresholdMB) {
        this.memoryThreshold = thresholdMB * 1024 * 1024;
        this.logger.log(`Memory threshold set to ${thresholdMB}MB`);
    }
    static cleanup() {
        if (this.gcInterval) {
            clearInterval(this.gcInterval);
            this.gcInterval = null;
        }
        this.logger.log('Memory optimizer cleanup completed');
    }
    // 대량 데이터 처리를 위한 스트리밍 헬퍼
    static async processLargeDataset(data, processor, chunkSize = 100) {
        const results = [];
        for (let i = 0; i < data.length; i += chunkSize) {
            const chunk = data.slice(i, i + chunkSize);
            const chunkResults = await processor(chunk);
            results.push(...chunkResults);
            // 메모리 사용량이 높으면 잠시 대기
            const memoryUsage = process.memoryUsage();
            if (memoryUsage.heapUsed > this.memoryThreshold) {
                await new Promise(resolve => setTimeout(resolve, 100));
                if (typeof global.gc === 'function') {
                    global.gc();
                }
            }
        }
        return results;
    }
}
exports.MemoryOptimizer = MemoryOptimizer;
MemoryOptimizer.logger = new common_1.Logger(MemoryOptimizer.name);
MemoryOptimizer.gcInterval = null;
MemoryOptimizer.memoryThreshold = 4 * 1024 * 1024 * 1024; // 4GB
