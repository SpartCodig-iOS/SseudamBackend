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
exports.TravelMemberRepository = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const travel_member_entity_1 = require("../entities/travel-member.entity");
const base_repository_1 = require("./base.repository");
let TravelMemberRepository = class TravelMemberRepository extends base_repository_1.BaseRepository {
    constructor(travelMemberRepository) {
        super(travelMemberRepository);
    }
    async findByTravelAndUser(travelId, userId) {
        return this.repository.findOne({
            where: { travelId, userId },
            relations: ['user', 'travel'],
        });
    }
    async findTravelMembers(travelId) {
        return this.repository.find({
            where: { travelId },
            relations: ['user'],
            order: { joinedAt: 'ASC' },
        });
    }
    async findUserTravels(userId) {
        return this.repository.find({
            where: { userId },
            relations: ['travel', 'travel.user'],
            order: { joinedAt: 'DESC' },
        });
    }
    async addMember(travelId, userId, role = travel_member_entity_1.TravelMemberRole.MEMBER) {
        const member = this.repository.create({
            travelId,
            userId,
            role,
        });
        return this.repository.save(member);
    }
    async removeMember(travelId, userId) {
        const result = await this.repository.delete({ travelId, userId });
        return result.affected !== 0;
    }
    async updateMemberRole(travelId, userId, role) {
        await this.repository.update({ travelId, userId }, { role });
        return this.findByTravelAndUser(travelId, userId);
    }
    async isMember(travelId, userId) {
        const count = await this.repository.count({
            where: { travelId, userId },
        });
        return count > 0;
    }
    async hasRole(travelId, userId, roles) {
        const count = await this.repository.count({
            where: {
                travelId,
                userId,
                role: roles.length === 1 ? roles[0] : undefined,
            },
        });
        if (roles.length === 1) {
            return count > 0;
        }
        // For multiple roles, use query builder
        const member = await this.repository.findOne({
            where: { travelId, userId },
        });
        return member ? roles.includes(member.role) : false;
    }
    async isOwnerOrEditor(travelId, userId) {
        return this.hasRole(travelId, userId, [travel_member_entity_1.TravelMemberRole.OWNER, travel_member_entity_1.TravelMemberRole.EDITOR]);
    }
    async getMemberCount(travelId) {
        return this.repository.count({
            where: { travelId },
        });
    }
    async transferOwnership(travelId, currentOwnerId, newOwnerId) {
        await this.repository.manager.transaction(async (manager) => {
            // Update current owner to editor
            await manager.update(travel_member_entity_1.TravelMember, { travelId, userId: currentOwnerId }, { role: travel_member_entity_1.TravelMemberRole.EDITOR });
            // Update new owner
            await manager.update(travel_member_entity_1.TravelMember, { travelId, userId: newOwnerId }, { role: travel_member_entity_1.TravelMemberRole.OWNER });
        });
    }
    async findMembersWithUsers(travelId) {
        return this.repository.createQueryBuilder('member')
            .leftJoinAndSelect('member.user', 'user')
            .where('member.travelId = :travelId', { travelId })
            .orderBy('member.role', 'ASC')
            .addOrderBy('member.joinedAt', 'ASC')
            .getMany();
    }
    async bulkRemoveMembers(travelId, userIds) {
        if (userIds.length === 0)
            return;
        await this.repository.createQueryBuilder()
            .delete()
            .where('travelId = :travelId', { travelId })
            .andWhere('userId IN (:...userIds)', { userIds })
            .execute();
    }
};
exports.TravelMemberRepository = TravelMemberRepository;
exports.TravelMemberRepository = TravelMemberRepository = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(travel_member_entity_1.TravelMember)),
    __metadata("design:paramtypes", [typeorm_2.Repository])
], TravelMemberRepository);
