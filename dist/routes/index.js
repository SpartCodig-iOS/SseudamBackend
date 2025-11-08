"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = __importDefault(require("./auth"));
const profile_1 = __importDefault(require("./profile"));
const router = (0, express_1.Router)();
router.use('/api/v1/auth', auth_1.default);
router.use('/api/v1/auth', profile_1.default);
exports.default = router;
