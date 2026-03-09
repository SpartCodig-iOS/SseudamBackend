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
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserRepository = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const user_entity_1 = require("../entities/user.entity");
const base_repository_1 = require("./base.repository");
let UserRepository = class UserRepository extends base_repository_1.BaseRepository {
    constructor(userRepository) {
        super(userRepository);
    }
    async findByEmail(email) {
        return this.repository.findOne({
            where: { email },
        });
    }
    async findByUsername(username) {
        return this.repository.findOne({
            where: { username },
        });
    }
    async findByEmailOrUsername(identifier) {
        return this.repository.findOne({
            where: [
                { email: identifier },
                { username: identifier },
            ],
        });
    }
    async isEmailTaken(email, excludeUserId) {
        const query = this.repository.createQueryBuilder('user')
            .where('user.email = :email', { email });
        if (excludeUserId) {
            query.andWhere('user.id != :id', { id: excludeUserId });
        }
        const count = await query.getCount();
        return count > 0;
    }
    async isUsernameTaken(username, excludeUserId) {
        const query = this.repository.createQueryBuilder('user')
            .where('user.username = :username', { username });
        if (excludeUserId) {
            query.andWhere('user.id != :id', { id: excludeUserId });
        }
        const count = await query.getCount();
        return count > 0;
    }
    async findUsersById(userIds) {
        if (userIds.length === 0)
            return [];
        return this.repository.findByIds(userIds);
    }
    async searchUsers(searchTerm, limit = 10) {
        return this.repository.createQueryBuilder('user')
            .where('user.name ILIKE :term OR user.username ILIKE :term OR user.email ILIKE :term', {
            term: `%${searchTerm}%`
        })
            .limit(limit)
            .getMany();
    }
    async getUserStats(userId) {
        const result = await this.repository.createQueryBuilder('user')
            .leftJoin('user.travels', 'travel')
            .leftJoin('user.expenses', 'expense')
            .select('COUNT(DISTINCT travel.id)', 'totalTravels')
            .addSelect('COUNT(DISTINCT expense.id)', 'totalExpenses')
            .where('user.id = :userId', { userId })
            .getRawOne();
        return {
            totalTravels: parseInt(result.totalTravels) || 0,
            totalExpenses: parseInt(result.totalExpenses) || 0,
        };
    }
    /**
     * 마지막 로그인 시간 갱신 - updated_at 컬럼만 NOW()로 업데이트합니다.
     * 불필요한 SELECT를 제거해 성능을 최적화합니다.
     */
    async markLastLogin(userId) {
        await this.repository
            .createQueryBuilder()
            .update(user_entity_1.User)
            .set({ updated_at: () => 'NOW()' })
            .where('id = :userId', { userId })
            .execute();
    }
    /**
     * 특정 사용자의 소셜 로그인 타입과 refresh token을 한 번에 조회합니다.
     * deleteAccount 시 소셜 연결 해제에 사용됩니다.
     */
    async findSocialProfileInfo(userId) {
        const user = await this.repository
            .createQueryBuilder('user')
            .select([
            'user.login_type',
            'user.apple_refresh_token',
            'user.google_refresh_token',
            'user.avatar_url',
        ])
            .where('user.id = :userId', { userId })
            .getOne();
        if (!user)
            return null;
        return {
            login_type: user.login_type,
            apple_refresh_token: user.apple_refresh_token,
            google_refresh_token: user.google_refresh_token,
            avatar_url: user.avatar_url,
        };
    }
    /**
     * TypeORM EntityManager를 사용한 계정 삭제 트랜잭션 내부 실행.
     * 외부에서 EntityManager(트랜잭션 컨텍스트)를 주입받아 사용합니다.
     *
     * 삭제 순서 (FK 제약 준수):
     * 1. travel_expense_participants (expense FK)
     * 2. travel_expenses (travel FK, payer FK)
     * 3. travel_members (user FK)
     * 4. user_sessions (user FK)
     * 5. profiles (최종 삭제)
     *
     * travel_invites, travel_settlements 는 엔티티가 없어 native query로 처리합니다.
     */
    async deleteAccountData(userId, manager) {
        // 1. travel_expense_participants: member_id 또는 payer expense 참조 제거
        await manager.query(`DELETE FROM travel_expense_participants
       WHERE member_id = $1
          OR expense_id IN (
            SELECT id FROM travel_expenses WHERE payer_id = $1
          )`, [userId]);
        // 2. travel_expenses: payer 또는 author 기준 삭제
        await manager.query(`DELETE FROM travel_expenses WHERE payer_id = $1 OR author_id = $1`, [userId]);
        // 3. travel_settlements: from_member 또는 to_member 기준 삭제 (엔티티 미존재)
        await manager.query(`DELETE FROM travel_settlements WHERE from_member = $1 OR to_member = $1`, [userId]);
        // 4. travel_invites: created_by 기준 삭제 (엔티티 미존재)
        await manager.query(`DELETE FROM travel_invites WHERE created_by = $1`, [userId]);
        // 5. travel_members: user_id 기준 삭제
        await manager.query(`DELETE FROM travel_members WHERE user_id = $1`, [userId]);
        // 6. user_sessions: user_id 기준 삭제 (엔티티 미존재)
        await manager.query(`DELETE FROM user_sessions WHERE user_id = $1`, [userId]);
        // 7. profiles 본체 삭제
        await manager.delete(user_entity_1.User, { id: userId });
    }
};
exports.UserRepository = UserRepository;
exports.UserRepository = UserRepository = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(user_entity_1.User)),
    __metadata("design:paramtypes", [typeorm_2.Repository])
], UserRepository);
