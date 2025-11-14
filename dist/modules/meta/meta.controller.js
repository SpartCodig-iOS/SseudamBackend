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
exports.MetaController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const api_1 = require("../../types/api");
const meta_service_1 = require("./meta.service");
const country_meta_dto_1 = require("./dto/country-meta.dto");
const exchange_rate_dto_1 = require("./dto/exchange-rate.dto");
let MetaController = class MetaController {
    constructor(metaService) {
        this.metaService = metaService;
    }
    async getCountries() {
        const countries = await this.metaService.getCountries();
        return (0, api_1.success)(countries);
    }
    async getExchangeRate(baseCurrency, quoteCurrency) {
        if (!baseCurrency || baseCurrency.length !== 3) {
            throw new common_1.BadRequestException('base 파라미터는 3자리 통화 코드여야 합니다.');
        }
        if (!quoteCurrency || quoteCurrency.length !== 3) {
            throw new common_1.BadRequestException('quote 파라미터는 3자리 통화 코드여야 합니다.');
        }
        const rate = await this.metaService.getExchangeRate(baseCurrency, quoteCurrency, 1000);
        return (0, api_1.success)(rate);
    }
};
exports.MetaController = MetaController;
__decorate([
    (0, common_1.Get)('countries'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: '국가/통화 메타 데이터 조회' }),
    (0, swagger_1.ApiOkResponse)({ type: country_meta_dto_1.CountryMetaDto, isArray: true }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], MetaController.prototype, "getCountries", null);
__decorate([
    (0, common_1.Get)('exchange-rate'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: '통화 환율 조회 (Frankfurter API)' }),
    (0, swagger_1.ApiOkResponse)({ type: exchange_rate_dto_1.ExchangeRateDto }),
    __param(0, (0, common_1.Query)('base')),
    __param(1, (0, common_1.Query)('quote')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], MetaController.prototype, "getExchangeRate", null);
exports.MetaController = MetaController = __decorate([
    (0, swagger_1.ApiTags)('Meta'),
    (0, common_1.Controller)('api/v1/meta'),
    __metadata("design:paramtypes", [meta_service_1.MetaService])
], MetaController);
