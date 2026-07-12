"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DcenterRegistry = exports.Dcenter = void 0;
const big_integer_1 = __importDefault(require("big-integer"));
const AuthKey_1 = require("../crypto/AuthKey");
class Dcenter {
    constructor(dcId, authKey) {
        this.mediaTempKey = new AuthKey_1.AuthKey();
        this.mediaBound = false;
        this.mediaTempExpiresAt = 0;
        this.dcId = dcId;
        this._salt = big_integer_1.default.zero;
        this.authKey = authKey !== null && authKey !== void 0 ? authKey : new AuthKey_1.AuthKey();
    }
    get mediaTempUsable() {
        return true;
    }
    resetMediaTempKey() {
        this.mediaTempKey.setKey(undefined);
        this.mediaBound = false;
        this.mediaTempExpiresAt = 0;
    }
    get salt() {
        return this._salt;
    }
    updateSalt(salt) {
        if (salt && !salt.isZero()) {
            this._salt = salt;
        }
    }
}
exports.Dcenter = Dcenter;
class DcenterRegistry {
    constructor() {
        this._dcs = new Map();
    }
    get(dcId, seedKey) {
        let dc = this._dcs.get(dcId);
        if (!dc) {
            dc = new Dcenter(dcId, seedKey);
            const result = this._dcs.set(dcId, dc);
        }
        return dc;
    }
    clear() {
        this._dcs.clear();
    }
}
exports.DcenterRegistry = DcenterRegistry;
