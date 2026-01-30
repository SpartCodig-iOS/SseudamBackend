"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TravelExpenseModule = void 0;
const common_1 = require("@nestjs/common");
const travel_expense_controller_1 = require("./travel-expense.controller");
const travel_expense_service_1 = require("./travel-expense.service");
const meta_module_1 = require("../meta/meta.module");
const profile_module_1 = require("../profile/profile.module");
const cacheService_1 = require("../../services/cacheService");
const queue_module_1 = require("../queue/queue.module");
let TravelExpenseModule = class TravelExpenseModule {
};
exports.TravelExpenseModule = TravelExpenseModule;
exports.TravelExpenseModule = TravelExpenseModule = __decorate([
    (0, common_1.Module)({
        imports: [meta_module_1.MetaModule, profile_module_1.ProfileModule, queue_module_1.QueueModule],
        controllers: [travel_expense_controller_1.TravelExpenseController],
        providers: [travel_expense_service_1.TravelExpenseService, cacheService_1.CacheService],
        exports: [travel_expense_service_1.TravelExpenseService],
    })
], TravelExpenseModule);
