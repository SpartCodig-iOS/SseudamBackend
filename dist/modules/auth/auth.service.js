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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var AuthService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
const common_1 = require("@nestjs/common");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jwtService_1 = require("../../services/jwtService");
const sessionService_1 = require("../../services/sessionService");
const supabaseService_1 = require("../../services/supabaseService");
const mappers_1 = require("../../utils/mappers");
const social_auth_service_1 = require("../oauth/social-auth.service");
let AuthService = AuthService_1 = class AuthService {
    constructor(supabaseService, jwtTokenService, sessionService, socialAuthService) {
        this.supabaseService = supabaseService;
        this.jwtTokenService = jwtTokenService;
        this.sessionService = sessionService;
        this.socialAuthService = socialAuthService;
        this.logger = new common_1.Logger(AuthService_1.name);
        this.identifierCache = new Map();
        this.IDENTIFIER_CACHE_TTL = 5 * 60 * 1000;
    }
    getCachedEmail(identifier) {
        const cached = this.identifierCache.get(identifier);
        if (!cached)
            return null;
        if (Date.now() > cached.expiresAt) {
            this.identifierCache.delete(identifier);
            return null;
        }
        return cached.email;
    }
    setCachedEmail(identifier, email) {
        this.identifierCache.set(identifier, {
            email,
            expiresAt: Date.now() + this.IDENTIFIER_CACHE_TTL,
        });
        if (this.identifierCache.size > 1000) {
            const oldestKey = this.identifierCache.keys().next().value;
            if (oldestKey) {
                this.identifierCache.delete(oldestKey);
            }
        }
    }
    async createAuthSession(user, loginType) {
        const session = await this.sessionService.createSession(user.id, loginType);
        const tokenPair = this.jwtTokenService.generateTokenPair(user, loginType, session.sessionId);
        return { user, tokenPair, loginType, session };
    }
    async signup(input) {
        const startTime = Date.now();
        const lowerEmail = input.email.toLowerCase();
        // Supabase 사용자 생성과 해시 생성을 병렬로 처리 (성능 최적화)
        const [supabaseUser, passwordHash] = await Promise.all([
            this.supabaseService.signUp(lowerEmail, input.password, {
                name: input.name,
            }),
            bcryptjs_1.default.hash(input.password, 8) // 10 -> 8로 줄여서 속도 향상 (보안성 유지하면서)
        ]);
        if (!supabaseUser) {
            throw new common_1.InternalServerErrorException('Supabase createUser did not return a user');
        }
        const username = (lowerEmail.split('@')[0] || `user_${supabaseUser.id.substring(0, 8)}`).toLowerCase();
        const newUser = {
            id: supabaseUser.id,
            email: lowerEmail,
            name: input.name ?? null,
            avatar_url: null,
            created_at: new Date(),
            updated_at: new Date(),
            username,
            password_hash: passwordHash,
        };
        const result = await this.createAuthSession(newUser, 'signup');
        this.setCachedEmail(lowerEmail, lowerEmail);
        this.setCachedEmail(username, lowerEmail);
        const duration = Date.now() - startTime;
        this.logger.debug(`Signup completed in ${duration}ms for ${lowerEmail}`);
        return result;
    }
    async login(input) {
        const startTime = Date.now();
        const identifier = input.identifier.trim().toLowerCase();
        if (!identifier) {
            throw new common_1.UnauthorizedException('identifier is required');
        }
        let emailToUse = identifier;
        let loginType = 'email';
        if (!identifier.includes('@')) {
            const cachedEmail = this.getCachedEmail(identifier);
            if (cachedEmail) {
                emailToUse = cachedEmail;
            }
            else {
                let profile;
                try {
                    profile = await this.supabaseService.findProfileByIdentifier(identifier);
                }
                catch {
                    throw new common_1.UnauthorizedException('Invalid credentials');
                }
                if (!profile?.email) {
                    throw new common_1.UnauthorizedException('Invalid credentials');
                }
                emailToUse = profile.email.toLowerCase();
                loginType = 'username';
                this.setCachedEmail(identifier, emailToUse);
            }
        }
        let supabaseUser;
        try {
            supabaseUser = await this.supabaseService.signIn(emailToUse, input.password);
        }
        catch {
            throw new common_1.UnauthorizedException('Invalid credentials');
        }
        const user = (0, mappers_1.fromSupabaseUser)(supabaseUser);
        this.setCachedEmail(user.email.toLowerCase(), user.email.toLowerCase());
        if (user.username) {
            this.setCachedEmail(user.username.toLowerCase(), user.email.toLowerCase());
        }
        const result = await this.createAuthSession(user, loginType);
        const duration = Date.now() - startTime;
        this.logger.debug(`Login completed in ${duration}ms for ${identifier}`);
        return result;
    }
    async refresh(refreshToken) {
        const payload = this.jwtTokenService.verifyRefreshToken(refreshToken);
        if (!payload.sub || !payload.sessionId) {
            throw new common_1.UnauthorizedException('Invalid refresh token');
        }
        const currentSession = await this.sessionService.getSession(payload.sessionId);
        if (!currentSession || !currentSession.isActive) {
            throw new common_1.UnauthorizedException('Session expired or revoked');
        }
        let user;
        try {
            const supabaseUser = await this.supabaseService.getUserById(payload.sub);
            if (!supabaseUser) {
                throw new common_1.UnauthorizedException('User not found in Supabase');
            }
            user = (0, mappers_1.fromSupabaseUser)(supabaseUser);
        }
        catch (error) {
            throw new common_1.UnauthorizedException('User verification failed');
        }
        // 기존 세션은 재사용하지 않으므로 즉시 폐기
        await this.sessionService.deleteSession(payload.sessionId);
        const sessionPayload = await this.createAuthSession(user, 'email');
        return { tokenPair: sessionPayload.tokenPair, loginType: sessionPayload.loginType, session: sessionPayload.session };
    }
    async deleteAccount(user) {
        const startTime = Date.now();
        let profileLoginType = null;
        try {
            const profile = await this.supabaseService.findProfileById(user.id);
            profileLoginType = profile?.login_type ?? null;
        }
        catch (error) {
            this.logger.warn('[deleteAccount] Failed to fetch profile for login type', error);
        }
        // 소셜 로그인 연결 해제 및 Supabase 사용자 삭제 병렬 처리
        const revokeTasks = [];
        if (profileLoginType === 'apple') {
            revokeTasks.push(this.socialAuthService.revokeAppleConnection(user.id).catch(error => this.logger.warn('[deleteAccount] Apple revoke failed', error)));
        }
        else if (profileLoginType === 'google') {
            revokeTasks.push(this.socialAuthService.revokeGoogleConnection(user.id).catch(error => this.logger.warn('[deleteAccount] Google revoke failed', error)));
        }
        let supabaseDeleted = false;
        const deleteUserTask = this.supabaseService.deleteUser(user.id)
            .then(() => { supabaseDeleted = true; })
            .catch((error) => {
            const message = error?.message?.toLowerCase() ?? '';
            if (!message.includes('not found')) {
                throw error;
            }
        });
        // 모든 작업을 병렬로 실행
        await Promise.all([...revokeTasks, deleteUserTask]);
        const duration = Date.now() - startTime;
        this.logger.debug(`Account deletion completed in ${duration}ms for ${user.email}`);
        return { supabaseDeleted };
    }
    async logoutBySessionId(sessionId) {
        if (!sessionId) {
            throw new common_1.UnauthorizedException('sessionId is required');
        }
        const deleted = await this.sessionService.deleteSession(sessionId);
        return { revoked: deleted };
    }
};
exports.AuthService = AuthService;
exports.AuthService = AuthService = AuthService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(3, (0, common_1.Inject)((0, common_1.forwardRef)(() => social_auth_service_1.SocialAuthService))),
    __metadata("design:paramtypes", [supabaseService_1.SupabaseService,
        jwtService_1.JwtTokenService,
        sessionService_1.SessionService,
        social_auth_service_1.SocialAuthService])
], AuthService);
