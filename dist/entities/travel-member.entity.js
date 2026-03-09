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
exports.TravelMember = exports.TravelMemberRole = void 0;
const typeorm_1 = require("typeorm");
const user_entity_1 = require("./user.entity");
const travel_entity_1 = require("./travel.entity");
var TravelMemberRole;
(function (TravelMemberRole) {
    TravelMemberRole["OWNER"] = "owner";
    TravelMemberRole["EDITOR"] = "editor";
    TravelMemberRole["MEMBER"] = "member";
    TravelMemberRole["VIEWER"] = "viewer";
})(TravelMemberRole || (exports.TravelMemberRole = TravelMemberRole = {}));
let TravelMember = class TravelMember {
    constructor(partial = {}) {
        Object.assign(this, partial);
    }
};
exports.TravelMember = TravelMember;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], TravelMember.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'uuid', name: 'travel_id' }),
    __metadata("design:type", String)
], TravelMember.prototype, "travelId", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'uuid', name: 'user_id' }),
    __metadata("design:type", String)
], TravelMember.prototype, "userId", void 0);
__decorate([
    (0, typeorm_1.Column)({
        type: 'enum',
        enum: TravelMemberRole,
        default: TravelMemberRole.MEMBER,
    }),
    __metadata("design:type", String)
], TravelMember.prototype, "role", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)({ type: 'timestamp with time zone', name: 'joined_at' }),
    __metadata("design:type", Date)
], TravelMember.prototype, "joinedAt", void 0);
__decorate([
    (0, typeorm_1.UpdateDateColumn)({ type: 'timestamp with time zone', name: 'updated_at' }),
    __metadata("design:type", Date)
], TravelMember.prototype, "updatedAt", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => travel_entity_1.Travel, (travel) => travel.members, { onDelete: 'CASCADE' }),
    (0, typeorm_1.JoinColumn)({ name: 'travel_id' }),
    __metadata("design:type", travel_entity_1.Travel)
], TravelMember.prototype, "travel", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => user_entity_1.User, { onDelete: 'CASCADE' }),
    (0, typeorm_1.JoinColumn)({ name: 'user_id' }),
    __metadata("design:type", user_entity_1.User)
], TravelMember.prototype, "user", void 0);
exports.TravelMember = TravelMember = __decorate([
    (0, typeorm_1.Entity)('travel_members'),
    (0, typeorm_1.Unique)(['travel_id', 'user_id']),
    (0, typeorm_1.Index)(['travel_id']),
    (0, typeorm_1.Index)(['user_id']),
    (0, typeorm_1.Index)(['role']),
    __metadata("design:paramtypes", [Object])
], TravelMember);
