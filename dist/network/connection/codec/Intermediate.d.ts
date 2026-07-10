import { Connection, PacketCodec, PacketReader } from "../Connection";
/**
 * Intermediate transport codec.
 *
 * - Overhead: 4 bytes (length only)
 * - Quick ACK: bit 31 of the 4-byte length
 *
 * See https://core.telegram.org/mtproto/mtproto-transports#intermediate
 */
export declare class IntermediatePacketCodec extends PacketCodec {
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
 * Intermediate transport connection.
 *
 * See https://core.telegram.org/mtproto/mtproto-transports#intermediate
 */
export declare class ConnectionTCPIntermediate extends Connection {
    PacketCodecClass: typeof IntermediatePacketCodec;
}
