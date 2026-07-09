"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConnectionTCPIntermediate = exports.IntermediatePacketCodec = void 0;
const Connection_1 = require("../Connection");
/**
 * Intermediate transport codec.
 *
 * - Overhead: 4 bytes (length only)
 * - Quick ACK: bit 31 of the 4-byte length
 *
 * See https://core.telegram.org/mtproto/mtproto-transports#intermediate
 */
class IntermediatePacketCodec extends Connection_1.PacketCodec {
    constructor(props) {
        var _a;
        super(props);
        this.tag = IntermediatePacketCodec.tag;
        this.obfuscateTag = IntermediatePacketCodec.obfuscateTag;
        this._log = props._log;
        (_a = this._log) === null || _a === void 0 ? void 0 : _a.debug("Intermediate codec initialized (protocol: EE, tag: 0xeeeeeeee)");
    }
    encodePacket(data) {
        const len = Buffer.alloc(4);
        len.writeUInt32LE(data.length, 0);
        return Buffer.concat([len, data]);
    }
    async readPacket(reader) {
        var _a;
        const header = await reader.read(4);
        const length = header.readUInt32LE(0);
        // Quick ACK — bit 31 set
        if (length & 0x80000000) {
            (_a = this._log) === null || _a === void 0 ? void 0 : _a.debug(`Quick ACK received: 0x${(length & 0x7FFFFFFF).toString(16).padStart(8, '0')}`);
            return this.readPacket(reader);
        }
        return reader.read(length);
    }
}
exports.IntermediatePacketCodec = IntermediatePacketCodec;
IntermediatePacketCodec.tag = Buffer.from("eeeeeeee", "hex");
IntermediatePacketCodec.obfuscateTag = Buffer.from("eeeeeeee", "hex");
/**
 * Intermediate transport connection.
 *
 * See https://core.telegram.org/mtproto/mtproto-transports#intermediate
 */
class ConnectionTCPIntermediate extends Connection_1.Connection {
    constructor() {
        super(...arguments);
        this.PacketCodecClass = IntermediatePacketCodec;
    }
}
exports.ConnectionTCPIntermediate = ConnectionTCPIntermediate;
