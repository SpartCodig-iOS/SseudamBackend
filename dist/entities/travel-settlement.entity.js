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
Object.defineProperty(exports, "__esModule", { value: true });
exports.TravelSettlement = exports.SettlementStatus = void 0;
const typeorm_1 = require("typeorm");
const travel_entity_1 = require("./travel.entity");
const user_entity_1 = require("./user.entity");
var SettlementStatus;
(function (SettlementStatus) {
    SettlementStatus["PENDING"] = "pending";
    SettlementStatus["COMPLETED"] = "completed";
})(SettlementStatus || (exports.SettlementStatus = SettlementStatus = {}));
let TravelSettlement = class TravelSettlement {
    constructor(partial = {}) {
        Object.assign(this, partial);
    }
};
exports.TravelSettlement = TravelSettlement;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], TravelSettlement.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'uuid', name: 'travel_id' }),
    __metadata("design:type", String)
], TravelSettlement.prototype, "travelId", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'uuid', name: 'from_member' }),
    __metadata("design:type", String)
], TravelSettlement.prototype, "fromMember", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'uuid', name: 'to_member' }),
    __metadata("design:type", String)
], TravelSettlement.prototype, "toMember", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 15, scale: 2 }),
    __metadata("design:type", Number)
], TravelSettlement.prototype, "amount", void 0);
__decorate([
    (0, typeorm_1.Column)({
        type: 'varchar',
        length: 20,
        default: SettlementStatus.PENDING,
    }),
    __metadata("design:type", String)
], TravelSettlement.prototype, "status", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'timestamp with time zone', nullable: true, name: 'completed_at' }),
    __metadata("design:type", Object)
], TravelSettlement.prototype, "completedAt", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)({ type: 'timestamp with time zone', name: 'created_at' }),
    __metadata("design:type", Date)
], TravelSettlement.prototype, "createdAt", void 0);
__decorate([
    (0, typeorm_1.UpdateDateColumn)({ type: 'timestamp with time zone', name: 'updated_at' }),
    __metadata("design:type", Date)
], TravelSettlement.prototype, "updatedAt", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => travel_entity_1.Travel, { onDelete: 'CASCADE' }),
    (0, typeorm_1.JoinColumn)({ name: 'travel_id' }),
    __metadata("design:type", travel_entity_1.Travel)
], TravelSettlement.prototype, "travel", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => user_entity_1.User, { onDelete: 'CASCADE' }),
    (0, typeorm_1.JoinColumn)({ name: 'from_member' }),
    __metadata("design:type", user_entity_1.User)
], TravelSettlement.prototype, "fromUser", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => user_entity_1.User, { onDelete: 'CASCADE' }),
    (0, typeorm_1.JoinColumn)({ name: 'to_member' }),
    __metadata("design:type", user_entity_1.User)
], TravelSettlement.prototype, "toUser", void 0);
exports.TravelSettlement = TravelSettlement = __decorate([
    (0, typeorm_1.Entity)('travel_settlements'),
    (0, typeorm_1.Index)(['travelId']),
    (0, typeorm_1.Index)(['fromMember']),
    (0, typeorm_1.Index)(['toMember']),
    (0, typeorm_1.Index)(['status']),
    __metadata("design:paramtypes", [Object])
], TravelSettlement);
