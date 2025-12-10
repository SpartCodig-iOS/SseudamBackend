"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var APNSService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.APNSService = void 0;
const common_1 = require("@nestjs/common");
const apn = __importStar(require("apn"));
const env_1 = require("../config/env");
let APNSService = APNSService_1 = class APNSService {
    constructor() {
        this.logger = new common_1.Logger(APNSService_1.name);
        this.apnProvider = null;
        this.initializeAPNS();
    }
    initializeAPNS() {
        try {
            if (!env_1.env.applePrivateKey || !env_1.env.appleKeyId || !env_1.env.appleTeamId) {
                this.logger.warn('APNS configuration missing. Push notifications will be disabled.');
                return;
            }
            // 환경변수에 literal "\n" 이 포함된 경우 실제 개행으로 치환
            const normalizedKey = env_1.env.applePrivateKey.includes('\\n')
                ? env_1.env.applePrivateKey.replace(/\\n/g, '\n')
                : env_1.env.applePrivateKey;
            // APNS Auth Key 방식으로 초기화
            const useProduction = env_1.env.appleApnsProduction ?? env_1.env.nodeEnv === 'production';
            this.apnProvider = new apn.Provider({
                token: {
                    key: normalizedKey, // 환경변수에서 개인 키 로드
                    keyId: env_1.env.appleKeyId,
                    teamId: env_1.env.appleTeamId,
                },
                production: useProduction, // 프로덕션 여부 환경변수로 제어
            });
            this.logger.log(`APNS initialized successfully (Production: ${useProduction})`);
        }
        catch (error) {
            this.logger.error('Failed to initialize APNS', error);
            this.apnProvider = null;
        }
    }
    async sendNotification(notification) {
        const result = await this.sendNotificationWithResult(notification);
        return result.success;
    }
    async sendNotificationWithResult(notification) {
        if (!this.apnProvider) {
            this.logger.warn('APNS not configured. Skipping notification send.');
            return { success: false, reason: 'APNS_NOT_CONFIGURED' };
        }
        try {
            const note = new apn.Notification();
            // 알림 내용 설정
            note.alert = {
                title: notification.title,
                body: notification.body,
            };
            // 배지 설정 (선택적)
            if (notification.badge !== undefined) {
                note.badge = notification.badge;
            }
            // 사운드 설정 (기본값: default)
            note.sound = notification.sound || 'default';
            // 커스텀 데이터 설정
            if (notification.data) {
                note.payload = notification.data;
            }
            // 만료 시간 설정 (1일)
            note.expiry = Math.floor(Date.now() / 1000) + 24 * 60 * 60;
            // 높은 우선순위로 설정
            note.priority = 10;
            // APNS 토픽 설정 (번들 ID)
            note.topic = env_1.env.appleBundleId || 'io.sseudam.co';
            // 알림 전송
            this.logger.debug(`Sending APNS notification to ${notification.deviceToken.substring(0, 8)}... with topic: ${note.topic}`);
            const result = await this.apnProvider.send(note, notification.deviceToken);
            this.logger.debug('APNS send result:', {
                sent: result.sent?.length || 0,
                failed: result.failed?.length || 0,
                deviceToken: notification.deviceToken.substring(0, 8)
            });
            if (result.sent && result.sent.length > 0) {
                this.logger.log(`APNS notification sent successfully to ${notification.deviceToken.substring(0, 8)}...`);
                return { success: true };
            }
            else if (result.failed && result.failed.length > 0) {
                const failure = result.failed[0];
                const reason = failure?.response?.reason ||
                    (failure?.status ? `status_${failure.status}` : undefined) ||
                    (failure?.error instanceof Error ? failure.error.message : String(failure?.error ?? 'unknown_error'));
                this.logger.error(`APNS notification failed: ${reason}`, {
                    deviceToken: notification.deviceToken.substring(0, 8),
                    status: failure.status,
                    response: failure.response,
                    device: failure.device
                });
                return { success: false, reason, detail: failure };
            }
            this.logger.warn('APNS result is unclear', { result });
            return { success: false, reason: 'UNKNOWN_RESULT', detail: result };
        }
        catch (error) {
            this.logger.error('Error sending APNS notification', {
                error: error instanceof Error ? error.message : String(error),
                deviceToken: notification.deviceToken.substring(0, 8),
            });
            return { success: false, reason: error instanceof Error ? error.message : String(error) };
        }
    }
    async sendNotificationToMultiple(deviceTokens, title, body, data) {
        if (!this.apnProvider || deviceTokens.length === 0) {
            return { success: 0, failed: 0 };
        }
        let success = 0;
        let failed = 0;
        // 병렬로 여러 디바이스에 전송
        const promises = deviceTokens.map(async (deviceToken) => {
            const result = await this.sendNotification({
                deviceToken,
                title,
                body,
                data,
            });
            return result ? 'success' : 'failed';
        });
        const results = await Promise.allSettled(promises);
        results.forEach((result) => {
            if (result.status === 'fulfilled' && result.value === 'success') {
                success++;
            }
            else {
                failed++;
            }
        });
        this.logger.log(`Batch APNS notification completed: ${success} success, ${failed} failed`);
        return { success, failed };
    }
    async shutdown() {
        if (this.apnProvider) {
            this.apnProvider.shutdown();
            this.logger.log('APNS provider shutdown');
        }
    }
};
exports.APNSService = APNSService;
exports.APNSService = APNSService = APNSService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [])
], APNSService);
