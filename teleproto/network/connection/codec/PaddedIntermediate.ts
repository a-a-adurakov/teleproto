import { Connection, PacketCodec } from "../Connection";
import { generateRandomBytes } from "../../../Helpers";
import type { PromisedNetSockets, Logger } from "../../../extensions";

/**
 * Padded Intermediate transport codec (ProtocolTypeDD).
 *
 * - Overhead: 4 bytes (total length including padding)
 * - Quick ACK: bit 31 of the 4-byte length
 * - Random padding: 0-15 bytes appended after payload
 *
 * See https://core.telegram.org/mtproto/mtproto-transports#padded-intermediate
 */
export class DDPacketCodec extends PacketCodec {
    static tag = Buffer.from("dddddddd", "hex");
    static obfuscateTag = Buffer.from("dddddddd", "hex");
    private tag: Buffer;
    obfuscateTag: Buffer;
    private _log?: Logger;

    constructor(props: any) {
        super(props);
        this.tag = DDPacketCodec.tag;
        this.obfuscateTag = DDPacketCodec.obfuscateTag;
        this._log = props._log;
        this._log?.debug("Padded Intermediate codec initialized (protocol: DD, tag: 0xdddddddd)");
    }

    encodePacket(data: Buffer) {
        // Random padding 0-15 bytes
        const padLen = data.length <= 1024
            ? generateRandomBytes(1)[0] % 16
            : generateRandomBytes(1)[0] % 16;
        const padding = padLen > 0 ? generateRandomBytes(padLen) : Buffer.alloc(0);
        const totalLen = data.length + padding.length;

        const len = Buffer.alloc(4);
        len.writeUInt32LE(totalLen, 0);
        return Buffer.concat([len, data, padding]);
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

        // Read payload + padding, return only the payload
        const body = await reader.read(length);
        // DD payload length is not aligned to 4, so we just return the full body
        // The MTProto layer will handle the actual message parsing
        return body;
    }
}

/**
 * Padded Intermediate transport connection (ProtocolTypeDD).
 *
 * See https://core.telegram.org/mtproto/mtproto-transports#padded-intermediate
 */
export class ConnectionTCPDD extends Connection {
    PacketCodecClass = DDPacketCodec;
}
