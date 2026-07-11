import { Logger, PromisedNetSockets } from "../../extensions";
import { AsyncQueue } from "../../extensions";
import { ProxyInterface } from "./TCPMTProxy";
interface ConnectionInterfaceParams {
    ip: string;
    port: number;
    dcId: number;
    loggers: Logger;
    proxy?: ProxyInterface;
    socket: typeof PromisedNetSockets;
    dcSecret?: Buffer;
}
/** Anything that can read n bytes (socket, obfuscation layer). */
export interface PacketReader {
    read(n: number): Promise<Buffer>;
}
/** Anything that can write data to the network. */
export interface PacketWriter {
    write(data: Buffer): void;
}
/** Obfuscation layer (encrypt/decrypt + header init). */
export interface ObfuscationLayer extends PacketReader, PacketWriter {
    header: Buffer;
    initHeader(): Promise<void>;
}
/**
 * The `Connection` class is a wrapper around ``asyncio.open_connection``.
 *
 * Subclasses will implement different transport modes as atomic operations,
 * which this class eases doing since the exposed interface simply puts and
 * gets complete data payloads to and from queues.
 *
 * The only error that will raise from send and receive methods is
 * ``ConnectionError``, which will raise when attempting to send if
 * the client is disconnected (includes remote disconnections).
 */
declare class Connection {
    PacketCodecClass?: typeof PacketCodec;
    readonly _ip: string;
    readonly _port: number;
    _dcId: number;
    _log: Logger;
    _proxy?: ProxyInterface;
    _connected: boolean;
    private _sendTask?;
    private _recvTask?;
    protected _codec: PacketCodec;
    protected _obfuscation?: ObfuscationLayer;
    _sendArray: AsyncQueue;
    _recvArray: AsyncQueue;
    private _abortController;
    private _recvError?;
    socket: PromisedNetSockets;
    constructor({ ip, port, dcId, loggers, proxy, socket, }: ConnectionInterfaceParams);
    _connect(): Promise<void>;
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    send(data: Buffer): Promise<void>;
    recv(): Promise<any>;
    _sendLoop(): Promise<void>;
    isConnected(): boolean;
    _recvLoop(): Promise<void>;
    _initConn(): Promise<void>;
    _send(data: Buffer): Promise<void>;
    _recv(): Promise<Buffer<ArrayBufferLike>>;
    toString(): string;
}
/**
 * Connection with an obfuscation layer.
 * Subclasses implement `_createObfuscation()` to provide their layer.
 */
declare abstract class ObfuscatedConnection extends Connection {
    protected abstract _createObfuscation(): ObfuscationLayer;
    _initConn(): Promise<void>;
    _send(data: Buffer): Promise<void>;
    _recv(): Promise<Buffer<ArrayBufferLike>>;
}
declare class PacketCodec {
    tag?: Buffer;
    private _conn;
    constructor(connection: Connection);
    encodePacket(data: Buffer): Buffer;
    readPacket(reader: PacketReader): Promise<Buffer>;
    /**
     * Check if a 4-byte buffer is a transport error (404, 429, 444).
     * Throws InvalidBufferError if so, otherwise returns.
     */
    protected checkTransportError(header: Buffer): void;
}
export { Connection, PacketCodec, ObfuscatedConnection };
