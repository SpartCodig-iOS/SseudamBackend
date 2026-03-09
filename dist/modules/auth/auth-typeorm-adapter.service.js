"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var AuthTypeOrmAdapter_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthTypeOrmAdapter = void 0;
const common_1 = require("@nestjs/common");
const user_repository_1 = require("../../repositories/user.repository");
const bcrypt = __importStar(require("bcryptjs"));
/**
 * @deprecated AuthService가 TypeORM으로 완전히 마이그레이션되어 이 어댑터는 더 이상 필요하지 않습니다.
 * 인증 로직은 AuthService와 UserRepository를 직접 사용하세요.
 *
 * 이 파일은 하위 호환성을 위해 유지되며 다음 메이저 버전에서 제거됩니다.
 */
let AuthTypeOrmAdapter = AuthTypeOrmAdapter_1 = class AuthTypeOrmAdapter {
    constructor(userRepository) {
        this.userRepository = userRepository;
        this.logger = new common_1.Logger(AuthTypeOrmAdapter_1.name);
    }
    /**
     * TypeORM User를 기존 UserRecord 형식으로 변환
     */
    toUserRecord(user) {
        return {
            id: user.id,
            email: user.email,
            password_hash: user.password_hash,
            name: user.name,
            avatar_url: user.avatar_url,
            username: user.username,
            role: user.role,
            created_at: user.created_at,
            updated_at: user.updated_at,
        };
    }
    /**
     * 기존 authenticateUserDirect 로직을 TypeORM으로 대체
     * 기존 메서드와 동일한 시그니처 유지
     */
    async authenticateUserDirect(identifier, password, options = {}) {
        const authStartTime = Date.now();
        try {
            // TypeORM으로 사용자 찾기
            let user = null;
            if (options.lookupType === 'email' || identifier.includes('@')) {
                user = await this.userRepository.findByEmail(identifier.toLowerCase());
            }
            else if (options.lookupType === 'username') {
                user = await this.userRepository.findByUsername(identifier.toLowerCase());
            }
            else {
                user = await this.userRepository.findByEmailOrUsername(identifier.toLowerCase());
            }
            if (!user) {
                this.logger.debug(`User not found: ${identifier}`);
                return null;
            }
            // 비밀번호 검증
            const isValidPassword = await bcrypt.compare(password, user.password_hash);
            if (!isValidPassword) {
                this.logger.debug(`Invalid password for user: ${identifier}`);
                return null;
            }
            const authDuration = Date.now() - authStartTime;
            this.logger.debug(`TypeORM auth completed in ${authDuration}ms for ${identifier}`);
            // 기존 형식으로 변환하여 반환
            return this.toUserRecord(user);
        }
        catch (error) {
            this.logger.error(`TypeORM authentication failed for ${identifier}:`, error);
            return null;
        }
    }
    /**
     * 사용자 조회 (기존 형식으로 반환)
     */
    async getUserById(userId) {
        try {
            const user = await this.userRepository.findById(userId);
            return user ? this.toUserRecord(user) : null;
        }
        catch (error) {
            this.logger.error(`TypeORM getUserById failed for ${userId}:`, error);
            return null;
        }
    }
    /**
     * 이메일 존재 여부 확인
     */
    async checkEmailExists(email) {
        try {
            const user = await this.userRepository.findByEmail(email.toLowerCase());
            return user !== null;
        }
        catch (error) {
            this.logger.error(`TypeORM checkEmailExists failed for ${email}:`, error);
            return false;
        }
    }
    /**
     * 유저네임 존재 여부 확인
     */
    async checkUsernameExists(username) {
        try {
            const user = await this.userRepository.findByUsername(username.toLowerCase());
            return user !== null;
        }
        catch (error) {
            this.logger.error(`TypeORM checkUsernameExists failed for ${username}:`, error);
            return false;
        }
    }
    /**
     * 마지막 로그인 시간 업데이트
     */
    async markLastLogin(userId) {
        try {
            await this.userRepository.update(userId, {
                updated_at: new Date(),
            });
            this.logger.debug(`Updated last login for user: ${userId}`);
        }
        catch (error) {
            this.logger.warn(`Failed to update last login for user ${userId}:`, error);
        }
    }
    /**
     * 사용자 생성 (기존 signup 로직용)
     */
    async createUser(userData) {
        try {
            const user = await this.userRepository.create({
                id: userData.id,
                email: userData.email,
                password_hash: userData.password_hash,
                name: userData.name || null,
                username: userData.username,
                role: userData.role || 'user',
                avatar_url: null,
            });
            return this.toUserRecord(user);
        }
        catch (error) {
            this.logger.error(`TypeORM createUser failed:`, error);
            throw error;
        }
    }
};
exports.AuthTypeOrmAdapter = AuthTypeOrmAdapter;
exports.AuthTypeOrmAdapter = AuthTypeOrmAdapter = AuthTypeOrmAdapter_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [user_repository_1.UserRepository])
], AuthTypeOrmAdapter);
