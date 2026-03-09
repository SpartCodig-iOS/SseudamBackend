"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DatabaseModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const database_config_1 = require("../../config/database.config");
// Entities
const entities_1 = require("../../entities");
// Repositories
const repositories_1 = require("../../repositories");
let DatabaseModule = class DatabaseModule {
};
exports.DatabaseModule = DatabaseModule;
exports.DatabaseModule = DatabaseModule = __decorate([
    (0, common_1.Module)({
        imports: [
            typeorm_1.TypeOrmModule.forRootAsync({
                useFactory: database_config_1.createDatabaseConfig,
            }),
            typeorm_1.TypeOrmModule.forFeature([
                entities_1.User,
                entities_1.Travel,
                entities_1.TravelMember,
                entities_1.TravelExpense,
                entities_1.TravelExpenseParticipant,
                entities_1.TravelSettlement,
                entities_1.AppVersion,
            ]),
        ],
        providers: [
            repositories_1.UserRepository,
            repositories_1.TravelRepository,
            repositories_1.TravelMemberRepository,
            repositories_1.TravelExpenseRepository,
            repositories_1.TravelExpenseParticipantRepository,
            repositories_1.TravelSettlementRepository,
            repositories_1.AppVersionRepository,
        ],
        exports: [
            typeorm_1.TypeOrmModule,
            repositories_1.UserRepository,
            repositories_1.TravelRepository,
            repositories_1.TravelMemberRepository,
            repositories_1.TravelExpenseRepository,
            repositories_1.TravelExpenseParticipantRepository,
            repositories_1.TravelSettlementRepository,
            repositories_1.AppVersionRepository,
        ],
    })
], DatabaseModule);
