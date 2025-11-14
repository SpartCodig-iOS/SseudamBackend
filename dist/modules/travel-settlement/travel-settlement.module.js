"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TravelSettlementModule = void 0;
const common_1 = require("@nestjs/common");
const travel_settlement_controller_1 = require("./travel-settlement.controller");
const travel_settlement_service_1 = require("./travel-settlement.service");
let TravelSettlementModule = class TravelSettlementModule {
};
exports.TravelSettlementModule = TravelSettlementModule;
exports.TravelSettlementModule = TravelSettlementModule = __decorate([
    (0, common_1.Module)({
        controllers: [travel_settlement_controller_1.TravelSettlementController],
        providers: [travel_settlement_service_1.TravelSettlementService],
        exports: [travel_settlement_service_1.TravelSettlementService],
    })
], TravelSettlementModule);
