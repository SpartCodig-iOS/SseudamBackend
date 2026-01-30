"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.QueueModule = void 0;
const common_1 = require("@nestjs/common");
const bull_1 = require("@nestjs/bull");
const queue_constants_1 = require("../../common/constants/queue.constants");
const notification_processor_1 = require("./processors/notification.processor");
const settlement_processor_1 = require("./processors/settlement.processor");
const queue_event_service_1 = require("./services/queue-event.service");
let QueueModule = class QueueModule {
};
exports.QueueModule = QueueModule;
exports.QueueModule = QueueModule = __decorate([
    (0, common_1.Module)({
        imports: [
            // Redis 연결 설정 (환경변수 사용)
            bull_1.BullModule.forRoot({
                redis: {
                    host: process.env.REDIS_HOST || 'localhost',
                    port: parseInt(process.env.REDIS_PORT || '6379'),
                    password: process.env.REDIS_PASSWORD,
                    // Railway Redis의 경우 TLS 필요할 수 있음
                    ...(process.env.REDIS_TLS === 'true' && {
                        tls: {}
                    })
                },
            }),
            // 🎯 개별 Queue들 등록
            bull_1.BullModule.registerQueue({ name: queue_constants_1.QUEUES.NOTIFICATION }, { name: queue_constants_1.QUEUES.SETTLEMENT }, { name: queue_constants_1.QUEUES.EMAIL }, { name: queue_constants_1.QUEUES.ANALYTICS }),
        ],
        providers: [
            notification_processor_1.NotificationProcessor,
            settlement_processor_1.SettlementProcessor,
            queue_event_service_1.QueueEventService,
        ],
        exports: [queue_event_service_1.QueueEventService], // 다른 모듈에서 이벤트 발송할 수 있게
    })
], QueueModule);
