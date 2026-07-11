"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConnectionTCPDD = exports.DDPacketCodec = void 0;
const Connection_1 = require("../Connection");
const Helpers_1 = require("../../../Helpers");
const errors_1 = require("../../../errors");
/**
 * Padded Intermediate transport codec (ProtocolTypeDD).
 *
 * - Overhead: 4 bytes (total length including padding)
 * - Quick ACK: bit 31 of the 4-byte length
 * - Random padding: 0-15 bytes appended after payload
 *
 * See https://core.telegram.org/mtproto/mtproto-transports#padded-intermediate
 */
class DDPacketCodec extends Connection_1.PacketCodec {
    constructor(props) {
        var _a;
        super(props);
        this.tag = DDPacketCodec.tag;
        this.obfuscateTag = DDPacketCodec.obfuscateTag;
        this._log = props._log;
        (_a = this._log) === null || _a === void 0 ? void 0 : _a.debug("Padded Intermediate codec initialized (protocol: DD, tag: 0xdddddddd)");
    }
    encodePacket(data) {
        // Random padding 0-15 bytes
        const padLen = data.length <= 1024
            ? (0, Helpers_1.generateRandomBytes)(1)[0] % 16
            : (0, Helpers_1.generateRandomBytes)(1)[0] % 16;
        const padding = padLen > 0 ? (0, Helpers_1.generateRandomBytes)(padLen) : Buffer.alloc(0);
        const totalLen = data.length + padding.length;
        const len = Buffer.alloc(4);
        len.writeUInt32LE(totalLen, 0);
        return Buffer.concat([len, data, padding]);
    }
    /**
     * DD-specific transport error check.
     * Only throws for KNOWN error codes (404, 429, 444).
     * Unknown negative values are treated as quick ACK tokens.
     */
    checkTransportError(header) {
        var _a;
        if (header.length !== 4)
            return;
        const val = header.readInt32LE(0);
        if (val >= 0)
            return; // positive = not a transport error
        const code = -val;
        // Only known transport error codes per MTProto spec
        if (code === 404 || code === 429 || code === 444) {
            throw new errors_1.InvalidBufferError(header);
        }
        // Unknown negative value — likely a quick ACK token, not a transport error
        (_a = this._log) === null || _a === void 0 ? void 0 : _a.debug(`Unknown negative value in DD header: ${val} (not a known transport error)`);
    }
    async readPacket(reader) {
        var _a, _b;
        const header = await reader.read(4);
        const length = header.readUInt32LE(0);
        // Client quick ACK — bit 31 set
        if (length & 0x80000000) {
            this.checkTransportError(header);
            (_a = this._log) === null || _a === void 0 ? void 0 : _a.debug(`Quick ACK received: 0x${(length & 0x7FFFFFFF).toString(16).padStart(8, '0')}`);
            return this.readPacket(reader);
        }
        // Server quick ACK — small packet (8-16 bytes) with 0xFFFFFFFF header
        if (length >= 8 && length <= 16) {
            const body = await reader.read(length);
            // Check for 0xFFFFFFFF marker (server quick ACK)
            if (body.length >= 4 && body.readUInt32LE(0) === 0xFFFFFFFF) {
                (_b = this._log) === null || _b === void 0 ? void 0 : _b.debug(`Server quick ACK received: ${body.toString('hex')}`);
                return this.readPacket(reader);
            }
            // Not a quick ACK — return the body we already read
            return body;
        }
        // Regular packet
        return reader.read(length);
    }
}
exports.DDPacketCodec = DDPacketCodec;
DDPacketCodec.tag = Buffer.from("dddddddd", "hex");
DDPacketCodec.obfuscateTag = Buffer.from("dddddddd", "hex");
/**
 * Padded Intermediate transport connection (ProtocolTypeDD).
 *
 * See https://core.telegram.org/mtproto/mtproto-transports#padded-intermediate
 */
class ConnectionTCPDD extends Connection_1.Connection {
    constructor() {
        super(...arguments);
        this.PacketCodecClass = DDPacketCodec;
    }
}
exports.ConnectionTCPDD = ConnectionTCPDD;
