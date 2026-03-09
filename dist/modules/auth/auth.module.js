"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthModule = void 0;
const common_1 = require("@nestjs/common");
const jwt_1 = require("@nestjs/jwt");
const auth_controller_1 = require("./auth.controller");
const auth_service_1 = require("./auth.service");
const oauth_module_1 = require("../oauth/oauth.module");
const database_module_1 = require("../database/database.module");
const cacheService_1 = require("../../services/cacheService");
const enhanced_jwt_service_1 = require("../../services/enhanced-jwt.service");
const jwt_blacklist_service_1 = require("../../services/jwt-blacklist.service");
const env_1 = require("../../config/env");
let AuthModule = class AuthModule {
};
exports.AuthModule = AuthModule;
exports.AuthModule = AuthModule = __decorate([
    (0, common_1.Module)({
        imports: [
            // DatabaseModule이 TypeORM forRoot + forFeature(User) + UserRepository를 모두 제공합니다.
            // DataSource도 TypeOrmModule을 통해 자동으로 주입 가능합니다.
            database_module_1.DatabaseModule,
            (0, common_1.forwardRef)(() => oauth_module_1.OAuthModule),
            // JWT 모듈 등록 (Enhanced JWT 서비스용)
            jwt_1.JwtModule.register({
                secret: env_1.env.jwtSecret,
                signOptions: {
                    expiresIn: `${env_1.env.accessTokenTTL}s`,
                    issuer: 'sseudam-backend',
                    audience: 'sseudam-app',
                },
            }),
        ],
        controllers: [
            auth_controller_1.AuthController,
        ],
        providers: [
            auth_service_1.AuthService,
            cacheService_1.CacheService,
            // JWT Blacklist System
            enhanced_jwt_service_1.EnhancedJwtService,
            jwt_blacklist_service_1.JwtBlacklistService,
        ],
        exports: [
            auth_service_1.AuthService,
            cacheService_1.CacheService,
            // Enhanced JWT 서비스들도 export하여 다른 모듈에서 사용 가능
            enhanced_jwt_service_1.EnhancedJwtService,
            jwt_blacklist_service_1.JwtBlacklistService,
        ],
    })
], AuthModule);
