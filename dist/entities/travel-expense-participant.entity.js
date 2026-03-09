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
exports.TravelExpenseParticipant = void 0;
const typeorm_1 = require("typeorm");
const travel_expense_entity_1 = require("./travel-expense.entity");
const user_entity_1 = require("./user.entity");
let TravelExpenseParticipant = class TravelExpenseParticipant {
    constructor(partial = {}) {
        Object.assign(this, partial);
    }
};
exports.TravelExpenseParticipant = TravelExpenseParticipant;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], TravelExpenseParticipant.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'uuid', name: 'expense_id' }),
    __metadata("design:type", String)
], TravelExpenseParticipant.prototype, "expenseId", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'uuid', name: 'user_id' }),
    __metadata("design:type", String)
], TravelExpenseParticipant.prototype, "userId", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)({ type: 'timestamp with time zone', name: 'created_at' }),
    __metadata("design:type", Date)
], TravelExpenseParticipant.prototype, "createdAt", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => travel_expense_entity_1.TravelExpense, (expense) => expense.participants, { onDelete: 'CASCADE' }),
    (0, typeorm_1.JoinColumn)({ name: 'expense_id' }),
    __metadata("design:type", travel_expense_entity_1.TravelExpense)
], TravelExpenseParticipant.prototype, "expense", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => user_entity_1.User, { onDelete: 'CASCADE' }),
    (0, typeorm_1.JoinColumn)({ name: 'user_id' }),
    __metadata("design:type", user_entity_1.User)
], TravelExpenseParticipant.prototype, "user", void 0);
exports.TravelExpenseParticipant = TravelExpenseParticipant = __decorate([
    (0, typeorm_1.Entity)('travel_expense_participants'),
    (0, typeorm_1.Unique)(['expense_id', 'user_id']),
    (0, typeorm_1.Index)(['expense_id']),
    (0, typeorm_1.Index)(['user_id']),
    __metadata("design:paramtypes", [Object])
], TravelExpenseParticipant);
