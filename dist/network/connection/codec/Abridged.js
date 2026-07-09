"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConnectionTCPAbridged = exports.AbridgedPacketCodec = void 0;
const Helpers_1 = require("../../../Helpers");
const Connection_1 = require("../Connection");
const big_integer_1 = __importDefault(require("big-integer"));
class AbridgedPacketCodec extends Connection_1.PacketCodec {
    constructor(props) {
        var _a;
        super(props);
        this.tag = AbridgedPacketCodec.tag;
        this.obfuscateTag = AbridgedPacketCodec.obfuscateTag;
        this._log = props._log;
        (_a = this._log) === null || _a === void 0 ? void 0 : _a.debug("Abridged codec initialized (protocol: EF, tag: 0xef)");
    }
    encodePacket(data) {
        let length = data.length >> 2;
        let temp;
        if (length < 127) {
            const b = Buffer.alloc(1);
            b.writeUInt8(length, 0);
            temp = b;
        }
        else {
            temp = Buffer.concat([
                Buffer.from("7f", "hex"),
                (0, Helpers_1.readBufferFromBigInt)((0, big_integer_1.default)(length), 3),
            ]);
        }
        return Buffer.concat([temp, data]);
    }
    async readPacket(reader) {
        var _a, _b, _c;
        const readData = await reader.read(1);
        let firstByte = readData[0];
        // Quick ACK — bit 7 set means the next 3 bytes are an ack token, not a length
        if (firstByte & 0x80) {
            const remaining = await reader.read(3);
            const token = Buffer.concat([readData, remaining]);
            (_a = this._log) === null || _a === void 0 ? void 0 : _a.debug(`Quick ACK token received (4 bytes): ` +
                `hex=${token.toString('hex')}, ` +
                `first_byte=0x${firstByte.toString(16).padStart(2, '0')} (bit7=${(firstByte >> 7) & 1}), ` +
                `length_as_int=${token.readUInt32LE(0)}`);
            return this.readPacket(reader);
        }
        let length = firstByte;
        if (length >= 127) {
            length = Buffer.concat([
                await reader.read(3),
                Buffer.alloc(1),
            ]).readInt32LE(0);
            (_b = this._log) === null || _b === void 0 ? void 0 : _b.debug(`Abridged packet: extended length=${length} bytes`);
        }
        else {
            (_c = this._log) === null || _c === void 0 ? void 0 : _c.debug(`Abridged packet: length=${length} words (${length * 4} bytes)`);
        }
        return reader.read(length << 2);
    }
}
exports.AbridgedPacketCodec = AbridgedPacketCodec;
AbridgedPacketCodec.tag = Buffer.from("ef", "hex");
AbridgedPacketCodec.obfuscateTag = Buffer.from("efefefef", "hex");
/**
 * This is the mode with the lowest overhead, as it will
 * only require 1 byte if the packet length is less than
 * 508 bytes (127 << 2, which is very common).
 */
class ConnectionTCPAbridged extends Connection_1.Connection {
    constructor() {
        super(...arguments);
        this.PacketCodecClass = AbridgedPacketCodec;
    }
}
exports.ConnectionTCPAbridged = ConnectionTCPAbridged;
