"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const rateLimitService_1 = require("../services/rateLimitService");
(0, node_test_1.default)('RateLimitService allows requests within the limit', () => {
    const service = new rateLimitService_1.RateLimitService();
    const key = 'rate-limit:test';
    const windowMs = 1000;
    const result1 = service.consume(key, 2, windowMs);
    const result2 = service.consume(key, 2, windowMs);
    strict_1.default.ok(result1.allowed);
    strict_1.default.ok(result2.allowed);
    strict_1.default.equal(result2.remaining, 0);
});
(0, node_test_1.default)('RateLimitService blocks requests over the limit', () => {
    const service = new rateLimitService_1.RateLimitService();
    const key = 'rate-limit:block';
    const windowMs = 1000;
    service.consume(key, 1, windowMs);
    const result = service.consume(key, 1, windowMs);
    strict_1.default.equal(result.allowed, false);
    strict_1.default.ok(result.retryAfterMs > 0);
});
(0, node_test_1.default)('RateLimitService resets counts after the window', async () => {
    const service = new rateLimitService_1.RateLimitService();
    const key = 'rate-limit:reset';
    const windowMs = 50;
    service.consume(key, 1, windowMs);
    const blocked = service.consume(key, 1, windowMs);
    strict_1.default.equal(blocked.allowed, false);
    await new Promise((resolve) => setTimeout(resolve, windowMs + 10));
    const afterWindow = service.consume(key, 1, windowMs);
    strict_1.default.equal(afterWindow.allowed, true);
});
