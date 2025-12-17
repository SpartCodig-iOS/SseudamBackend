"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TravelModule = void 0;
const common_1 = require("@nestjs/common");
const travel_controller_1 = require("./travel.controller");
const travel_service_1 = require("./travel.service");
const optimized_travel_service_1 = require("./optimized-travel.service");
const meta_module_1 = require("../meta/meta.module");
const profile_module_1 = require("../profile/profile.module");
const cacheService_1 = require("../../services/cacheService");
let TravelModule = class TravelModule {
};
exports.TravelModule = TravelModule;
exports.TravelModule = TravelModule = __decorate([
    (0, common_1.Module)({
        imports: [meta_module_1.MetaModule, profile_module_1.ProfileModule],
        controllers: [travel_controller_1.TravelController],
        providers: [travel_service_1.TravelService, optimized_travel_service_1.OptimizedTravelService, cacheService_1.CacheService],
        exports: [travel_service_1.TravelService, optimized_travel_service_1.OptimizedTravelService],
    })
], TravelModule);
