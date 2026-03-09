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
exports.TravelExpense = exports.ExpenseCategory = void 0;
const typeorm_1 = require("typeorm");
const user_entity_1 = require("./user.entity");
const travel_entity_1 = require("./travel.entity");
const travel_expense_participant_entity_1 = require("./travel-expense-participant.entity");
var ExpenseCategory;
(function (ExpenseCategory) {
    ExpenseCategory["ACCOMMODATION"] = "accommodation";
    ExpenseCategory["FOOD_AND_DRINK"] = "food_and_drink";
    ExpenseCategory["TRANSPORTATION"] = "transportation";
    ExpenseCategory["ACTIVITY"] = "activity";
    ExpenseCategory["SHOPPING"] = "shopping";
    ExpenseCategory["OTHER"] = "other";
})(ExpenseCategory || (exports.ExpenseCategory = ExpenseCategory = {}));
let TravelExpense = class TravelExpense {
    constructor(partial = {}) {
        Object.assign(this, partial);
    }
};
exports.TravelExpense = TravelExpense;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], TravelExpense.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'uuid', name: 'travel_id' }),
    __metadata("design:type", String)
], TravelExpense.prototype, "travelId", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 50 }),
    __metadata("design:type", String)
], TravelExpense.prototype, "title", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'text', nullable: true }),
    __metadata("design:type", Object)
], TravelExpense.prototype, "note", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 15, scale: 2 }),
    __metadata("design:type", Number)
], TravelExpense.prototype, "amount", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'char', length: 3 }),
    __metadata("design:type", String)
], TravelExpense.prototype, "currency", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 15, scale: 2, name: 'converted_amount' }),
    __metadata("design:type", Number)
], TravelExpense.prototype, "convertedAmount", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'date', name: 'expense_date' }),
    __metadata("design:type", String)
], TravelExpense.prototype, "expenseDate", void 0);
__decorate([
    (0, typeorm_1.Column)({
        type: 'enum',
        enum: ExpenseCategory,
        nullable: true,
    }),
    __metadata("design:type", Object)
], TravelExpense.prototype, "category", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'uuid', name: 'author_id' }),
    __metadata("design:type", String)
], TravelExpense.prototype, "authorId", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'uuid', nullable: true, name: 'payer_id' }),
    __metadata("design:type", Object)
], TravelExpense.prototype, "payerId", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)({ type: 'timestamp with time zone', name: 'created_at' }),
    __metadata("design:type", Date)
], TravelExpense.prototype, "createdAt", void 0);
__decorate([
    (0, typeorm_1.UpdateDateColumn)({ type: 'timestamp with time zone', name: 'updated_at' }),
    __metadata("design:type", Date)
], TravelExpense.prototype, "updatedAt", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => travel_entity_1.Travel, (travel) => travel.expenses, { onDelete: 'CASCADE' }),
    (0, typeorm_1.JoinColumn)({ name: 'travel_id' }),
    __metadata("design:type", travel_entity_1.Travel)
], TravelExpense.prototype, "travel", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => user_entity_1.User, (user) => user.expenses, { onDelete: 'CASCADE' }),
    (0, typeorm_1.JoinColumn)({ name: 'author_id' }),
    __metadata("design:type", user_entity_1.User)
], TravelExpense.prototype, "user", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => user_entity_1.User, { nullable: true, onDelete: 'SET NULL' }),
    (0, typeorm_1.JoinColumn)({ name: 'payer_id' }),
    __metadata("design:type", Object)
], TravelExpense.prototype, "payer", void 0);
__decorate([
    (0, typeorm_1.OneToMany)(() => travel_expense_participant_entity_1.TravelExpenseParticipant, (participant) => participant.expense, { cascade: true }),
    __metadata("design:type", Array)
], TravelExpense.prototype, "participants", void 0);
exports.TravelExpense = TravelExpense = __decorate([
    (0, typeorm_1.Entity)('travel_expenses'),
    (0, typeorm_1.Index)(['travel_id']),
    (0, typeorm_1.Index)(['author_id']),
    (0, typeorm_1.Index)(['payer_id']),
    (0, typeorm_1.Index)(['expense_date']),
    (0, typeorm_1.Index)(['category']),
    __metadata("design:paramtypes", [Object])
], TravelExpense);
