import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { env } from '../config/env';

@Injectable()
export class KeepAliveService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KeepAliveService.name);
  private heartbeat: NodeJS.Timeout | null = null;
  private readonly intervalMs = 55_000;

  onModuleInit() {
    if (!env.appBaseUrl) {
      this.logger.warn('App base URL missing, keep-alive ping disabled');
      return;
    }

    this.triggerPing();
    this.heartbeat = setInterval(() => this.triggerPing(), this.intervalMs);
  }

  onModuleDestroy() {
    if (this.heartbeat) {
      clearInterval(this.heartbeat);
      this.heartbeat = null;
    }
  }

  private async triggerPing() {
    const target = `${env.appBaseUrl.replace(/\/$/, '')}/health?keepalive=1`;
    try {
      await fetch(target, { method: 'GET' });
    } catch (error) {
      this.logger.debug(`KeepAlive ping failed (${target}): ${(error as Error).message}`);
    }
  }
}
