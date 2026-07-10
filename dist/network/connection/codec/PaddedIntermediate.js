"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConnectionTCPDD = exports.DDPacketCodec = void 0;
const Connection_1 = require("../Connection");
const Helpers_1 = require("../../../Helpers");
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
    async readPacket(reader) {
        var _a;
        const header = await reader.read(4);
        const length = header.readUInt32LE(0);
        // Quick ACK — bit 31 set (but first check if it's a transport error)
        if (length & 0x80000000) {
            this.checkTransportError(header);
            (_a = this._log) === null || _a === void 0 ? void 0 : _a.debug(`Quick ACK received: 0x${(length & 0x7FFFFFFF).toString(16).padStart(8, '0')}`);
            return this.readPacket(reader);
        }
        // Read payload + padding, return only the payload
        const body = await reader.read(length);
        // DD payload length is not aligned to 4, so we just return the full body
        // The MTProto layer will handle the actual message parsing
        return body;
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
