"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var AnalyticsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AnalyticsService = void 0;
const common_1 = require("@nestjs/common");
let AnalyticsService = AnalyticsService_1 = class AnalyticsService {
    constructor() {
        this.logger = new common_1.Logger(AnalyticsService_1.name);
        this.measurementId = process.env.GA_MEASUREMENT_ID || process.env.GOOGLE_MEASUREMENT_ID || 'G-R6FLPEDGVE';
        this.apiSecret = process.env.GA_API_SECRET || process.env.GOOGLE_MEASUREMENT_API_SECRET;
    }
    get enabled() {
        return Boolean(this.measurementId && this.apiSecret);
    }
    async trackEvent(name, params = {}, options) {
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
        }
        catch (error) {
            this.logger.warn('Failed to send analytics event', {
                name,
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }
};
exports.AnalyticsService = AnalyticsService;
exports.AnalyticsService = AnalyticsService = AnalyticsService_1 = __decorate([
    (0, common_1.Injectable)()
], AnalyticsService);
