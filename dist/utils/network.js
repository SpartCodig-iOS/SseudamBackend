"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.shouldUseTLS = exports.resolveIPv4IfNeeded = void 0;
const promises_1 = __importDefault(require("node:dns/promises"));
const env_1 = require("../config/env");
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', 'db']);
const hostLooksLikeSupabase = (host) => host.includes('supabase.co') || host.includes('supabase.com');
const shouldForceIPv4ViaHost = (host) => {
    if (env_1.env.databaseForceIPv4)
        return true;
    return hostLooksLikeSupabase(host);
};
const resolveIPv4IfNeeded = async (host) => {
    if (!host || !shouldForceIPv4ViaHost(host)) {
        return host;
    }
    try {
        const result = await promises_1.default.lookup(host, { family: 4, all: false });
        return result?.address ?? host;
    }
    catch (error) {
        console.warn(`Failed to resolve IPv4 for ${host}:`, error);
        return host;
    }
};
exports.resolveIPv4IfNeeded = resolveIPv4IfNeeded;
const shouldUseTLS = (host) => {
    if (env_1.env.databaseRequireTLS !== null) {
        return Boolean(env_1.env.databaseRequireTLS);
    }
    if (!host)
        return env_1.isProduction;
    if (LOCAL_HOSTS.has(host.toLowerCase())) {
        return false;
    }
    if (hostLooksLikeSupabase(host) || host.includes('render.com')) {
        return true;
    }
    return env_1.isProduction;
};
exports.shouldUseTLS = shouldUseTLS;
