"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GatewayModule = void 0;
const common_1 = require("@nestjs/common");
const jwt_1 = require("@nestjs/jwt");
const gateway_controller_1 = require("./gateway.controller");
const gateway_service_1 = require("./gateway.service");
const gateway_middleware_1 = require("./gateway.middleware");
const enhanced_jwt_service_1 = require("../../services/enhanced-jwt.service");
const jwt_blacklist_service_1 = require("../../services/jwt-blacklist.service");
const rateLimitService_1 = require("../../services/rateLimitService");
const cacheService_1 = require("../../services/cacheService");
const env_1 = require("../../config/env");
let GatewayModule = class GatewayModule {
};
exports.GatewayModule = GatewayModule;
exports.GatewayModule = GatewayModule = __decorate([
    (0, common_1.Module)({
        imports: [
            jwt_1.JwtModule.register({
                secret: env_1.env.jwtSecret,
                signOptions: {
                    expiresIn: `${env_1.env.accessTokenTTL}s`,
                    issuer: 'sseudam-backend',
                    audience: 'sseudam-app',
                },
            }),
        ],
        controllers: [gateway_controller_1.GatewayController],
        providers: [
            gateway_service_1.GatewayService,
            gateway_middleware_1.GatewayMiddleware,
            enhanced_jwt_service_1.EnhancedJwtService,
            jwt_blacklist_service_1.JwtBlacklistService,
            rateLimitService_1.RateLimitService,
            cacheService_1.CacheService,
        ],
        exports: [gateway_service_1.GatewayService, gateway_middleware_1.GatewayMiddleware],
    })
], GatewayModule);
