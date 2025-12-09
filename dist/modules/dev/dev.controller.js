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
exports.DevController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const jwtService_1 = require("../../services/jwtService");
const apns_service_1 = require("../../services/apns.service");
const device_token_service_1 = require("../../services/device-token.service");
const api_1 = require("../../types/api");
const crypto_1 = require("crypto");
// 개발 환경이 아니면 이 컨트롤러를 완전히 숨김
let DevController = class DevController {
    constructor(jwtService, apnsService, deviceTokenService) {
        this.jwtService = jwtService;
        this.apnsService = apnsService;
        this.deviceTokenService = deviceTokenService;
    }
    async generateInfiniteToken(body) {
        // 임시로 모든 환경에서 허용 (TODO: 나중에 제거 예정)
        // if (env.nodeEnv !== 'development') {
        //   throw new ForbiddenException('This endpoint is only available in development environment');
        // }
        // 하드코딩된 테스트 계정 확인
        if (body.id !== 'test' || body.password !== 'test123!') {
            throw new common_1.BadRequestException('Invalid test credentials');
        }
        // 테스트용 가짜 유저 데이터
        const testUser = {
            id: 'e11cc73b-052d-4740-8213-999c05bfc332', // 실제 DB에 있는 테스트 사용자 ID
            email: 'test@example.com',
            password_hash: 'fake-hash',
            name: '테스트 사용자',
            avatar_url: null,
            username: 'testuser',
            role: 'user',
            created_at: new Date(),
            updated_at: new Date(),
        };
        const sessionId = (0, crypto_1.randomUUID)();
        const infiniteToken = this.jwtService.generateInfiniteToken(testUser, sessionId);
        return (0, api_1.success)({
            accessToken: infiniteToken,
            user: {
                id: testUser.id,
                email: testUser.email,
                name: testUser.name,
                role: testUser.role,
            },
        }, 'Infinite token generated for testing');
    }
    async testPushNotification(body) {
        try {
            // 디바이스 토큰 유효성 검사
            if (!body.deviceToken || body.deviceToken.length < 60) {
                throw new common_1.BadRequestException('Invalid device token format');
            }
            if (!body.title || !body.body) {
                throw new common_1.BadRequestException('Title and body are required');
            }
            // APNS로 직접 푸시 알림 전송
            const result = await this.apnsService.sendNotification({
                deviceToken: body.deviceToken,
                title: body.title,
                body: body.body,
                data: {
                    type: 'test',
                    testTime: new Date().toISOString(),
                    ...body.data
                },
                badge: body.badge,
                sound: body.sound || 'default'
            });
            return (0, api_1.success)({
                success: result,
                deviceToken: `${body.deviceToken.substring(0, 8)}...`,
                result: result ? 'Notification sent successfully' : 'Notification failed to send',
                timestamp: new Date().toISOString()
            }, 'Push notification test completed');
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            return (0, api_1.success)({
                success: false,
                deviceToken: `${body.deviceToken.substring(0, 8)}...`,
                result: `Error: ${errorMessage}`,
                timestamp: new Date().toISOString()
            }, 'Push notification test failed');
        }
    }
    async registerTestDevice(body) {
        try {
            if (!body.userId || !body.deviceToken) {
                throw new common_1.BadRequestException('userId and deviceToken are required');
            }
            // 디바이스 토큰 등록
            await this.deviceTokenService.upsertDeviceToken(body.userId, body.deviceToken);
            return (0, api_1.success)({
                userId: body.userId,
                deviceToken: `${body.deviceToken.substring(0, 8)}...`,
                registered: true
            }, 'Test device token registered successfully');
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            return (0, api_1.success)({
                userId: body.userId,
                deviceToken: `${body.deviceToken.substring(0, 8)}...`,
                registered: false,
                error: errorMessage
            }, 'Failed to register test device token');
        }
    }
};
exports.DevController = DevController;
__decorate([
    (0, common_1.Post)('infinite-token'),
    (0, swagger_1.ApiOperation)({
        summary: '개발용 무한토큰 생성',
        description: '개발 환경에서만 사용 가능한 테스트용 무한토큰 생성'
    }),
    (0, swagger_1.ApiBody)({
        schema: {
            type: 'object',
            required: ['id', 'password'],
            properties: {
                id: { type: 'string', example: 'test' },
                password: { type: 'string', example: 'test123!' },
            },
        },
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '무한토큰 생성 성공',
        schema: {
            type: 'object',
            properties: {
                code: { type: 'number', example: 200 },
                message: { type: 'string', example: 'Infinite token generated' },
                data: {
                    type: 'object',
                    properties: {
                        accessToken: { type: 'string', example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' },
                        user: {
                            type: 'object',
                            properties: {
                                id: { type: 'string' },
                                email: { type: 'string' },
                                name: { type: 'string' },
                                role: { type: 'string' },
                            },
                        },
                    },
                },
            },
        },
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], DevController.prototype, "generateInfiniteToken", null);
__decorate([
    (0, common_1.Post)('test-push-notification'),
    (0, swagger_1.ApiOperation)({
        summary: '푸시 알림 테스트',
        description: '실제 디바이스 토큰으로 푸시 알림을 테스트할 수 있는 API'
    }),
    (0, swagger_1.ApiBody)({
        schema: {
            type: 'object',
            required: ['deviceToken', 'title', 'body'],
            properties: {
                deviceToken: {
                    type: 'string',
                    example: 'fe13ccdb7ea3fe314f0df403383b7d5d974dd0f946cd4b89b0f1fd7523dc9a07',
                    description: '실제 iOS 디바이스 토큰 (64자리 hex 문자열)'
                },
                title: {
                    type: 'string',
                    example: '테스트 알림',
                    description: '푸시 알림 제목'
                },
                body: {
                    type: 'string',
                    example: '이것은 푸시 알림 테스트입니다!',
                    description: '푸시 알림 내용'
                },
                data: {
                    type: 'object',
                    description: '추가 데이터 (선택사항)',
                    properties: {
                        type: { type: 'string', example: 'test' },
                        travelId: { type: 'string', example: 'fbde676c-4cad-4f6d-bede-93c58565b301' }
                    }
                },
                badge: {
                    type: 'number',
                    example: 1,
                    description: '앱 아이콘 배지 숫자 (선택사항)'
                },
                sound: {
                    type: 'string',
                    example: 'default',
                    description: '알림 사운드 (선택사항)'
                }
            },
        },
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '푸시 알림 테스트 성공',
        schema: {
            type: 'object',
            properties: {
                code: { type: 'number', example: 200 },
                message: { type: 'string', example: 'Push notification test completed' },
                data: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean', example: true },
                        deviceToken: { type: 'string', example: 'fe13ccdb...' },
                        result: { type: 'string', example: 'Notification sent successfully' }
                    },
                },
            },
        },
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], DevController.prototype, "testPushNotification", null);
__decorate([
    (0, common_1.Post)('register-test-device'),
    (0, swagger_1.ApiOperation)({
        summary: '테스트 디바이스 토큰 등록',
        description: '특정 사용자에게 테스트용 디바이스 토큰을 등록하는 API'
    }),
    (0, swagger_1.ApiBody)({
        schema: {
            type: 'object',
            required: ['userId', 'deviceToken'],
            properties: {
                userId: {
                    type: 'string',
                    example: 'e11cc73b-052d-4740-8213-999c05bfc332',
                    description: '사용자 ID'
                },
                deviceToken: {
                    type: 'string',
                    example: 'fe13ccdb7ea3fe314f0df403383b7d5d974dd0f946cd4b89b0f1fd7523dc9a07',
                    description: '실제 iOS 디바이스 토큰'
                }
            },
        },
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], DevController.prototype, "registerTestDevice", null);
exports.DevController = DevController = __decorate([
    (0, swagger_1.ApiExcludeController)(),
    (0, swagger_1.ApiTags)('Development'),
    (0, common_1.Controller)('api/v1/dev'),
    __metadata("design:paramtypes", [jwtService_1.JwtTokenService,
        apns_service_1.APNSService,
        device_token_service_1.DeviceTokenService])
], DevController);
