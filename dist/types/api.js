"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.failure = exports.success = void 0;
const success = (data, message = 'Success', code = 200) => ({
    code,
    data,
    message,
});
exports.success = success;
const failure = (message, code = 400) => ({
    code,
    data: [],
    message,
});
exports.failure = failure;
