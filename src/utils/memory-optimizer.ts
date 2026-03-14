export class MemoryOptimizer {
  private static instance: MemoryOptimizer;

  static getInstance(): MemoryOptimizer {
    if (!this.instance) {
      this.instance = new MemoryOptimizer();
    }
    return this.instance;
  }

  optimize(): void {
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }
  }

  getMemoryUsage() {
    return process.memoryUsage();
  }

  logMemoryUsage(label: string = 'Memory Usage') {
    const usage = this.getMemoryUsage();
    console.log(`${label}:`, {
      rss: `${Math.round(usage.rss / 1024 / 1024 * 100) / 100} MB`,
      heapTotal: `${Math.round(usage.heapTotal / 1024 / 1024 * 100) / 100} MB`,
      heapUsed: `${Math.round(usage.heapUsed / 1024 / 1024 * 100) / 100} MB`,
      external: `${Math.round(usage.external / 1024 / 1024 * 100) / 100} MB`,
    });
  }
}

export const memoryOptimizer = MemoryOptimizer.getInstance();