"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RateLimitService = void 0;
const common_1 = require("@nestjs/common");
let RateLimitService = class RateLimitService {
    constructor() {
        this.buckets = new Map();
        this.CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
        this.lastCleanup = 0;
    }
    consume(key, limit, windowMs) {
        const now = Date.now();
        this.cleanup(now);
        let bucket = this.buckets.get(key);
        if (!bucket || bucket.resetAt <= now) {
            bucket = { count: 0, resetAt: now + windowMs };
            this.buckets.set(key, bucket);
        }
        if (bucket.count >= limit) {
            return {
                allowed: false,
                remaining: 0,
                resetAt: bucket.resetAt,
                retryAfterMs: Math.max(bucket.resetAt - now, 0),
            };
        }
        bucket.count += 1;
        return {
            allowed: true,
            remaining: Math.max(limit - bucket.count, 0),
            resetAt: bucket.resetAt,
            retryAfterMs: 0,
        };
    }
    cleanup(now) {
        if (now - this.lastCleanup < this.CLEANUP_INTERVAL_MS) {
            return;
        }
        this.lastCleanup = now;
        for (const [key, bucket] of this.buckets.entries()) {
            if (bucket.resetAt <= now) {
                this.buckets.delete(key);
            }
        }
    }
};
exports.RateLimitService = RateLimitService;
exports.RateLimitService = RateLimitService = __decorate([
    (0, common_1.Injectable)()
], RateLimitService);
