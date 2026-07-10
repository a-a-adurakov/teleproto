import { ObfuscatedConnection } from "./Connection";
import { AbridgedPacketCodec } from "./codec/Abridged";
declare class ObfuscatedIO {
    header: Buffer;
    private connection;
    private _encrypt?;
    private _decrypt?;
    private _packetClass;
    constructor(connection: ConnectionTCPObfuscated);
    initHeader(): Promise<void>;
    read(n: number): Promise<Buffer<any>>;
    write(data: Buffer): void;
}
export declare class ConnectionTCPObfuscated extends ObfuscatedConnection {
    PacketCodecClass: typeof AbridgedPacketCodec;
    protected _createObfuscation(): ObfuscatedIO;
}
export {};
