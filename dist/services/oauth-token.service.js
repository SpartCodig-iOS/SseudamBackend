"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OAuthTokenService = void 0;
const common_1 = require("@nestjs/common");
const pool_1 = require("../db/pool");
let OAuthTokenService = class OAuthTokenService {
    async saveToken(userId, provider, refreshToken) {
        const pool = await (0, pool_1.getPool)();
        if (!refreshToken) {
            await pool.query(`DELETE FROM oauth_refresh_tokens WHERE user_id = $1 AND provider = $2`, [userId, provider]);
            return;
        }
        await pool.query(`INSERT INTO oauth_refresh_tokens (user_id, provider, refresh_token, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (user_id, provider)
       DO UPDATE SET refresh_token = EXCLUDED.refresh_token,
                     updated_at = NOW()`, [userId, provider, refreshToken]);
    }
    async getToken(userId, provider) {
        const pool = await (0, pool_1.getPool)();
        const result = await pool.query(`SELECT refresh_token FROM oauth_refresh_tokens
       WHERE user_id = $1 AND provider = $2
       LIMIT 1`, [userId, provider]);
        return result.rows[0]?.refresh_token ?? null;
    }
};
exports.OAuthTokenService = OAuthTokenService;
exports.OAuthTokenService = OAuthTokenService = __decorate([
    (0, common_1.Injectable)()
], OAuthTokenService);
