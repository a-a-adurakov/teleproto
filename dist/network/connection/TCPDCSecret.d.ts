import { ObfuscatedConnection } from "./Connection";
import { AbridgedPacketCodec } from "./codec/Abridged";
import { DDPacketCodec } from "./codec/PaddedIntermediate";
/**
 * Parses DC secret bytes and determines the protocol type.
 *
 * - `\xdd` prefix, length >= 17 → DD mode (Padded Intermediate)
 * - `\xee` prefix, length > 17 → TLS mode (Fake TLS)
 * - Otherwise → EF mode (Abridged)
 */
export declare function parseDCSecret(secret: Buffer): {
    key: Buffer;
    fakeTlsDomain?: string;
};
/**
 * Obfuscated IO with secret-derived keys (for DC connections with secret).
 * Reuses the same key derivation as MTProxy but without the MTProxy dependency.
 */
declare class DCSecretObfuscatedIO {
    header: Buffer;
    private readonly stream;
    private readonly packetCodec;
    private readonly secret;
    private readonly dcId;
    private readonly dcTag;
    private encryptor?;
    private decryptor?;
    constructor(connection: any, dcTag: Buffer);
    initHeader(): Promise<void>;
    read(n: number): Promise<Buffer>;
    write(data: Buffer): void;
}
/**
 * Connection for DCs with `\xdd` secret prefix (Padded Intermediate + obfuscation).
 */
export declare class ConnectionTCPDDSecret extends ObfuscatedConnection {
    PacketCodecClass: typeof DDPacketCodec;
    _secret: Buffer;
    _dcId: number;
    constructor(params: any);
    protected _createObfuscation(): DCSecretObfuscatedIO;
}
/**
 * Connection for DCs with `\xee` secret prefix (Fake TLS + obfuscation).
 */
export declare class ConnectionTCPTLSSecret extends ObfuscatedConnection {
    PacketCodecClass: typeof AbridgedPacketCodec;
    _secret: Buffer;
    _dcId: number;
    _fakeTlsDomain?: string;
    constructor(params: any);
    protected _createObfuscation(): DCSecretObfuscatedIO;
    _initConn(): Promise<void>;
}
export {};
