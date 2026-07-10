import { readBufferFromBigInt } from "../../../Helpers";
import { Connection, PacketCodec, PacketReader } from "../Connection";
import type { Logger } from "../../../extensions";

import bigInt from "big-integer";

export class AbridgedPacketCodec extends PacketCodec {
    static tag = Buffer.from("ef", "hex");
    static obfuscateTag = Buffer.from("efefefef", "hex");
    tag: Buffer;
    obfuscateTag: Buffer;
    private _log?: Logger;

    constructor(props: any) {
        super(props);
        this.tag = AbridgedPacketCodec.tag;
        this.obfuscateTag = AbridgedPacketCodec.obfuscateTag;
        this._log = props._log;
        this._log?.debug("Abridged codec initialized (protocol: EF, tag: 0xef)");
    }

    encodePacket(data: Buffer) {
        let length = data.length >> 2;
        let temp;
        if (length < 127) {
            const b = Buffer.alloc(1);
            b.writeUInt8(length, 0);
            temp = b;
        } else {
            temp = Buffer.concat([
                Buffer.from("7f", "hex"),
                readBufferFromBigInt(bigInt(length), 3),
            ]);
        }
        return Buffer.concat([temp, data]);
    }

    async readPacket(
        reader: PacketReader
    ): Promise<Buffer> {
        const readData = await reader.read(1);
        let firstByte = readData[0];
        // Quick ACK — bit 7 set means the next 3 bytes are an ack token, not a length
        if (firstByte & 0x80) {
            const remaining = await reader.read(3);
            const token = Buffer.concat([readData, remaining]);
            // Check for transport error before treating as quick ACK
            this.checkTransportError(token);
            this._log?.debug(
                `Quick ACK token received (4 bytes): ` +
                `hex=${token.toString('hex')}, ` +
                `first_byte=0x${firstByte.toString(16).padStart(2, '0')} (bit7=${(firstByte >> 7) & 1}), ` +
                `length_as_int=${token.readUInt32LE(0)}`
            );
            return this.readPacket(reader);
        }
        let length = firstByte;
        if (length >= 127) {
            length = Buffer.concat([
                await reader.read(3),
                Buffer.alloc(1),
            ]).readInt32LE(0);
            this._log?.debug(`Abridged packet: extended length=${length} bytes`);
        } else {
            this._log?.debug(`Abridged packet: length=${length} words (${length * 4} bytes)`);
        }

        return reader.read(length << 2);
    }
}

/**
 * This is the mode with the lowest overhead, as it will
 * only require 1 byte if the packet length is less than
 * 508 bytes (127 << 2, which is very common).
 */
export class ConnectionTCPAbridged extends Connection {
    PacketCodecClass = AbridgedPacketCodec;
}
