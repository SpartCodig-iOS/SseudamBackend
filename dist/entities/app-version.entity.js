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
exports.AppVersion = void 0;
const typeorm_1 = require("typeorm");
let AppVersion = class AppVersion {
    constructor(partial = {}) {
        Object.assign(this, partial);
    }
};
exports.AppVersion = AppVersion;
__decorate([
    (0, typeorm_1.PrimaryColumn)({ type: 'text', name: 'bundle_id' }),
    __metadata("design:type", String)
], AppVersion.prototype, "bundleId", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'text', name: 'latest_version' }),
    __metadata("design:type", String)
], AppVersion.prototype, "latestVersion", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'text', nullable: true, name: 'min_supported_version' }),
    __metadata("design:type", Object)
], AppVersion.prototype, "minSupportedVersion", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'boolean', default: false, name: 'force_update' }),
    __metadata("design:type", Boolean)
], AppVersion.prototype, "forceUpdate", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'text', nullable: true, name: 'release_notes' }),
    __metadata("design:type", Object)
], AppVersion.prototype, "releaseNotes", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)({ type: 'timestamp with time zone', name: 'created_at' }),
    __metadata("design:type", Date)
], AppVersion.prototype, "createdAt", void 0);
__decorate([
    (0, typeorm_1.UpdateDateColumn)({ type: 'timestamp with time zone', name: 'updated_at' }),
    __metadata("design:type", Date)
], AppVersion.prototype, "updatedAt", void 0);
exports.AppVersion = AppVersion = __decorate([
    (0, typeorm_1.Entity)('app_versions'),
    __metadata("design:paramtypes", [Object])
], AppVersion);
