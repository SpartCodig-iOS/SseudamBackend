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
exports.CountryMetaDto = void 0;
const swagger_1 = require("@nestjs/swagger");
class CountryMetaDto {
}
exports.CountryMetaDto = CountryMetaDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'KR' }),
    __metadata("design:type", String)
], CountryMetaDto.prototype, "code", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '대한민국' }),
    __metadata("design:type", String)
], CountryMetaDto.prototype, "nameKo", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'South Korea' }),
    __metadata("design:type", String)
], CountryMetaDto.prototype, "nameEn", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: [String], example: ['KRW'] }),
    __metadata("design:type", Array)
], CountryMetaDto.prototype, "currencies", void 0);
