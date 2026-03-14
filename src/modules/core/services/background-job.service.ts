import { Injectable, Logger } from '@nestjs/common';

type JobHandler = () => Promise<unknown>;

interface Job {
  name: string;
  handler: JobHandler;
  retries: number;
  backoffMs: number;
}

@Injectable()
export class BackgroundJobService {
  private readonly logger = new Logger(BackgroundJobService.name);
  private readonly concurrency = 2;
  private active = 0;
  private queue: Job[] = [];

  enqueue(name: string, handler: JobHandler, options?: { retries?: number; backoffMs?: number }) {
    const job: Job = {
      name,
      handler,
      retries: options?.retries ?? 1,
      backoffMs: options?.backoffMs ?? 300,
    };
    this.queue.push(job);
    void this.processNext();
  }

  private async processNext(): Promise<void> {
    if (this.active >= this.concurrency || this.queue.length === 0) {
      return;
    }

    const job = this.queue.shift();
    if (!job) return;

    this.active += 1;
    try {
      await job.handler();
    } catch (error) {
      if (job.retries > 0) {
        this.logger.warn(`[${job.name}] retrying (${job.retries} left): ${error instanceof Error ? error.message : String(error)}`);
        setTimeout(() => {
          this.queue.push({ ...job, retries: job.retries - 1, backoffMs: job.backoffMs * 2 });
          void this.processNext();
        }, job.backoffMs);
      } else {
        this.logger.warn(`[${job.name}] failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    } finally {
      this.active -= 1;
      void this.processNext();
    }
  }
}
