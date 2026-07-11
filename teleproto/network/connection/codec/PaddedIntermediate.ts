import { Connection, PacketCodec, PacketReader } from "../Connection";
import { generateRandomBytes } from "../../../Helpers";
import { InvalidBufferError } from "../../../errors";
import type { Logger } from "../../../extensions";

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
    tag: Buffer;
    obfuscateTag: Buffer;
    private _log?: Logger;
    
    constructor(props: any) {
        super(props);
        this.tag = DDPacketCodec.tag;
        this.obfuscateTag = DDPacketCodec.obfuscateTag;
        this._log = props._log;
        this._log?.info("Padded Intermediate codec initialized (protocol: DD, tag: 0xdddddddd)");
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

    async readPacket(reader: PacketReader): Promise<Buffer> {
        const header = await reader.read(4);
        const length = header.readUInt32LE(0);

        // Client quick ACK — bit 31 set
        if (length & 0x80000000) {
            this.checkTransportError(header);
            return this.readPacket(reader);
        }

        // Server quick ACK — small packet (8-16 bytes) with 0xFFFFFFFF header
        if (length >= 8 && length <= 16) {
            const body = await reader.read(length);
            // Check for 0xFFFFFFFF marker (server quick ACK)
            if (body.length >= 4 
                && body.readUInt32LE(0) === 0xFFFFFFFF) {
                this._log?.debug(`Server quick ACK received: ${body.toString('hex')}`);
                return this.readPacket(reader);
            }
            // Not a quick ACK — return the body we already read
            return body;
        }

        // Regular packet
        return reader.read(length);
    }

    /**
     * DD-specific transport error check.
     * Only throws for KNOWN error codes (404, 429, 444).
     * Unknown negative values are treated as quick ACK tokens.
     */
    protected checkTransportError(header: Buffer): void {
        if (header.length !== 4) 
            return;
        const val = header.readInt32LE(0);
        if (val >= 0) 
            return; // positive = not a transport error

        const code = -val;
        // Only known transport error codes per MTProto spec
        if (code === 404 
            || code === 429 
            || code === 444) {
            throw new InvalidBufferError(header);
        }
        // Unknown negative value — likely a quick ACK token, not a transport error
        this._log?.debug(`Unknown negative value in DD header: ${val} (not a known transport error)`);
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
