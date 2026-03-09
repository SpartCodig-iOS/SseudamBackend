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
exports.TravelExpenseRepository = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const travel_expense_entity_1 = require("../entities/travel-expense.entity");
const base_repository_1 = require("./base.repository");
let TravelExpenseRepository = class TravelExpenseRepository extends base_repository_1.BaseRepository {
    constructor(travelExpenseRepository) {
        super(travelExpenseRepository);
    }
    async findExpensesByTravel(travelId, options = {}) {
        const { authorId, payerId, category, startDate, endDate, page = 1, limit = 20, sortBy = 'expense_date', sortOrder = 'DESC', } = options;
        const queryBuilder = this.repository.createQueryBuilder('expense')
            .leftJoinAndSelect('expense.user', 'author')
            .leftJoinAndSelect('expense.payer', 'payer')
            .leftJoinAndSelect('expense.participants', 'participants')
            .leftJoinAndSelect('participants.user', 'participantUser')
            .where('expense.travelId = :travelId', { travelId });
        if (authorId) {
            queryBuilder.andWhere('expense.authorId = :authorId', { authorId });
        }
        if (payerId) {
            queryBuilder.andWhere('expense.payerId = :payerId', { payerId });
        }
        if (category) {
            queryBuilder.andWhere('expense.category = :category', { category });
        }
        if (startDate && endDate) {
            queryBuilder.andWhere('expense.expenseDate BETWEEN :startDate AND :endDate', {
                startDate,
                endDate,
            });
        }
        else if (startDate) {
            queryBuilder.andWhere('expense.expenseDate >= :startDate', { startDate });
        }
        else if (endDate) {
            queryBuilder.andWhere('expense.expenseDate <= :endDate', { endDate });
        }
        queryBuilder
            .orderBy(`expense.${sortBy}`, sortOrder)
            .skip((page - 1) * limit)
            .take(limit);
        return queryBuilder.getManyAndCount();
    }
    async findExpenseWithDetails(expenseId) {
        return this.repository.findOne({
            where: { id: expenseId },
            relations: [
                'travel',
                'user',
                'payer',
                'participants',
                'participants.user',
            ],
        });
    }
    async getTravelExpenseStats(travelId, startDate, endDate) {
        let queryBuilder = this.repository.createQueryBuilder('expense')
            .where('expense.travelId = :travelId', { travelId });
        if (startDate && endDate) {
            queryBuilder = queryBuilder.andWhere('expense.expenseDate BETWEEN :startDate AND :endDate', {
                startDate,
                endDate,
            });
        }
        const expenses = await queryBuilder.getMany();
        const totalAmount = expenses.reduce((sum, expense) => sum + Number(expense.amount), 0);
        const totalConverted = expenses.reduce((sum, expense) => sum + Number(expense.convertedAmount), 0);
        const expenseCount = expenses.length;
        const categoryBreakdown = expenses.reduce((acc, expense) => {
            const category = expense.category || 'other';
            acc[category] = (acc[category] || 0) + Number(expense.convertedAmount);
            return acc;
        }, {});
        const currencyBreakdown = expenses.reduce((acc, expense) => {
            acc[expense.currency] = (acc[expense.currency] || 0) + Number(expense.amount);
            return acc;
        }, {});
        return {
            totalAmount,
            totalConverted,
            expenseCount,
            categoryBreakdown,
            currencyBreakdown,
        };
    }
    async getUserExpenseStats(travelId, userId) {
        // 사용자가 지불한 총 금액
        const paidResult = await this.repository.createQueryBuilder('expense')
            .select('COALESCE(SUM(expense.convertedAmount), 0)', 'total')
            .where('expense.travelId = :travelId', { travelId })
            .andWhere('expense.payerId = :userId', { userId })
            .getRawOne();
        // 사용자가 참여한 지출의 총 개수
        const participatedResult = await this.repository.createQueryBuilder('expense')
            .leftJoin('expense.participants', 'participant')
            .select('COUNT(DISTINCT expense.id)', 'count')
            .where('expense.travelId = :travelId', { travelId })
            .andWhere('participant.userId = :userId', { userId })
            .getRawOne();
        // 사용자가 작성한 지출 개수
        const authoredResult = await this.repository.createQueryBuilder('expense')
            .select('COUNT(*)', 'count')
            .where('expense.travelId = :travelId', { travelId })
            .andWhere('expense.authorId = :userId', { userId })
            .getRawOne();
        return {
            totalPaid: parseFloat(paidResult.total) || 0,
            totalOwed: 0, // 정산 로직에 따라 계산해야 함
            expenseCount: parseInt(authoredResult.count) || 0,
        };
    }
    async findExpensesByDateRange(travelId, startDate, endDate) {
        return this.repository.find({
            where: {
                travelId,
                expenseDate: (0, typeorm_2.Between)(startDate, endDate),
            },
            relations: ['user', 'payer', 'participants', 'participants.user'],
            order: { expenseDate: 'ASC', createdAt: 'ASC' },
        });
    }
    async findUserExpenses(userId, options = {}) {
        const { travelId, page = 1, limit = 20, sortBy = 'expense_date', sortOrder = 'DESC', } = options;
        const queryBuilder = this.repository.createQueryBuilder('expense')
            .leftJoinAndSelect('expense.travel', 'travel')
            .leftJoinAndSelect('expense.payer', 'payer')
            .leftJoinAndSelect('expense.participants', 'participants')
            .where('expense.authorId = :userId', { userId });
        if (travelId) {
            queryBuilder.andWhere('expense.travelId = :travelId', { travelId });
        }
        queryBuilder
            .orderBy(`expense.${sortBy}`, sortOrder)
            .skip((page - 1) * limit)
            .take(limit);
        return queryBuilder.getManyAndCount();
    }
    async getExpensesByCategory(travelId) {
        const expenses = await this.repository.find({
            where: { travelId },
            relations: ['user', 'payer'],
            order: { expenseDate: 'DESC' },
        });
        return expenses.reduce((acc, expense) => {
            const category = expense.category || 'other';
            if (!acc[category]) {
                acc[category] = [];
            }
            acc[category].push(expense);
            return acc;
        }, {});
    }
    async deleteExpensesByTravel(travelId) {
        await this.repository.delete({ travelId });
    }
    async bulkUpdateConvertedAmount(updates) {
        if (updates.length === 0)
            return;
        await this.repository.manager.transaction(async (manager) => {
            for (const update of updates) {
                await manager.update(travel_expense_entity_1.TravelExpense, update.id, {
                    convertedAmount: update.convertedAmount,
                });
            }
        });
    }
};
exports.TravelExpenseRepository = TravelExpenseRepository;
exports.TravelExpenseRepository = TravelExpenseRepository = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(travel_expense_entity_1.TravelExpense)),
    __metadata("design:paramtypes", [typeorm_2.Repository])
], TravelExpenseRepository);
