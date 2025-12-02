"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var BackgroundJobService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.BackgroundJobService = void 0;
const common_1 = require("@nestjs/common");
let BackgroundJobService = BackgroundJobService_1 = class BackgroundJobService {
    constructor() {
        this.logger = new common_1.Logger(BackgroundJobService_1.name);
        this.concurrency = 2;
        this.active = 0;
        this.queue = [];
    }
    enqueue(name, handler, options) {
        const job = {
            name,
            handler,
            retries: options?.retries ?? 1,
            backoffMs: options?.backoffMs ?? 300,
        };
        this.queue.push(job);
        void this.processNext();
    }
    async processNext() {
        if (this.active >= this.concurrency || this.queue.length === 0) {
            return;
        }
        const job = this.queue.shift();
        if (!job)
            return;
        this.active += 1;
        try {
            await job.handler();
        }
        catch (error) {
            if (job.retries > 0) {
                this.logger.warn(`[${job.name}] retrying (${job.retries} left): ${error instanceof Error ? error.message : String(error)}`);
                setTimeout(() => {
                    this.queue.push({ ...job, retries: job.retries - 1, backoffMs: job.backoffMs * 2 });
                    void this.processNext();
                }, job.backoffMs);
            }
            else {
                this.logger.warn(`[${job.name}] failed: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
        finally {
            this.active -= 1;
            void this.processNext();
        }
    }
};
exports.BackgroundJobService = BackgroundJobService;
exports.BackgroundJobService = BackgroundJobService = BackgroundJobService_1 = __decorate([
    (0, common_1.Injectable)()
], BackgroundJobService);
