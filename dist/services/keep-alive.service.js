"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var KeepAliveService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.KeepAliveService = void 0;
const common_1 = require("@nestjs/common");
const env_1 = require("../config/env");
let KeepAliveService = KeepAliveService_1 = class KeepAliveService {
    constructor() {
        this.logger = new common_1.Logger(KeepAliveService_1.name);
        this.heartbeat = null;
        this.intervalMs = 55000;
    }
    onModuleInit() {
        if (!env_1.env.appBaseUrl) {
            this.logger.warn('App base URL missing, keep-alive ping disabled');
            return;
        }
        this.triggerPing();
        this.heartbeat = setInterval(() => this.triggerPing(), this.intervalMs);
    }
    onModuleDestroy() {
        if (this.heartbeat) {
            clearInterval(this.heartbeat);
            this.heartbeat = null;
        }
    }
    async triggerPing() {
        const target = `${env_1.env.appBaseUrl.replace(/\/$/, '')}/health?keepalive=1`;
        try {
            await fetch(target, { method: 'GET' });
        }
        catch (error) {
            this.logger.debug(`KeepAlive ping failed (${target}): ${error.message}`);
        }
    }
};
exports.KeepAliveService = KeepAliveService;
exports.KeepAliveService = KeepAliveService = KeepAliveService_1 = __decorate([
    (0, common_1.Injectable)()
], KeepAliveService);
