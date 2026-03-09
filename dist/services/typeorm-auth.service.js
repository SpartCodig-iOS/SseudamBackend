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
var TypeOrmAuthService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.TypeOrmAuthService = void 0;
const common_1 = require("@nestjs/common");
const user_repository_1 = require("../repositories/user.repository");
const bcrypt = __importStar(require("bcryptjs"));
/**
 * TypeORM을 사용한 새로운 인증 서비스
 * 기존 AuthService와 병행 사용하면서 점진적으로 마이그레이션
 */
let TypeOrmAuthService = TypeOrmAuthService_1 = class TypeOrmAuthService {
    constructor(userRepository) {
        this.userRepository = userRepository;
        this.logger = new common_1.Logger(TypeOrmAuthService_1.name);
    }
    /**
     * 사용자 인증 (TypeORM 버전)
     * 기존 authenticateUserDirect()를 대체
     */
    async authenticateUser(identifier, password) {
        const startTime = Date.now();
        try {
            // 이메일/유저네임으로 사용자 찾기
            const user = await this.userRepository.findByEmailOrUsername(identifier);
            if (!user) {
                this.logger.debug(`User not found: ${identifier}`);
                return null;
            }
            // 비밀번호 확인
            const isValidPassword = await bcrypt.compare(password, user.password_hash);
            if (!isValidPassword) {
                this.logger.debug(`Invalid password for user: ${identifier}`);
                return null;
            }
            const duration = Date.now() - startTime;
            this.logger.debug(`TypeORM auth completed in ${duration}ms for ${identifier}`);
            return user;
        }
        catch (error) {
            this.logger.error(`Authentication failed for ${identifier}:`, error);
            return null;
        }
    }
    /**
     * 사용자 조회 by ID (TypeORM 버전)
     */
    async getUserById(userId) {
        try {
            return await this.userRepository.findById(userId);
        }
        catch (error) {
            this.logger.error(`Failed to get user by ID ${userId}:`, error);
            return null;
        }
    }
    /**
     * 사용자 존재 여부 확인 (TypeORM 버전)
     */
    async userExists(identifier) {
        try {
            const user = await this.userRepository.findByEmailOrUsername(identifier);
            return user !== null;
        }
        catch (error) {
            this.logger.error(`Failed to check user existence for ${identifier}:`, error);
            return false;
        }
    }
    /**
     * 이메일 중복 체크 (TypeORM 버전)
     */
    async isEmailTaken(email, excludeUserId) {
        try {
            return await this.userRepository.isEmailTaken(email, excludeUserId);
        }
        catch (error) {
            this.logger.error(`Failed to check email availability for ${email}:`, error);
            return true; // 안전한 기본값: 중복으로 가정
        }
    }
    /**
     * 유저네임 중복 체크 (TypeORM 버전)
     */
    async isUsernameTaken(username, excludeUserId) {
        try {
            return await this.userRepository.isUsernameTaken(username, excludeUserId);
        }
        catch (error) {
            this.logger.error(`Failed to check username availability for ${username}:`, error);
            return true; // 안전한 기본값: 중복으로 가정
        }
    }
    /**
     * 사용자 정보 업데이트 (TypeORM 버전)
     */
    async updateUser(userId, updateData) {
        try {
            return await this.userRepository.update(userId, updateData);
        }
        catch (error) {
            this.logger.error(`Failed to update user ${userId}:`, error);
            return null;
        }
    }
    /**
     * 비밀번호 업데이트 (TypeORM 버전)
     */
    async updatePassword(userId, newPassword) {
        try {
            const passwordHash = await bcrypt.hash(newPassword, 10);
            const updated = await this.userRepository.update(userId, {
                password_hash: passwordHash
            });
            return updated !== null;
        }
        catch (error) {
            this.logger.error(`Failed to update password for user ${userId}:`, error);
            return false;
        }
    }
    /**
     * 사용자 삭제 (TypeORM 버전)
     */
    async deleteUser(userId) {
        try {
            return await this.userRepository.delete(userId);
        }
        catch (error) {
            this.logger.error(`Failed to delete user ${userId}:`, error);
            return false;
        }
    }
    /**
     * 사용자 검색 (TypeORM 버전)
     */
    async searchUsers(searchTerm, limit = 10) {
        try {
            return await this.userRepository.searchUsers(searchTerm, limit);
        }
        catch (error) {
            this.logger.error(`Failed to search users with term ${searchTerm}:`, error);
            return [];
        }
    }
};
exports.TypeOrmAuthService = TypeOrmAuthService;
exports.TypeOrmAuthService = TypeOrmAuthService = TypeOrmAuthService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [user_repository_1.UserRepository])
], TypeOrmAuthService);
