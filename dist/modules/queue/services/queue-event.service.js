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
var QueueEventService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.QueueEventService = void 0;
const common_1 = require("@nestjs/common");
const bull_1 = require("@nestjs/bull");
const queue_constants_1 = require("../../../common/constants/queue.constants");
let QueueEventService = QueueEventService_1 = class QueueEventService {
    constructor(notificationQueue, settlementQueue, analyticsQueue) {
        this.notificationQueue = notificationQueue;
        this.settlementQueue = settlementQueue;
        this.analyticsQueue = analyticsQueue;
        this.logger = new common_1.Logger(QueueEventService_1.name);
    }
    // 🎯 여행 생성 이벤트 - 백그라운드 알림 발송
    async emitTravelCreated(event) {
        try {
            // 🔥 기존 로직에는 영향 없이 백그라운드에서만 알림 처리
            await this.notificationQueue.add(queue_constants_1.JOB_TYPES.SEND_PUSH_NOTIFICATION, {
                userIds: [event.ownerId],
                title: '🎉 여행이 생성되었습니다!',
                body: `"${event.title}" 여행이 성공적으로 생성되었습니다.`,
                data: {
                    type: 'travel_created',
                    travelId: event.travelId,
                }
            }, {
                ...queue_constants_1.DEFAULT_JOB_OPTIONS,
                priority: queue_constants_1.JOB_PRIORITY.HIGH,
                delay: 1000, // 1초 후 발송 (API 응답 후)
            });
            this.logger.log(`✅ Travel created event queued: ${event.travelId}`);
        }
        catch (error) {
            // 🚨 Queue 실패해도 기존 로직에는 영향 없음
            this.logger.error(`❌ Failed to queue travel created event: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    // 🎯 멤버 초대 이벤트 - 백그라운드 알림 발송
    async emitMemberInvited(event) {
        try {
            await this.notificationQueue.add(queue_constants_1.JOB_TYPES.SEND_TRAVEL_INVITE, {
                userIds: [event.invitedUserId],
                title: '✈️ 여행에 초대되었습니다!',
                body: `${event.invitedByName}님이 "${event.travelTitle}" 여행에 초대했습니다.`,
                data: {
                    type: 'travel_invite',
                    travelId: event.travelId,
                    inviteCode: event.inviteCode,
                }
            }, {
                ...queue_constants_1.DEFAULT_JOB_OPTIONS,
                priority: queue_constants_1.JOB_PRIORITY.CRITICAL, // 즉시 발송
            });
            this.logger.log(`✅ Member invite event queued: ${event.travelId} -> ${event.invitedUserId}`);
        }
        catch (error) {
            this.logger.error(`❌ Failed to queue member invite event: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    // 🎯 경비 추가 이벤트 - 백그라운드 정산 재계산 + 알림
    async emitExpenseAdded(event) {
        try {
            // 1️⃣ 정산 재계산 (우선순위 높음)
            await this.settlementQueue.add(queue_constants_1.JOB_TYPES.RECALCULATE_SETTLEMENT, {
                travelId: event.travelId,
                triggeredBy: 'expense_added',
                triggerDetails: {
                    expenseId: event.expenseId,
                    amount: event.convertedAmount,
                }
            }, {
                ...queue_constants_1.DEFAULT_JOB_OPTIONS,
                priority: queue_constants_1.JOB_PRIORITY.HIGH,
                delay: 500, // 0.5초 후 처리
            });
            // 2️⃣ 참여자들에게 알림 (약간 늦게)
            if (event.participantIds.length > 1) { // 본인 외에 다른 참여자가 있을 때만
                await this.notificationQueue.add(queue_constants_1.JOB_TYPES.SEND_EXPENSE_NOTIFICATION, {
                    userIds: event.participantIds.filter(id => id !== event.payerId), // 결제자 제외
                    title: '💰 새로운 경비가 등록되었습니다',
                    body: `${event.payerName}님이 "${event.title}" 경비를 등록했습니다. (${event.convertedAmount.toLocaleString()}원)`,
                    data: {
                        type: 'expense_added',
                        travelId: event.travelId,
                        expenseId: event.expenseId,
                    }
                }, {
                    ...queue_constants_1.DEFAULT_JOB_OPTIONS,
                    priority: queue_constants_1.JOB_PRIORITY.NORMAL,
                    delay: 2000, // 2초 후 발송 (정산 재계산 후)
                });
            }
            this.logger.log(`✅ Expense added event queued: ${event.expenseId}`);
        }
        catch (error) {
            this.logger.error(`❌ Failed to queue expense added event: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    // 🎯 예산 상태 업데이트 이벤트
    async emitBudgetStatusUpdate(travelId, totalSpent, budget) {
        if (!budget)
            return; // 예산이 설정되지 않은 경우 스킵
        try {
            const budgetUsagePercent = (totalSpent / budget) * 100;
            // 🚨 예산 80% 초과시 알림
            if (budgetUsagePercent >= 80) {
                await this.settlementQueue.add(queue_constants_1.JOB_TYPES.UPDATE_BUDGET_STATUS, {
                    travelId,
                    totalSpent,
                    budget,
                    usagePercent: budgetUsagePercent,
                }, {
                    ...queue_constants_1.DEFAULT_JOB_OPTIONS,
                    priority: queue_constants_1.JOB_PRIORITY.HIGH,
                });
            }
            this.logger.log(`✅ Budget status event queued: ${travelId} (${budgetUsagePercent.toFixed(1)}%)`);
        }
        catch (error) {
            this.logger.error(`❌ Failed to queue budget status event: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    // 🎯 사용자 활동 추적 (분석용)
    async trackUserActivity(userId, action, metadata) {
        try {
            await this.analyticsQueue.add(queue_constants_1.JOB_TYPES.TRACK_USER_EVENT, {
                userId,
                action,
                metadata,
                timestamp: new Date().toISOString(),
            }, {
                ...queue_constants_1.DEFAULT_JOB_OPTIONS,
                priority: queue_constants_1.JOB_PRIORITY.LOW, // 가장 낮은 우선순위
                delay: 5000, // 5초 후 처리
            });
        }
        catch (error) {
            // 분석 실패는 로그만 남기고 무시
            this.logger.error(`❌ Failed to track user activity: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
};
exports.QueueEventService = QueueEventService;
exports.QueueEventService = QueueEventService = QueueEventService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, bull_1.InjectQueue)(queue_constants_1.QUEUES.NOTIFICATION)),
    __param(1, (0, bull_1.InjectQueue)(queue_constants_1.QUEUES.SETTLEMENT)),
    __param(2, (0, bull_1.InjectQueue)(queue_constants_1.QUEUES.ANALYTICS)),
    __metadata("design:paramtypes", [Object, Object, Object])
], QueueEventService);
