"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requestLogger = void 0;
const logger_1 = require("../utils/logger");
const toMilliseconds = (start) => {
    const diff = Number(process.hrtime.bigint() - start);
    return Math.round((diff / 1000000) * 100) / 100;
};
const requestLogger = (req, res, next) => {
    const start = process.hrtime.bigint();
    logger_1.logger.debug('Request started', { method: req.method, path: req.originalUrl });
    res.on('finish', () => {
        const durationMs = toMilliseconds(start);
        const meta = {
            method: req.method,
            path: req.originalUrl,
            status: res.statusCode,
            durationMs,
        };
        if (res.statusCode >= 500) {
            logger_1.logger.error('Request failed', meta);
            return;
        }
        if (res.statusCode >= 400) {
            logger_1.logger.info('Request completed with client error', meta);
            return;
        }
        logger_1.logger.info('Request completed', meta);
    });
    next();
};
exports.requestLogger = requestLogger;
