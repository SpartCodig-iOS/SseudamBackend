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
exports.TravelRepository = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const travel_entity_1 = require("../entities/travel.entity");
const base_repository_1 = require("./base.repository");
let TravelRepository = class TravelRepository extends base_repository_1.BaseRepository {
    constructor(travelRepository) {
        super(travelRepository);
    }
    async findByInviteCode(inviteCode) {
        return this.repository.findOne({
            where: { inviteCode },
            relations: ['user', 'members', 'members.user'],
        });
    }
    async findTravelsByUser(userId, options = {}) {
        const { status, page = 1, limit = 20, search, sortBy = 'created_at', sortOrder = 'DESC', } = options;
        const queryBuilder = this.repository.createQueryBuilder('travel')
            .leftJoinAndSelect('travel.user', 'owner')
            .leftJoinAndSelect('travel.members', 'members')
            .leftJoinAndSelect('members.user', 'memberUser')
            .where('(travel.ownerId = :userId OR members.userId = :userId)', { userId });
        if (status) {
            queryBuilder.andWhere('travel.status = :status', { status });
        }
        if (search) {
            queryBuilder.andWhere('(travel.title ILIKE :search OR travel.countryNameKr ILIKE :search)', { search: `%${search}%` });
        }
        queryBuilder
            .orderBy(`travel.${sortBy}`, sortOrder)
            .skip((page - 1) * limit)
            .take(limit);
        return queryBuilder.getManyAndCount();
    }
    async findTravelWithDetails(travelId, userId) {
        const queryBuilder = this.repository.createQueryBuilder('travel')
            .leftJoinAndSelect('travel.user', 'owner')
            .leftJoinAndSelect('travel.members', 'members')
            .leftJoinAndSelect('members.user', 'memberUser')
            .leftJoinAndSelect('travel.expenses', 'expenses')
            .leftJoinAndSelect('expenses.user', 'expenseAuthor')
            .leftJoinAndSelect('expenses.payer', 'expensePayer')
            .leftJoinAndSelect('expenses.participants', 'participants')
            .leftJoinAndSelect('participants.user', 'participantUser')
            .where('travel.id = :travelId', { travelId });
        if (userId) {
            queryBuilder.andWhere('(travel.ownerId = :userId OR members.userId = :userId)', { userId });
        }
        return queryBuilder.getOne();
    }
    async generateUniqueInviteCode() {
        let code;
        let attempts = 0;
        const maxAttempts = 10;
        do {
            code = Math.random().toString(36).substring(2, 10); // 8자리 랜덤 코드
            attempts++;
            if (attempts > maxAttempts) {
                throw new Error('Failed to generate unique invite code');
            }
        } while (await this.exists({ inviteCode: code }));
        return code;
    }
    async getTravelStats(travelId) {
        const result = await this.repository.createQueryBuilder('travel')
            .leftJoin('travel.expenses', 'expense')
            .leftJoin('travel.members', 'member')
            .select('COALESCE(SUM(expense.convertedAmount), 0)', 'totalExpenses')
            .addSelect('COUNT(DISTINCT expense.id)', 'expenseCount')
            .addSelect('COUNT(DISTINCT member.id)', 'memberCount')
            .where('travel.id = :travelId', { travelId })
            .getRawOne();
        return {
            totalExpenses: parseFloat(result.totalExpenses) || 0,
            expenseCount: parseInt(result.expenseCount) || 0,
            memberCount: parseInt(result.memberCount) || 0,
        };
    }
    async findUpcomingTravels(userId, days = 7) {
        const futureDate = new Date();
        futureDate.setDate(futureDate.getDate() + days);
        return this.repository.createQueryBuilder('travel')
            .leftJoinAndSelect('travel.members', 'members')
            .where('(travel.ownerId = :userId OR members.userId = :userId)', { userId })
            .andWhere('travel.startDate >= CURRENT_DATE')
            .andWhere('travel.startDate <= :futureDate', {
            futureDate: futureDate.toISOString().split('T')[0]
        })
            .andWhere('travel.status IN (:...statuses)', {
            statuses: [travel_entity_1.TravelStatus.PLANNING, travel_entity_1.TravelStatus.ACTIVE]
        })
            .orderBy('travel.startDate', 'ASC')
            .getMany();
    }
    async findActiveTravels(userId) {
        const today = new Date().toISOString().split('T')[0];
        return this.repository.createQueryBuilder('travel')
            .leftJoinAndSelect('travel.members', 'members')
            .where('(travel.ownerId = :userId OR members.userId = :userId)', { userId })
            .andWhere('travel.startDate <= :today', { today })
            .andWhere('travel.endDate >= :today', { today })
            .andWhere('travel.status = :status', { status: travel_entity_1.TravelStatus.ACTIVE })
            .orderBy('travel.startDate', 'ASC')
            .getMany();
    }
    async updateStatus(travelId, status) {
        await this.repository.update(travelId, { status });
        return this.findById(travelId);
    }
    async checkUserAccess(travelId, userId) {
        const count = await this.repository.createQueryBuilder('travel')
            .leftJoin('travel.members', 'members')
            .where('travel.id = :travelId', { travelId })
            .andWhere('(travel.ownerId = :userId OR members.userId = :userId)', { userId })
            .getCount();
        return count > 0;
    }
};
exports.TravelRepository = TravelRepository;
exports.TravelRepository = TravelRepository = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(travel_entity_1.Travel)),
    __metadata("design:paramtypes", [typeorm_2.Repository])
], TravelRepository);
