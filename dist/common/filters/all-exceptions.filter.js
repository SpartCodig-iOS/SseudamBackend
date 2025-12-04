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
Object.defineProperty(exports, "__esModule", { value: true });
exports.AllExceptionsFilter = void 0;
const common_1 = require("@nestjs/common");
const Sentry = __importStar(require("@sentry/node"));
const zod_1 = require("zod");
const logger_1 = require("../../utils/logger");
const env_1 = require("../../config/env");
const formatZodIssue = (issue) => ({
    path: issue.path,
    message: issue.message,
    code: issue.code,
    expected: 'expected' in issue ? issue.expected : undefined,
    received: 'received' in issue ? issue.received : undefined,
});
let AllExceptionsFilter = class AllExceptionsFilter {
    capture(exception) {
        if (!env_1.env.sentryDsn)
            return;
        Sentry.captureException(exception);
    }
    catch(exception, host) {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse();
        const normalizeDbError = (err) => {
            const code = err.code;
            // PostgreSQL 에러코드 매핑 (https://www.postgresql.org/docs/current/errcodes-appendix.html)
            if (code === '23505')
                return { status: common_1.HttpStatus.CONFLICT, message: '이미 존재하는 데이터입니다.' };
            if (code === '23503')
                return { status: common_1.HttpStatus.BAD_REQUEST, message: '관련된 데이터가 남아 있어 삭제/수정할 수 없습니다.' };
            if (code === '23514')
                return { status: common_1.HttpStatus.BAD_REQUEST, message: '데이터 제약 조건을 위반했습니다.' };
            return null;
        };
        if (exception instanceof zod_1.ZodError) {
            const issues = exception.issues.map(formatZodIssue);
            logger_1.logger.info('Validation failed', { issues });
            return response.status(common_1.HttpStatus.BAD_REQUEST).json({
                code: common_1.HttpStatus.BAD_REQUEST,
                message: '요청 데이터 형식이 올바르지 않습니다.',
                data: { errors: issues },
            });
        }
        if (exception instanceof common_1.HttpException) {
            const status = exception.getStatus();
            const res = exception.getResponse();
            const message = typeof res === 'string'
                ? res
                : typeof res === 'object' && 'message' in res
                    ? res.message || exception.message
                    : exception.message;
            const data = typeof res === 'object' && res && 'data' in res ? res.data : [];
            if (status >= 500) {
                logger_1.logger.error('Unhandled exception', { message, stack: exception.stack });
                this.capture(exception);
            }
            else {
                logger_1.logger.info('Handled error response', { status, message });
            }
            return response.status(status).json({
                code: status,
                data,
                message,
            });
        }
        const status = common_1.HttpStatus.INTERNAL_SERVER_ERROR;
        const message = exception?.message || 'Internal Server Error';
        // DB 에러라면 공통 매핑 시도
        if (exception?.code && exception?.severity) {
            const mapped = normalizeDbError(exception);
            if (mapped) {
                return response.status(mapped.status).json({
                    code: mapped.status,
                    data: [],
                    message: mapped.message,
                });
            }
        }
        logger_1.logger.error('Unhandled exception', { message, stack: exception?.stack });
        this.capture(exception);
        return response.status(status).json({
            code: status,
            data: [],
            message,
        });
    }
};
exports.AllExceptionsFilter = AllExceptionsFilter;
exports.AllExceptionsFilter = AllExceptionsFilter = __decorate([
    (0, common_1.Catch)()
], AllExceptionsFilter);
