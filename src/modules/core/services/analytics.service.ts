import { Injectable, Logger } from '@nestjs/common';

type EventParams = Record<string, string | number | boolean | null | undefined>;

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);
  private readonly measurementId = process.env.GA_MEASUREMENT_ID || process.env.GOOGLE_MEASUREMENT_ID || 'G-R6FLPEDGVE';
  private readonly apiSecret = process.env.GA_API_SECRET || process.env.GOOGLE_MEASUREMENT_API_SECRET;

  private get enabled(): boolean {
    return Boolean(this.measurementId && this.apiSecret);
  }

  async trackEvent(
    name: string,
    params: EventParams = {},
    options?: { userId?: string; clientId?: string },
  ): Promise<void> {
    if (!this.enabled) {
      // Analytics 비활성화 시 무시
      return;
    }

    const url = `https://www.google-analytics.com/mp/collect?measurement_id=${this.measurementId}&api_secret=${this.apiSecret}`;
    const payload = {
      client_id: options?.clientId || options?.userId || 'server',
      user_id: options?.userId,
      events: [
        {
          name,
          params,
        },
      ],
    };

    try {
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (error) {
      this.logger.warn('Failed to send analytics event', {
        name,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
