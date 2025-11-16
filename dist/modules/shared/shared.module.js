"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SharedModule = void 0;
const common_1 = require("@nestjs/common");
const auth_guard_1 = require("../../common/guards/auth.guard");
const rate_limit_guard_1 = require("../../common/guards/rate-limit.guard");
const jwtService_1 = require("../../services/jwtService");
const optimized_jwt_service_1 = require("../../services/optimized-jwt.service");
const supabaseService_1 = require("../../services/supabaseService");
const sessionService_1 = require("../../services/sessionService");
const rateLimitService_1 = require("../../services/rateLimitService");
const smart_cache_service_1 = require("../../services/smart-cache.service");
const cacheService_1 = require("../../services/cacheService");
const optimized_oauth_service_1 = require("../oauth/optimized-oauth.service");
const optimized_delete_service_1 = require("../auth/optimized-delete.service");
const social_auth_service_1 = require("../oauth/social-auth.service");
const auth_service_1 = require("../auth/auth.service");
let SharedModule = class SharedModule {
};
exports.SharedModule = SharedModule;
exports.SharedModule = SharedModule = __decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({
        providers: [
            cacheService_1.CacheService,
            supabaseService_1.SupabaseService,
            jwtService_1.JwtTokenService,
            optimized_jwt_service_1.OptimizedJwtTokenService,
            smart_cache_service_1.SmartCacheService,
            auth_service_1.AuthService,
            social_auth_service_1.SocialAuthService,
            optimized_oauth_service_1.OptimizedOAuthService,
            optimized_delete_service_1.OptimizedDeleteService,
            sessionService_1.SessionService,
            rateLimitService_1.RateLimitService,
            auth_guard_1.AuthGuard,
            rate_limit_guard_1.RateLimitGuard,
        ],
        exports: [
            cacheService_1.CacheService,
            supabaseService_1.SupabaseService,
            jwtService_1.JwtTokenService,
            optimized_jwt_service_1.OptimizedJwtTokenService,
            smart_cache_service_1.SmartCacheService,
            auth_service_1.AuthService,
            social_auth_service_1.SocialAuthService,
            optimized_oauth_service_1.OptimizedOAuthService,
            optimized_delete_service_1.OptimizedDeleteService,
            sessionService_1.SessionService,
            rateLimitService_1.RateLimitService,
            auth_guard_1.AuthGuard,
            rate_limit_guard_1.RateLimitGuard,
        ],
    })
], SharedModule);
