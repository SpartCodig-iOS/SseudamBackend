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
exports.User = void 0;
const typeorm_1 = require("typeorm");
const user_1 = require("../types/user");
// Forward references to avoid circular dependencies
/**
 * profiles 테이블에 매핑되는 User 엔티티
 * Supabase auth.users 와 1:1 연결되며, 애플리케이션 프로필 정보를 관리합니다.
 */
let User = class User {
    constructor(partial = {}) {
        Object.assign(this, partial);
    }
};
exports.User = User;
__decorate([
    (0, typeorm_1.PrimaryColumn)({ type: 'uuid' }),
    __metadata("design:type", String)
], User.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 255, unique: true }),
    __metadata("design:type", String)
], User.prototype, "email", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 255, nullable: true }),
    __metadata("design:type", String)
], User.prototype, "password_hash", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 100, nullable: true }),
    __metadata("design:type", Object)
], User.prototype, "name", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'text', nullable: true }),
    __metadata("design:type", Object)
], User.prototype, "avatar_url", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 50, unique: true, nullable: true }),
    __metadata("design:type", String)
], User.prototype, "username", void 0);
__decorate([
    (0, typeorm_1.Column)({
        type: 'varchar',
        length: 20,
        nullable: true,
        name: 'login_type',
    }),
    __metadata("design:type", Object)
], User.prototype, "login_type", void 0);
__decorate([
    (0, typeorm_1.Column)({
        type: 'enum',
        enum: user_1.USER_ROLE_VALUES,
        default: 'user',
    }),
    __metadata("design:type", String)
], User.prototype, "role", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'text', nullable: true, name: 'apple_refresh_token' }),
    __metadata("design:type", Object)
], User.prototype, "apple_refresh_token", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'text', nullable: true, name: 'google_refresh_token' }),
    __metadata("design:type", Object)
], User.prototype, "google_refresh_token", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)({ type: 'timestamp with time zone', name: 'created_at' }),
    __metadata("design:type", Date)
], User.prototype, "created_at", void 0);
__decorate([
    (0, typeorm_1.UpdateDateColumn)({ type: 'timestamp with time zone', name: 'updated_at' }),
    __metadata("design:type", Date)
], User.prototype, "updated_at", void 0);
__decorate([
    (0, typeorm_1.OneToMany)('Travel', 'user'),
    __metadata("design:type", Array)
], User.prototype, "travels", void 0);
__decorate([
    (0, typeorm_1.OneToMany)('TravelExpense', 'user'),
    __metadata("design:type", Array)
], User.prototype, "expenses", void 0);
exports.User = User = __decorate([
    (0, typeorm_1.Entity)('profiles'),
    (0, typeorm_1.Index)(['email'], { unique: true }),
    (0, typeorm_1.Index)(['username'], { unique: true }),
    __metadata("design:paramtypes", [Object])
], User);
