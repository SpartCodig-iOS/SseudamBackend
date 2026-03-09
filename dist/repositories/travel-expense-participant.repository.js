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
exports.TravelExpenseParticipantRepository = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const travel_expense_participant_entity_1 = require("../entities/travel-expense-participant.entity");
const base_repository_1 = require("./base.repository");
let TravelExpenseParticipantRepository = class TravelExpenseParticipantRepository extends base_repository_1.BaseRepository {
    constructor(participantRepository) {
        super(participantRepository);
    }
    async findByExpense(expenseId) {
        return this.repository.find({
            where: { expenseId },
            relations: ['user'],
            order: { createdAt: 'ASC' },
        });
    }
    async findByUser(userId) {
        return this.repository.find({
            where: { userId },
            relations: ['expense', 'expense.travel'],
            order: { createdAt: 'DESC' },
        });
    }
    async addParticipants(expenseId, userIds) {
        if (userIds.length === 0)
            return [];
        const participants = userIds.map(userId => this.repository.create({ expenseId, userId }));
        return this.repository.save(participants);
    }
    async removeParticipant(expenseId, userId) {
        const result = await this.repository.delete({ expenseId, userId });
        return result.affected !== 0;
    }
    async removeAllParticipants(expenseId) {
        await this.repository.delete({ expenseId });
    }
    async replaceParticipants(expenseId, userIds) {
        await this.repository.manager.transaction(async (manager) => {
            // Remove existing participants
            await manager.delete(travel_expense_participant_entity_1.TravelExpenseParticipant, { expenseId });
            // Add new participants
            if (userIds.length > 0) {
                const participants = userIds.map(userId => manager.create(travel_expense_participant_entity_1.TravelExpenseParticipant, { expenseId, userId }));
                await manager.save(participants);
            }
        });
        return this.findByExpense(expenseId);
    }
    async isParticipant(expenseId, userId) {
        const count = await this.repository.count({
            where: { expenseId, userId },
        });
        return count > 0;
    }
    async getParticipantCount(expenseId) {
        return this.repository.count({
            where: { expenseId },
        });
    }
    async findExpenseParticipants(expenseIds) {
        if (expenseIds.length === 0)
            return new Map();
        const participants = await this.repository.find({
            where: { expenseId: expenseIds.length === 1 ? expenseIds[0] : undefined },
            relations: ['user'],
        });
        const participantMap = new Map();
        for (const participant of participants) {
            if (!participantMap.has(participant.expenseId)) {
                participantMap.set(participant.expenseId, []);
            }
            participantMap.get(participant.expenseId).push(participant);
        }
        return participantMap;
    }
    async bulkRemoveByExpenses(expenseIds) {
        if (expenseIds.length === 0)
            return;
        await this.repository.createQueryBuilder()
            .delete()
            .where('expenseId IN (:...expenseIds)', { expenseIds })
            .execute();
    }
};
exports.TravelExpenseParticipantRepository = TravelExpenseParticipantRepository;
exports.TravelExpenseParticipantRepository = TravelExpenseParticipantRepository = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(travel_expense_participant_entity_1.TravelExpenseParticipant)),
    __metadata("design:paramtypes", [typeorm_2.Repository])
], TravelExpenseParticipantRepository);
