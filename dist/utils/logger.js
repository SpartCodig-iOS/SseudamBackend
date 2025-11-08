"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = void 0;
const env_1 = require("../config/env");
const levelPriority = {
    error: 0,
    info: 1,
    debug: 2,
};
const resolveLevel = (value) => {
    if (!value)
        return 'info';
    const normalized = value.toLowerCase();
    return normalized in levelPriority ? normalized : 'info';
};
const activeLevel = resolveLevel(env_1.env.logLevel);
const shouldLog = (level) => levelPriority[level] <= levelPriority[activeLevel];
const serializeMeta = (meta) => {
    if (!meta || Object.keys(meta).length === 0) {
        return '';
    }
    try {
        return ` ${JSON.stringify(meta)}`;
    }
    catch (_error) {
        return ' [unserializable-metadata]';
    }
};
const write = (level, message, meta) => {
    if (!shouldLog(level))
        return;
    const timestamp = new Date().toISOString();
    const line = `[${timestamp}] ${level.toUpperCase()} ${message}${serializeMeta(meta)}`;
    if (level === 'error') {
        console.error(line);
    }
    else {
        console.log(line);
    }
};
exports.logger = {
    error: (message, meta) => write('error', message, meta),
    info: (message, meta) => write('info', message, meta),
    debug: (message, meta) => write('debug', message, meta),
    level: activeLevel,
};
