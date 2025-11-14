"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RateLimitGuard = void 0;
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const rate_limit_decorator_1 = require("../decorators/rate-limit.decorator");
const rateLimitService_1 = require("../../services/rateLimitService");
const DEFAULT_WINDOW_MS = 15 * 60 * 1000;
const DEFAULT_LIMIT = 5;
let RateLimitGuard = class RateLimitGuard {
    constructor(reflector, rateLimitService) {
        this.reflector = reflector;
        this.rateLimitService = rateLimitService;
    }
    canActivate(context) {
        const options = this.reflector.get(rate_limit_decorator_1.RATE_LIMIT_METADATA_KEY, context.getHandler()) ??
            this.reflector.get(rate_limit_decorator_1.RATE_LIMIT_METADATA_KEY, context.getClass());
        if (!options) {
            return true;
        }
        const request = context.switchToHttp().getRequest();
        const ip = request.ip ||
            request.headers['x-forwarded-for']?.toString().split(',')[0].trim() ||
            request.connection.remoteAddress ||
            'unknown';
        const limit = options.limit ?? DEFAULT_LIMIT;
        const windowMs = options.windowMs ?? DEFAULT_WINDOW_MS;
        const prefix = options.keyPrefix ??
            `${context.getClass().name}:${context.getHandler().name}`;
        const key = `${prefix}:${ip}`;
        const result = this.rateLimitService.consume(key, limit, windowMs);
        if (!result.allowed) {
            const retrySeconds = Math.ceil(result.retryAfterMs / 1000);
            throw new common_1.HttpException(`Too many attempts. Try again in ${retrySeconds}s`, common_1.HttpStatus.TOO_MANY_REQUESTS);
        }
        return true;
    }
};
exports.RateLimitGuard = RateLimitGuard;
exports.RateLimitGuard = RateLimitGuard = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [core_1.Reflector,
        rateLimitService_1.RateLimitService])
], RateLimitGuard);
