import { Connection, PacketCodec } from "../Connection";
import type { PromisedNetSockets, Logger } from "../../../extensions";

/**
 * Intermediate transport codec.
 *
 * - Overhead: 4 bytes (length only)
 * - Quick ACK: bit 31 of the 4-byte length
 *
 * See https://core.telegram.org/mtproto/mtproto-transports#intermediate
 */
export class IntermediatePacketCodec extends PacketCodec {
    static tag = Buffer.from("eeeeeeee", "hex");
    static obfuscateTag = Buffer.from("eeeeeeee", "hex");
    private tag: Buffer;
    obfuscateTag: Buffer;
    private _log?: Logger;

    constructor(props: any) {
        super(props);
        this.tag = IntermediatePacketCodec.tag;
        this.obfuscateTag = IntermediatePacketCodec.obfuscateTag;
        this._log = props._log;
        this._log?.debug("Intermediate codec initialized (protocol: EE, tag: 0xeeeeeeee)");
    }

    encodePacket(data: Buffer) {
        const len = Buffer.alloc(4);
        len.writeUInt32LE(data.length, 0);
        return Buffer.concat([len, data]);
    }

    async readPacket(reader: PromisedNetSockets): Promise<Buffer> {
        const header = await reader.read(4);
        const length = header.readUInt32LE(0);

        // Quick ACK — bit 31 set (but first check if it's a transport error)
        if (length & 0x80000000) {
            this.checkTransportError(header);
            this._log?.debug(`Quick ACK received: 0x${(length & 0x7FFFFFFF).toString(16).padStart(8, '0')}`);
            return this.readPacket(reader);
        }

        return reader.read(length);
    }
}

/**
 * Intermediate transport connection.
 *
 * See https://core.telegram.org/mtproto/mtproto-transports#intermediate
 */
export class ConnectionTCPIntermediate extends Connection {
    PacketCodecClass = IntermediatePacketCodec;
}
