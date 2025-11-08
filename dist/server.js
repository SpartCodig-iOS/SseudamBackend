"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// ✅ IPv4 우선 설정 추가 (맨 위에만 추가)
const node_dns_1 = __importDefault(require("node:dns"));
node_dns_1.default.setDefaultResultOrder('ipv4first');
const app_1 = __importDefault(require("./app"));
const env_1 = require("./config/env");
const logger_1 = require("./utils/logger");
const start = async () => {
    try {
        app_1.default.listen(env_1.env.port, () => {
            logger_1.logger.info('Server listening', { port: env_1.env.port, env: env_1.env.nodeEnv });
        });
    }
    catch (error) {
        logger_1.logger.error('Failed to start server', { error: error?.message });
        process.exit(1);
    }
};
start();
