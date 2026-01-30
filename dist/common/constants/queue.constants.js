"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.JOB_PRIORITY = exports.DEFAULT_JOB_OPTIONS = exports.JOB_TYPES = exports.QUEUES = void 0;
// 🎯 Queue 이름 상수들
exports.QUEUES = {
    NOTIFICATION: 'notification',
    SETTLEMENT: 'settlement',
    EMAIL: 'email',
    ANALYTICS: 'analytics'
};
// 🎯 작업 타입 상수들
exports.JOB_TYPES = {
    // Notification Jobs
    SEND_PUSH_NOTIFICATION: 'send-push-notification',
    SEND_TRAVEL_INVITE: 'send-travel-invite',
    SEND_EXPENSE_NOTIFICATION: 'send-expense-notification',
    // Settlement Jobs
    RECALCULATE_SETTLEMENT: 'recalculate-settlement',
    UPDATE_BUDGET_STATUS: 'update-budget-status',
    // Email Jobs
    SEND_WELCOME_EMAIL: 'send-welcome-email',
    SEND_SUMMARY_EMAIL: 'send-summary-email',
    // Analytics Jobs
    TRACK_USER_EVENT: 'track-user-event',
    UPDATE_TRAVEL_STATS: 'update-travel-stats'
};
// 🎯 Job 옵션 기본값들
exports.DEFAULT_JOB_OPTIONS = {
    // 실패시 3번 재시도, 지수 백오프
    attempts: 3,
    backoff: {
        type: 'exponential',
        delay: 2000,
    },
    removeOnComplete: 50, // 완료된 작업 50개까지 보관
    removeOnFail: 20, // 실패한 작업 20개까지 보관
};
// 🎯 우선순위 레벨
exports.JOB_PRIORITY = {
    CRITICAL: 1, // 즉시 처리 (푸시 알림)
    HIGH: 5, // 높음 (정산 계산)
    NORMAL: 10, // 보통 (이메일)
    LOW: 20, // 낮음 (분석)
};
