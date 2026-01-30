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
var NotificationProcessor_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationProcessor = void 0;
const bull_1 = require("@nestjs/bull");
const common_1 = require("@nestjs/common");
const queue_constants_1 = require("../../../common/constants/queue.constants");
let NotificationProcessor = NotificationProcessor_1 = class NotificationProcessor {
    constructor() {
        this.logger = new common_1.Logger(NotificationProcessor_1.name);
    }
    async sendPushNotification(job) {
        const { userIds, title, body, data, badge } = job.data;
        try {
            this.logger.log(`🔥 [BACKGROUND] Sending push notification to ${userIds.length} users: ${title}`);
            // 🚀 TODO: 실제 푸시 알림 서비스 연동 (FCM, APNS 등)
            // await this.fcmService.sendToUsers(userIds, { title, body, data, badge });
            // 🎯 현재는 로그만 출력 (나중에 실제 푸시 서비스 연동)
            for (const userId of userIds) {
                this.logger.log(`📱 Push notification sent to user ${userId}: ${title}`);
            }
            // 🎉 성공 메트릭 기록
            this.logger.log(`✅ Push notification job completed for ${userIds.length} users`);
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.logger.error(`❌ Failed to send push notification: ${errorMessage}`, error instanceof Error ? error.stack : undefined);
            throw error; // Bull이 재시도 할 수 있게 에러 던지기
        }
    }
    async sendTravelInviteNotification(job) {
        const { userIds, title, body, data } = job.data;
        try {
            this.logger.log(`🔥 [BACKGROUND] Sending travel invite notification to ${userIds.length} users`);
            // 🚀 여행 초대 특별 알림 처리
            for (const userId of userIds) {
                // 실제 푸시 알림 + 앱내 알림 저장
                // await this.fcmService.sendHighPriorityNotification(userId, { title, body, data });
                // await this.inAppNotificationService.create(userId, { title, body, type: 'travel_invite' });
                this.logger.log(`📨 Travel invite notification sent to user ${userId}`);
            }
            this.logger.log(`✅ Travel invite notification job completed`);
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.logger.error(`❌ Failed to send travel invite notification: ${errorMessage}`, error instanceof Error ? error.stack : undefined);
            throw error;
        }
    }
    async sendExpenseNotification(job) {
        const { userIds, title, body, data } = job.data;
        try {
            this.logger.log(`🔥 [BACKGROUND] Sending expense notification to ${userIds.length} users`);
            // 🚀 경비 알림 특별 처리 (배지 업데이트 포함)
            for (const userId of userIds) {
                // await this.fcmService.sendWithBadgeUpdate(userId, { title, body, data });
                this.logger.log(`💰 Expense notification sent to user ${userId}`);
            }
            this.logger.log(`✅ Expense notification job completed`);
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.logger.error(`❌ Failed to send expense notification: ${errorMessage}`, error instanceof Error ? error.stack : undefined);
            throw error;
        }
    }
};
exports.NotificationProcessor = NotificationProcessor;
__decorate([
    (0, bull_1.Process)(queue_constants_1.JOB_TYPES.SEND_PUSH_NOTIFICATION),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], NotificationProcessor.prototype, "sendPushNotification", null);
__decorate([
    (0, bull_1.Process)(queue_constants_1.JOB_TYPES.SEND_TRAVEL_INVITE),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], NotificationProcessor.prototype, "sendTravelInviteNotification", null);
__decorate([
    (0, bull_1.Process)(queue_constants_1.JOB_TYPES.SEND_EXPENSE_NOTIFICATION),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], NotificationProcessor.prototype, "sendExpenseNotification", null);
exports.NotificationProcessor = NotificationProcessor = NotificationProcessor_1 = __decorate([
    (0, bull_1.Processor)(queue_constants_1.QUEUES.NOTIFICATION)
], NotificationProcessor);
