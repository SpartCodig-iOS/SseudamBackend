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
var PushNotificationService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PushNotificationService = void 0;
const common_1 = require("@nestjs/common");
const event_emitter_1 = require("@nestjs/event-emitter");
const apns_service_1 = require("./apns.service");
const device_token_service_1 = require("./device-token.service");
let PushNotificationService = PushNotificationService_1 = class PushNotificationService {
    constructor(apnsService, deviceTokenService, eventEmitter) {
        this.apnsService = apnsService;
        this.deviceTokenService = deviceTokenService;
        this.eventEmitter = eventEmitter;
        this.logger = new common_1.Logger(PushNotificationService_1.name);
    }
    // 알림 템플릿들
    generateExpenseNotificationContent(event) {
        const formatAmount = (amount, currency) => {
            if (currency === 'KRW')
                return `${amount.toLocaleString()}원`;
            if (currency === 'JPY')
                return `${amount.toLocaleString()} JPY`;
            if (currency === 'USD')
                return `$${amount.toLocaleString()}`;
            return `${amount.toLocaleString()} ${currency}`;
        };
        switch (event.type) {
            case 'expense_added':
                return {
                    title: '새 지출이 추가되었습니다',
                    body: `${event.actorName}님이 "${event.expenseTitle}"을 추가했습니다${event.amount && event.currency ? ` (${formatAmount(event.amount, event.currency)})` : ''}`,
                };
            case 'expense_updated':
                return {
                    title: '지출이 수정되었습니다',
                    body: `${event.actorName}님이 "${event.expenseTitle}"을 수정했습니다`,
                };
            case 'expense_deleted':
                return {
                    title: '지출이 삭제되었습니다',
                    body: `${event.actorName}님이 "${event.expenseTitle}"을 삭제했습니다`,
                };
            default:
                return {
                    title: '지출 변경 알림',
                    body: `${event.actorName}님이 지출 내역을 변경했습니다`,
                };
        }
    }
    generateTravelNotificationContent(event) {
        switch (event.type) {
            case 'travel_updated':
                return {
                    title: '여행 정보가 수정되었습니다',
                    body: `${event.actorName}님이 "${event.travelTitle}" 정보를 수정했습니다`,
                };
            case 'travel_member_added':
                return {
                    title: '새 멤버가 추가되었습니다',
                    body: `"${event.travelTitle}"에 새 멤버가 추가되었습니다`,
                };
            case 'travel_member_removed':
                return {
                    title: '멤버가 여행에서 나갔습니다',
                    body: `"${event.travelTitle}"에서 멤버가 나갔습니다`,
                };
            default:
                return {
                    title: '여행 변경 알림',
                    body: `${event.actorName}님이 여행 정보를 변경했습니다`,
                };
        }
    }
    // 지출 관련 이벤트 리스너
    async handleExpenseAdded(event) {
        await this.sendNotificationToTravelMembers(event);
    }
    async handleExpenseUpdated(event) {
        await this.sendNotificationToTravelMembers(event);
    }
    async handleExpenseDeleted(event) {
        await this.sendNotificationToTravelMembers(event);
    }
    // 여행 관련 이벤트 리스너
    async handleTravelUpdated(event) {
        await this.sendNotificationToTravelMembers(event);
    }
    async handleTravelMemberAdded(event) {
        await this.sendNotificationToTravelMembers(event);
    }
    async handleTravelMemberRemoved(event) {
        await this.sendNotificationToTravelMembers(event);
    }
    // 실제 알림 전송 로직
    async sendNotificationToTravelMembers(event) {
        try {
            // 작업자 본인은 제외하고 다른 멤버들에게만 알림 전송
            const targetMemberIds = event.memberIds.filter(memberId => memberId !== event.actorUserId);
            if (targetMemberIds.length === 0) {
                this.logger.log('No target members for notification');
                return;
            }
            // 대상 멤버들의 디바이스 토큰 조회
            const deviceTokensByUser = await this.deviceTokenService.getActiveDeviceTokensForUsers(targetMemberIds);
            // 모든 디바이스 토큰 수집
            const allDeviceTokens = [];
            Object.values(deviceTokensByUser).forEach(tokens => {
                allDeviceTokens.push(...tokens);
            });
            if (allDeviceTokens.length === 0) {
                this.logger.log('No active device tokens found for notification');
                return;
            }
            // 알림 내용 생성
            const notificationContent = 'expenseTitle' in event
                ? this.generateExpenseNotificationContent(event)
                : this.generateTravelNotificationContent(event);
            // 알림 데이터 추가 (딥링크용)
            const notificationData = {
                type: event.type,
                travelId: event.travelId,
                actorUserId: event.actorUserId,
                deepLink: `sseudam://travel/${event.travelId}`,
            };
            // 배치 전송
            const result = await this.apnsService.sendNotificationToMultiple(allDeviceTokens, notificationContent.title, notificationContent.body, notificationData);
            this.logger.log(`Notification sent: ${result.success} success, ${result.failed} failed`, {
                eventType: event.type,
                travelId: event.travelId,
                targetMemberCount: targetMemberIds.length,
                deviceTokenCount: allDeviceTokens.length,
            });
        }
        catch (error) {
            this.logger.error('Failed to send notification to travel members', {
                error: error instanceof Error ? error.message : String(error),
                eventType: event.type,
                travelId: event.travelId,
            });
        }
    }
    // 수동으로 알림 발송하는 헬퍼 메서드들
    async sendExpenseNotification(type, travelId, actorUserId, actorName, expenseTitle, memberIds, amount, currency) {
        this.eventEmitter.emit(`expense.${type.replace('expense_', '')}`, {
            type,
            travelId,
            actorUserId,
            actorName,
            expenseTitle,
            amount,
            currency,
            memberIds,
        });
    }
    async sendTravelNotification(type, travelId, actorUserId, actorName, travelTitle, memberIds) {
        this.eventEmitter.emit(`travel.${type.replace('travel_', '')}`, {
            type,
            travelId,
            actorUserId,
            actorName,
            travelTitle,
            memberIds,
        });
    }
};
exports.PushNotificationService = PushNotificationService;
__decorate([
    (0, event_emitter_1.OnEvent)('expense.added'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], PushNotificationService.prototype, "handleExpenseAdded", null);
__decorate([
    (0, event_emitter_1.OnEvent)('expense.updated'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], PushNotificationService.prototype, "handleExpenseUpdated", null);
__decorate([
    (0, event_emitter_1.OnEvent)('expense.deleted'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], PushNotificationService.prototype, "handleExpenseDeleted", null);
__decorate([
    (0, event_emitter_1.OnEvent)('travel.updated'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], PushNotificationService.prototype, "handleTravelUpdated", null);
__decorate([
    (0, event_emitter_1.OnEvent)('travel.member_added'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], PushNotificationService.prototype, "handleTravelMemberAdded", null);
__decorate([
    (0, event_emitter_1.OnEvent)('travel.member_removed'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], PushNotificationService.prototype, "handleTravelMemberRemoved", null);
exports.PushNotificationService = PushNotificationService = PushNotificationService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [apns_service_1.APNSService,
        device_token_service_1.DeviceTokenService,
        event_emitter_1.EventEmitter2])
], PushNotificationService);
