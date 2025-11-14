"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const shared_module_1 = require("./modules/shared/shared.module");
const auth_module_1 = require("./modules/auth/auth.module");
const oauth_module_1 = require("./modules/oauth/oauth.module");
const profile_module_1 = require("./modules/profile/profile.module");
const session_module_1 = require("./modules/session/session.module");
const health_module_1 = require("./modules/health/health.module");
const requestLogger_1 = require("./middleware/requestLogger");
const travel_module_1 = require("./modules/travel/travel.module");
const meta_module_1 = require("./modules/meta/meta.module");
const travel_expense_module_1 = require("./modules/travel-expense/travel-expense.module");
const travel_settlement_module_1 = require("./modules/travel-settlement/travel-settlement.module");
let AppModule = class AppModule {
    configure(consumer) {
        consumer.apply(requestLogger_1.RequestLoggerMiddleware).forRoutes('*');
    }
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            shared_module_1.SharedModule,
            auth_module_1.AuthModule,
            oauth_module_1.OAuthModule,
            profile_module_1.ProfileModule,
            health_module_1.HealthModule,
            travel_module_1.TravelModule,
            meta_module_1.MetaModule,
            travel_expense_module_1.TravelExpenseModule,
            travel_settlement_module_1.TravelSettlementModule,
            session_module_1.SessionModule,
        ],
    })
], AppModule);
