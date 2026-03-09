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
var EnhancedAuthService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.EnhancedAuthService = void 0;
const common_1 = require("@nestjs/common");
const auth_service_1 = require("./auth.service");
const auth_typeorm_adapter_service_1 = require("./auth-typeorm-adapter.service");
/**
 * @deprecated AuthService가 TypeORM으로 완전히 마이그레이션되어 이 서비스는 더 이상 사용되지 않습니다.
 * 모든 인증 로직은 AuthService를 직접 사용하세요.
 *
 * 이 파일은 하위 호환성을 위해 유지되며 다음 메이저 버전에서 제거됩니다.
 */
let EnhancedAuthService = EnhancedAuthService_1 = class EnhancedAuthService {
    constructor(originalAuthService, typeormAdapter) {
        this.originalAuthService = originalAuthService;
        this.typeormAdapter = typeormAdapter;
        this.logger = new common_1.Logger(EnhancedAuthService_1.name);
        // 환경 변수로 TypeORM 사용 여부 결정
        this.useTypeORM = process.env.USE_TYPEORM_AUTH === 'true';
        this.logger.log(`Enhanced Auth Service initialized with ${this.useTypeORM ? 'TypeORM' : 'PostgreSQL Pool'} backend`);
    }
    /**
     * 사용자 인증 (TypeORM/기존 방식 자동 선택)
     */
    async authenticateUserDirect(identifier, password, options = {}) {
        const method = this.useTypeORM ? 'TypeORM' : 'PostgreSQL Pool';
        this.logger.debug(`Authenticating user with ${method}: ${identifier}`);
        try {
            if (this.useTypeORM) {
                return await this.typeormAdapter.authenticateUserDirect(identifier, password, options);
            }
            else {
                return await this.originalAuthService.authenticateUserDirect(identifier, password, options);
            }
        }
        catch (error) {
            this.logger.error(`Authentication failed with ${method}:`, error);
            // TypeORM 실패 시 기존 방식으로 폴백
            if (this.useTypeORM) {
                this.logger.warn('TypeORM authentication failed, falling back to PostgreSQL Pool');
                try {
                    return await this.originalAuthService.authenticateUserDirect(identifier, password, options);
                }
                catch (fallbackError) {
                    this.logger.error('Fallback authentication also failed:', fallbackError);
                    return null;
                }
            }
            return null;
        }
    }
    /**
     * 로그인 (향상된 버전)
     */
    async login(input) {
        const startTime = Date.now();
        const identifier = input.identifier.trim().toLowerCase();
        if (!identifier || !input.password) {
            throw new Error('Invalid credentials');
        }
        // 새로운 인증 방식 사용
        const user = await this.authenticateUserDirect(identifier, input.password, {
            lookupType: identifier.includes('@') ? 'email' : 'username',
        });
        if (!user) {
            throw new Error('Invalid credentials');
        }
        // 나머지는 기존 AuthService 로직 사용
        const result = await this.originalAuthService.createAuthSession(user, 'email');
        // 백그라운드 작업들
        setImmediate(() => {
            if (this.useTypeORM) {
                void this.typeormAdapter.markLastLogin(user.id);
            }
            else {
                void this.originalAuthService.markLastLogin(user.id);
            }
            void this.originalAuthService.warmAuthCaches(user);
        });
        const duration = Date.now() - startTime;
        this.logger.debug(`Enhanced login completed in ${duration}ms for ${identifier}`);
        return result;
    }
    /**
     * 사용자 존재 여부 확인 (향상된 버전)
     */
    async userExists(identifier) {
        try {
            if (this.useTypeORM) {
                if (identifier.includes('@')) {
                    return await this.typeormAdapter.checkEmailExists(identifier);
                }
                else {
                    return await this.typeormAdapter.checkUsernameExists(identifier);
                }
            }
            else {
                // 기존 방식 (pool 쿼리)
                const user = await this.originalAuthService.authenticateUserDirect(identifier, 'dummy_password');
                return false; // 실제로는 더 복잡한 로직이 필요
            }
        }
        catch (error) {
            this.logger.error(`userExists check failed for ${identifier}:`, error);
            return false;
        }
    }
    /**
     * 기존 메서드들은 그대로 위임
     */
    async signup(input) {
        return this.originalAuthService.signup(input);
    }
    async refresh(refreshToken) {
        return this.originalAuthService.refresh(refreshToken);
    }
    async deleteAccount(user, loginTypeHint) {
        return this.originalAuthService.deleteAccount(user, loginTypeHint);
    }
    async logoutBySessionId(sessionId) {
        return this.originalAuthService.logoutBySessionId(sessionId);
    }
    async socialLoginWithCode(codeOrToken, provider, options) {
        return this.originalAuthService.socialLoginWithCode(codeOrToken, provider, options);
    }
    /**
     * 성능 비교를 위한 벤치마크 메서드
     */
    async benchmarkAuth(identifier, password) {
        this.logger.debug(`Running authentication benchmark for ${identifier}`);
        // TypeORM 방식 측정
        const typeormStart = Date.now();
        const typeormUser = await this.typeormAdapter.authenticateUserDirect(identifier, password);
        const typeormTime = Date.now() - typeormStart;
        // PostgreSQL Pool 방식 측정
        const poolStart = Date.now();
        const poolUser = await this.originalAuthService.authenticateUserDirect(identifier, password);
        const poolTime = Date.now() - poolStart;
        const result = {
            typeormTime,
            poolTime,
            typeormResult: typeormUser !== null,
            poolResult: poolUser !== null,
        };
        this.logger.log(`Benchmark results for ${identifier}:`, result);
        return result;
    }
    /**
     * 현재 사용 중인 백엔드 타입 반환
     */
    getBackendType() {
        return this.useTypeORM ? 'TypeORM' : 'PostgreSQL Pool';
    }
    /**
     * TypeORM 사용 여부 런타임 토글 (테스트용)
     */
    toggleBackend() {
        // 이 방법은 테스트용으로만 사용하고, 실제로는 환경 변수로 제어해야 함
        this.useTypeORM = !this.useTypeORM;
        const newBackend = this.useTypeORM ? 'TypeORM' : 'PostgreSQL Pool';
        this.logger.warn(`⚠️ Backend toggled to: ${newBackend} (TEST MODE)`);
        return newBackend;
    }
};
exports.EnhancedAuthService = EnhancedAuthService;
exports.EnhancedAuthService = EnhancedAuthService = EnhancedAuthService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [auth_service_1.AuthService,
        auth_typeorm_adapter_service_1.AuthTypeOrmAdapter])
], EnhancedAuthService);
