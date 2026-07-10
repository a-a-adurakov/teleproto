import { Connection, PacketCodec, PacketReader } from "../Connection";
/**
 * Padded Intermediate transport codec (ProtocolTypeDD).
 *
 * - Overhead: 4 bytes (total length including padding)
 * - Quick ACK: bit 31 of the 4-byte length
 * - Random padding: 0-15 bytes appended after payload
 *
 * See https://core.telegram.org/mtproto/mtproto-transports#padded-intermediate
 */
export declare class DDPacketCodec extends PacketCodec {
    static tag: Buffer<ArrayBuffer>;
    static obfuscateTag: Buffer<ArrayBuffer>;
    tag: Buffer;
    obfuscateTag: Buffer;
    private _log?;
    constructor(props: any);
    encodePacket(data: Buffer): Buffer<ArrayBuffer>;
    readPacket(reader: PacketReader): Promise<Buffer>;
}
/**
 * Padded Intermediate transport connection (ProtocolTypeDD).
 *
 * See https://core.telegram.org/mtproto/mtproto-transports#padded-intermediate
 */
export declare class ConnectionTCPDD extends Connection {
    PacketCodecClass: typeof DDPacketCodec;
}
