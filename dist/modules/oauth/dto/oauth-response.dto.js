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
exports.SocialLookupResponseDto = exports.SocialLookupResponseDataDto = void 0;
const swagger_1 = require("@nestjs/swagger");
class SocialLookupResponseDataDto {
}
exports.SocialLookupResponseDataDto = SocialLookupResponseDataDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: true }),
    __metadata("design:type", Boolean)
], SocialLookupResponseDataDto.prototype, "registered", void 0);
class SocialLookupResponseDto {
}
exports.SocialLookupResponseDto = SocialLookupResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 200 }),
    __metadata("design:type", Number)
], SocialLookupResponseDto.prototype, "code", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'Lookup successful' }),
    __metadata("design:type", String)
], SocialLookupResponseDto.prototype, "message", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: SocialLookupResponseDataDto }),
    __metadata("design:type", SocialLookupResponseDataDto)
], SocialLookupResponseDto.prototype, "data", void 0);
