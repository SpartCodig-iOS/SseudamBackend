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
exports.TravelSettlementRepository = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const travel_settlement_entity_1 = require("../entities/travel-settlement.entity");
const base_repository_1 = require("./base.repository");
let TravelSettlementRepository = class TravelSettlementRepository extends base_repository_1.BaseRepository {
    constructor(settlementRepository) {
        super(settlementRepository);
    }
    async findByTravel(travelId) {
        return this.repository.find({
            where: { travelId },
            order: { createdAt: 'ASC' },
        });
    }
    async findByTravelWithProfiles(travelId) {
        return this.repository
            .createQueryBuilder('ts')
            .leftJoinAndSelect('ts.fromUser', 'fromUser')
            .leftJoinAndSelect('ts.toUser', 'toUser')
            .where('ts.travelId = :travelId', { travelId })
            .orderBy('ts.createdAt', 'ASC')
            .getMany();
    }
    async deleteByTravel(travelId, manager) {
        const repo = manager ? manager.getRepository(travel_settlement_entity_1.TravelSettlement) : this.repository;
        await repo.delete({ travelId });
    }
    async bulkInsert(settlements, manager) {
        if (settlements.length === 0)
            return;
        const repo = manager ? manager.getRepository(travel_settlement_entity_1.TravelSettlement) : this.repository;
        const entities = settlements.map((s) => repo.create({
            id: s.id,
            travelId: s.travelId,
            fromMember: s.fromMember,
            toMember: s.toMember,
            amount: s.amount,
            status: travel_settlement_entity_1.SettlementStatus.PENDING,
        }));
        await repo.save(entities);
    }
    async markCompleted(settlementId, travelId) {
        const result = await this.repository
            .createQueryBuilder()
            .update(travel_settlement_entity_1.TravelSettlement)
            .set({
            status: travel_settlement_entity_1.SettlementStatus.COMPLETED,
            completedAt: () => 'NOW()',
            updatedAt: () => 'NOW()',
        })
            .where('id = :settlementId AND travelId = :travelId', { settlementId, travelId })
            .returning('id')
            .execute();
        if (!result.affected || result.affected === 0) {
            return null;
        }
        return this.findById(settlementId);
    }
    async isMember(travelId, userId) {
        const count = await this.repository.manager
            .createQueryBuilder()
            .select('1')
            .from('travel_members', 'tm')
            .where('tm.travel_id = :travelId AND tm.user_id = :userId', { travelId, userId })
            .limit(1)
            .getCount();
        return count > 0;
    }
};
exports.TravelSettlementRepository = TravelSettlementRepository;
exports.TravelSettlementRepository = TravelSettlementRepository = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(travel_settlement_entity_1.TravelSettlement)),
    __metadata("design:paramtypes", [typeorm_2.Repository])
], TravelSettlementRepository);
