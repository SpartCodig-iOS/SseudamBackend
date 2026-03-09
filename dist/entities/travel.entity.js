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
exports.Travel = exports.TravelStatus = void 0;
const typeorm_1 = require("typeorm");
const user_entity_1 = require("./user.entity");
const travel_expense_entity_1 = require("./travel-expense.entity");
const travel_member_entity_1 = require("./travel-member.entity");
var TravelStatus;
(function (TravelStatus) {
    TravelStatus["PLANNING"] = "planning";
    TravelStatus["ACTIVE"] = "active";
    TravelStatus["COMPLETED"] = "completed";
    TravelStatus["CANCELLED"] = "cancelled";
})(TravelStatus || (exports.TravelStatus = TravelStatus = {}));
let Travel = class Travel {
    constructor(partial = {}) {
        Object.assign(this, partial);
    }
};
exports.Travel = Travel;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], Travel.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 120 }),
    __metadata("design:type", String)
], Travel.prototype, "title", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'date', name: 'start_date' }),
    __metadata("design:type", String)
], Travel.prototype, "startDate", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'date', name: 'end_date' }),
    __metadata("design:type", String)
], Travel.prototype, "endDate", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'char', length: 2, name: 'country_code' }),
    __metadata("design:type", String)
], Travel.prototype, "countryCode", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 50, nullable: true, name: 'country_name_kr' }),
    __metadata("design:type", Object)
], Travel.prototype, "countryNameKr", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'char', length: 3, name: 'base_currency' }),
    __metadata("design:type", String)
], Travel.prototype, "baseCurrency", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 15, scale: 6, name: 'base_exchange_rate' }),
    __metadata("design:type", Number)
], Travel.prototype, "baseExchangeRate", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'simple-array', name: 'country_currencies' }),
    __metadata("design:type", Array)
], Travel.prototype, "countryCurrencies", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'bigint', nullable: true }),
    __metadata("design:type", Object)
], Travel.prototype, "budget", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'char', length: 3, nullable: true, name: 'budget_currency' }),
    __metadata("design:type", Object)
], Travel.prototype, "budgetCurrency", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 32, nullable: true, unique: true, name: 'invite_code' }),
    __metadata("design:type", Object)
], Travel.prototype, "inviteCode", void 0);
__decorate([
    (0, typeorm_1.Column)({
        type: 'enum',
        enum: TravelStatus,
        default: TravelStatus.PLANNING,
    }),
    __metadata("design:type", String)
], Travel.prototype, "status", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'uuid', name: 'owner_id' }),
    __metadata("design:type", String)
], Travel.prototype, "ownerId", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)({ type: 'timestamp with time zone', name: 'created_at' }),
    __metadata("design:type", Date)
], Travel.prototype, "createdAt", void 0);
__decorate([
    (0, typeorm_1.UpdateDateColumn)({ type: 'timestamp with time zone', name: 'updated_at' }),
    __metadata("design:type", Date)
], Travel.prototype, "updatedAt", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => user_entity_1.User, (user) => user.travels, { onDelete: 'CASCADE' }),
    (0, typeorm_1.JoinColumn)({ name: 'owner_id' }),
    __metadata("design:type", user_entity_1.User)
], Travel.prototype, "user", void 0);
__decorate([
    (0, typeorm_1.OneToMany)(() => travel_expense_entity_1.TravelExpense, (expense) => expense.travel, { cascade: true }),
    __metadata("design:type", Array)
], Travel.prototype, "expenses", void 0);
__decorate([
    (0, typeorm_1.OneToMany)(() => travel_member_entity_1.TravelMember, (member) => member.travel, { cascade: true }),
    __metadata("design:type", Array)
], Travel.prototype, "members", void 0);
exports.Travel = Travel = __decorate([
    (0, typeorm_1.Entity)('travels'),
    (0, typeorm_1.Index)(['owner_id']),
    (0, typeorm_1.Index)(['invite_code'], { unique: true }),
    (0, typeorm_1.Index)(['status']),
    (0, typeorm_1.Index)(['start_date', 'end_date']),
    __metadata("design:paramtypes", [Object])
], Travel);
