"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Network = void 0;
const SenderSlot_1 = require("./SenderSlot");
const core_types_1 = require("./core_types");
const TempAuthKey_1 = require("./TempAuthKey");
const Helpers_1 = require("../Helpers");
class Network {
    constructor(client, opts) {
        this._slots = new Map();
        this._connectChains = new Map();
        this._lastConnectAt = new Map();
        this._closed = false;
        this._client = client;
        this._opts = opts;
    }
    dcenter(dcId) {
        return this._client._dcenters.get(dcId, this._client.session.getAuthKey(dcId));
    }
    getSession(shiftedDcId) {
        if (this._closed)
            throw new Error("Network is closed");
        let slot = this._slots.get(shiftedDcId);
        if (!slot || slot.state === "dead") {
            slot = this._makeSlot(shiftedDcId);
            this._slots.set(shiftedDcId, slot);
        }
        return slot;
    }
    async lease(dcId) {
        const slot = this.getSession(dcId);
        const sender = await slot.ensureConnected();
        slot.enter();
        let released = false;
        return {
            sender,
            release: () => {
                if (released)
                    return;
                released = true;
                slot.leave();
            },
        };
    }
    removeSession(shiftedDcId) {
        const slot = this._slots.get(shiftedDcId);
        if (slot) {
            this._slots.delete(shiftedDcId);
            slot.markDead("manual").catch(() => { });
        }
    }
    _makeSlot(shiftedDcId) {
        const dcId = (0, core_types_1.bareDcId)(shiftedDcId);
        const dcenter = this.dcenter(dcId);
        const slot = new SenderSlot_1.SenderSlot({
            dcId,
            idleTimeoutMs: this._opts.idleTimeoutMs,
            log: this._client._log,
            connect: async () => {
                var _a;
                const chain = (_a = this._connectChains.get(dcId)) !== null && _a !== void 0 ? _a : Promise.resolve();
                const ours = chain.then(() => this._gatedConnect(dcId, shiftedDcId, slot, dcenter));
                this._connectChains.set(dcId, ours.catch(() => { }));
                return ours;
            },
        });
        return slot;
    }
    async _gatedConnect(dcId, shiftedDcId, slot, dcenter) {
        var _a;
        const gap = this._opts.sessionStartupDelayMs;
        const last = (_a = this._lastConnectAt.get(dcId)) !== null && _a !== void 0 ? _a : 0;
        if (gap > 0 && last > 0) {
            const wait = gap - (Date.now() - last);
            if (wait > 0)
                await (0, Helpers_1.sleep)(wait);
        }
        try {
            const isMedia = (0, core_types_1.isDownloadDcId)(shiftedDcId) || (0, core_types_1.isUploadDcId)(shiftedDcId);
            const useTemp = isMedia &&
                dcenter.mediaTempUsable &&
                !!dcenter.authKey.getKey();
            if (useTemp &&
                dcenter.mediaTempExpiresAt > 0 &&
                dcenter.mediaTempExpiresAt <
                    Math.floor(Date.now() / 1000) + 60) {
                dcenter.resetMediaTempKey();
            }
            const log = this._client._log;
            const sender = this._client._makeSender(dcId, () => this._onSenderBreak(shiftedDcId, slot), useTemp ? dcenter.mediaTempKey : dcenter.authKey, true, useTemp
                ? {
                    permAuthKey: dcenter.authKey,
                    dcParam: -(dcId +
                        (this._client._testServers ? 10000 : 0)),
                    expiresIn: TempAuthKey_1.TEMP_KEY_EXPIRES_IN,
                    isBound: () => dcenter.mediaBound,
                    onBound: (expiresAt) => {
                        dcenter.mediaBound = true;
                        dcenter.mediaTempExpiresAt = expiresAt;
                    },
                    onFailed: (err) => {
                        dcenter.mediaTempFailed = true;
                        dcenter.resetMediaTempKey();
                        log.info(`Temp-key binding failed for dc ${dcId}, media sessions fall back to the permanent key (${err instanceof Error ? err.message : err})`);
                    },
                }
                : undefined);
            return await this._client._connectSender(sender, dcId);
        }
        finally {
            this._lastConnectAt.set(dcId, Date.now());
        }
    }
    _onSenderBreak(shiftedDcId, slot) {
        if (this._slots.get(shiftedDcId) === slot) {
            this._slots.delete(shiftedDcId);
        }
        const dcId = (0, core_types_1.bareDcId)(shiftedDcId);
        this._client.session.setAuthKey(undefined, dcId);
        const dcenter = this.dcenter(dcId);
        dcenter.resetMediaTempKey();
        slot.markDead("manual").catch(() => { });
    }
    async purge() {
        const dying = [...this._slots.values()];
        this._slots.clear();
        await Promise.all(dying.map((s) => s.markDead("manual").catch(() => { })));
    }
    async close() {
        this._closed = true;
        const dying = [...this._slots.values()];
        this._slots.clear();
        await Promise.all(dying.map((s) => s.markDead("pool-closed").catch(() => { })));
    }
}
exports.Network = Network;
