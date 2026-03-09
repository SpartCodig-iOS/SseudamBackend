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
var UserService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserService = void 0;
const common_1 = require("@nestjs/common");
const user_repository_1 = require("../../repositories/user.repository");
const bcrypt = __importStar(require("bcryptjs"));
let UserService = UserService_1 = class UserService {
    constructor(userRepository) {
        this.userRepository = userRepository;
        this.logger = new common_1.Logger(UserService_1.name);
    }
    /**
     * 새로운 사용자 생성
     */
    async createUser(dto) {
        const { email, password, name, username, role = 'user' } = dto;
        // 이메일과 유저네임 중복 체크
        const emailExists = await this.userRepository.isEmailTaken(email);
        if (emailExists) {
            throw new common_1.ConflictException('Email already exists');
        }
        const usernameExists = await this.userRepository.isUsernameTaken(username);
        if (usernameExists) {
            throw new common_1.ConflictException('Username already exists');
        }
        // 비밀번호 해싱
        const password_hash = await bcrypt.hash(password, 10);
        const newUser = await this.userRepository.create({
            email: email.toLowerCase(),
            password_hash,
            name: name || null,
            username: username.toLowerCase(),
            role,
            avatar_url: null,
        });
        this.logger.log(`User created: ${newUser.email} (${newUser.id})`);
        return newUser;
    }
    /**
     * ID로 사용자 조회
     */
    async findById(id) {
        const user = await this.userRepository.findById(id);
        if (!user) {
            throw new common_1.NotFoundException('User not found');
        }
        return user;
    }
    /**
     * 이메일로 사용자 조회
     */
    async findByEmail(email) {
        return this.userRepository.findByEmail(email.toLowerCase());
    }
    /**
     * 유저네임으로 사용자 조회
     */
    async findByUsername(username) {
        return this.userRepository.findByUsername(username.toLowerCase());
    }
    /**
     * 이메일 또는 유저네임으로 사용자 조회
     */
    async findByEmailOrUsername(identifier) {
        return this.userRepository.findByEmailOrUsername(identifier.toLowerCase());
    }
    /**
     * 사용자 정보 업데이트
     */
    async updateUser(id, dto) {
        const existingUser = await this.findById(id);
        // 유저네임 중복 체크 (현재 사용자 제외)
        if (dto.username) {
            const usernameExists = await this.userRepository.isUsernameTaken(dto.username, id);
            if (usernameExists) {
                throw new common_1.ConflictException('Username already exists');
            }
            dto.username = dto.username.toLowerCase();
        }
        const updatedUser = await this.userRepository.update(id, dto);
        if (!updatedUser) {
            throw new common_1.NotFoundException('User not found');
        }
        this.logger.log(`User updated: ${updatedUser.email} (${id})`);
        return updatedUser;
    }
    /**
     * 사용자 삭제
     */
    async deleteUser(id) {
        const user = await this.findById(id);
        const deleted = await this.userRepository.delete(id);
        if (!deleted) {
            throw new common_1.NotFoundException('User not found');
        }
        this.logger.log(`User deleted: ${user.email} (${id})`);
    }
    /**
     * 비밀번호 업데이트
     */
    async updatePassword(id, newPassword) {
        const password_hash = await bcrypt.hash(newPassword, 10);
        const updated = await this.userRepository.update(id, { password_hash });
        if (!updated) {
            throw new common_1.NotFoundException('User not found');
        }
        this.logger.log(`Password updated for user: ${id}`);
    }
    /**
     * 비밀번호 확인
     */
    async verifyPassword(user, password) {
        return bcrypt.compare(password, user.password_hash);
    }
    /**
     * 사용자 검색
     */
    async searchUsers(searchTerm, limit = 10) {
        return this.userRepository.searchUsers(searchTerm, limit);
    }
    /**
     * 사용자 통계 조회
     */
    async getUserStats(userId) {
        return this.userRepository.getUserStats(userId);
    }
    /**
     * 여러 사용자 ID로 사용자 정보 조회
     */
    async findUsersByIds(userIds) {
        return this.userRepository.findUsersById(userIds);
    }
    /**
     * 사용자 목록 조회 (페이지네이션)
     */
    async findUsers(page = 1, limit = 20, search) {
        const skip = (page - 1) * limit;
        let whereCondition = {};
        if (search) {
            // TypeORM에서는 Like, ILike 등의 조건을 사용
            // 이는 Repository에서 구현할 수도 있습니다
        }
        const [users, total] = await this.userRepository.findAndCount({
            skip,
            take: limit,
            order: { created_at: 'DESC' },
        });
        return {
            users,
            total,
            page,
            limit,
        };
    }
    /**
     * 활성 사용자 수 조회
     */
    async getActiveUserCount() {
        // 여기서는 간단히 전체 사용자 수를 반환
        // 실제로는 최근 활동 기준으로 필터링할 수 있습니다
        return this.userRepository.count();
    }
    /**
     * 사용자 역할 업데이트
     */
    async updateUserRole(id, role) {
        return this.updateUser(id, { role });
    }
};
exports.UserService = UserService;
exports.UserService = UserService = UserService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [user_repository_1.UserRepository])
], UserService);
