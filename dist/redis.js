"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.redis = void 0;
const ioredis_1 = __importDefault(require("ioredis"));
const logger_1 = require("./logger");
let redis = null;
exports.redis = redis;
if (process.env.REDIS_URL) {
    exports.redis = redis = new ioredis_1.default(process.env.REDIS_URL);
}
else {
    logger_1.logger.warn("REDIS_URL not set. Step caching, global placeholders, and project data are disabled.");
}
