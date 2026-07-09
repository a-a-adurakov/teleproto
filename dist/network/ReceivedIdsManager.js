"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReceivedIdsManager = void 0;
const big_integer_1 = __importDefault(require("big-integer"));
const ID_BUFFER_SIZE = 400;
class ReceivedIdsManager {
    constructor() {
        this.ids = [];
    }
    registerMsgId(msgId, needAck) {
        const idx = this.indexOf(msgId);
        if (idx >= 0)
            return "duplicate";
        if (this.ids.length >= ID_BUFFER_SIZE && msgId.lesser(this.ids[0].msgId)) {
            return "tooOld";
        }
        const insertAt = this.lowerBound(msgId);
        this.ids.splice(insertAt, 0, { msgId, needAck });
        return "success";
    }
    lookup(msgId) {
        const idx = this.indexOf(msgId);
        if (idx < 0)
            return "notFound";
        return this.ids[idx].needAck ? "needsAck" : "noAckNeeded";
    }
    markAcked(msgId) {
        const idx = this.indexOf(msgId);
        if (idx >= 0)
            this.ids[idx].needAck = false;
    }
    min() {
        var _a, _b;
        return (_b = (_a = this.ids[0]) === null || _a === void 0 ? void 0 : _a.msgId) !== null && _b !== void 0 ? _b : big_integer_1.default.zero;
    }
    max() {
        var _a, _b;
        return (_b = (_a = this.ids[this.ids.length - 1]) === null || _a === void 0 ? void 0 : _a.msgId) !== null && _b !== void 0 ? _b : big_integer_1.default.zero;
    }
    shrink() {
        while (this.ids.length > ID_BUFFER_SIZE)
            this.ids.shift();
    }
    clear() {
        this.ids.length = 0;
    }
    get size() {
        return this.ids.length;
    }
    lowerBound(msgId) {
        let lo = 0;
        let hi = this.ids.length;
        while (lo < hi) {
            const mid = (lo + hi) >>> 1;
            if (this.ids[mid].msgId.lesser(msgId))
                lo = mid + 1;
            else
                hi = mid;
        }
        return lo;
    }
    indexOf(msgId) {
        const idx = this.lowerBound(msgId);
        if (idx >= this.ids.length)
            return -1;
        return this.ids[idx].msgId.eq(msgId) ? idx : -1;
    }
}
exports.ReceivedIdsManager = ReceivedIdsManager;
