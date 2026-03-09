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
exports.AppVersionRepository = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const app_version_entity_1 = require("../entities/app-version.entity");
let AppVersionRepository = class AppVersionRepository {
    constructor(repository) {
        this.repository = repository;
    }
    async findByBundleId(bundleId) {
        return this.repository.findOne({ where: { bundleId } });
    }
    async upsert(data) {
        await this.repository
            .createQueryBuilder()
            .insert()
            .into(app_version_entity_1.AppVersion)
            .values({
            bundleId: data.bundleId,
            latestVersion: data.latestVersion,
            minSupportedVersion: data.minSupportedVersion ?? null,
            forceUpdate: data.forceUpdate ?? false,
            releaseNotes: data.releaseNotes ?? null,
            updatedAt: data.updatedAt ?? new Date(),
        })
            .orUpdate(['latest_version', 'min_supported_version', 'force_update', 'release_notes', 'updated_at'], ['bundle_id'])
            .execute();
    }
    async ensureTableExists() {
        // TypeORM이 엔티티 기반으로 테이블을 관리하므로 별도 DDL 불필요.
        // synchronize: true 또는 마이그레이션으로 처리됩니다.
    }
    getRepository() {
        return this.repository;
    }
};
exports.AppVersionRepository = AppVersionRepository;
exports.AppVersionRepository = AppVersionRepository = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(app_version_entity_1.AppVersion)),
    __metadata("design:paramtypes", [typeorm_2.Repository])
], AppVersionRepository);
