"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = void 0;
const zod_1 = require("zod");
const logger_1 = require("../utils/logger");
const formatZodIssue = (issue) => ({
    path: issue.path,
    message: issue.message,
    code: issue.code,
    expected: 'expected' in issue ? issue.expected : undefined,
    received: 'received' in issue ? issue.received : undefined,
});
const errorHandler = (err, _req, res, _next) => {
    if (err instanceof zod_1.ZodError) {
        const issues = err.issues.map(formatZodIssue);
        logger_1.logger.info('Validation failed', { issues });
        return res.status(400).json({
            code: 400,
            message: '요청 데이터 형식이 올바르지 않습니다.',
            data: { errors: issues },
        });
    }
    const status = err.status || err.statusCode || 500;
    const message = err.message || 'Internal Server Error';
    if (status >= 500) {
        logger_1.logger.error('Unhandled exception', { message, stack: err?.stack });
    }
    else {
        logger_1.logger.info('Handled error response', { status, message });
    }
    res.status(status).json({ code: status, data: [], message });
};
exports.errorHandler = errorHandler;
