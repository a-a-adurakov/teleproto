import {
    Logger,
    PromisedNetSockets,
} from "../../extensions";
import { AsyncQueue } from "../../extensions";
import { AbridgedPacketCodec } from "./codec/Abridged";
import { FullPacketCodec } from "./codec/Full";
import { ProxyInterface } from "./TCPMTProxy";
import { Api } from "../../tl";
import { FloodWaitError, InvalidDCError, InvalidBufferError, RPCError, NotFoundError } from "../../errors";

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
class Connection {
    PacketCodecClass?: typeof PacketCodec;
    readonly _ip: string;
    readonly _port: number;
    _dcId: number;
    _log: Logger;
    _proxy?: ProxyInterface;
    _connected: boolean;
    private _sendTask?: Promise<void>;
    private _recvTask?: Promise<void>;
    protected _codec!: PacketCodec;
    protected _obfuscation?: ObfuscationLayer;
    _sendArray: AsyncQueue;
    _recvArray: AsyncQueue;
    private _abortController: AbortController;
    private _recvError?: Error;
    socket: PromisedNetSockets;

    constructor({
        ip,
        port,
        dcId,
        loggers,
        proxy,
        socket,
    }: ConnectionInterfaceParams) {
        this._ip = ip;
        this._port = port;
        this._dcId = dcId;
        this._log = loggers;
        this._proxy = proxy;
        this._connected = false;
        this._sendTask = undefined;
        this._recvTask = undefined;
        this._sendArray = new AsyncQueue();
        this._recvArray = new AsyncQueue();
        this._abortController = new AbortController();
        this.socket = new socket(proxy);
    }

    async _connect() {
        this._log.debug("Connecting");
        this._codec = new this.PacketCodecClass!(this);
        this._log.info(`Codec: ${this._codec.constructor.name}`);
        await this.socket.connect(this._port, this._ip);
        this._log.debug("Finished connecting");
        await this._initConn();
    }

    async connect() {
        this._abortController = new AbortController();
        await this._connect();
        this._connected = true;

        if (!this._sendTask) {
            this._sendTask = this._sendLoop();
        }
        this._recvTask = this._recvLoop();
    }

    async disconnect() {
        if (!this._connected) {
            return;
        }
        this._connected = false;
        this._abortController.abort();
        void this._recvArray.push(undefined);
        await this.socket.close();
    }

    async send(data: Buffer) {
        if (!this._connected) {
            throw new Error("Not connected");
        }
        await this._sendArray.push(data);
    }

    async recv() {
        while (this._connected) {
            const result = await this._recvArray.pop();
            if (result) {
                return result;
            }
        }
        const err = this._recvError;
        this._recvError = undefined;
        if (err) throw err;
        throw new Error("Not connected");
    }

    async _sendLoop() {
        try {
            while (this._connected) {
                const data = await this._sendArray.pop();
                if (!data) {
                    this._sendTask = undefined;
                    return;
                }
                await this._send(data);
            }
        } catch (e) {
            this._log.info("The server closed the connection while sending");
        }
    }

    isConnected() {
        return this._connected;
    }

    async _recvLoop() {
        let data;
        while (this._connected) {
            try {
                data = await this._recv();
                if (!data) {
                    throw new Error("no data received");
                }
            } catch (e) {
                this._log.debug(`connection recv error: ${e}`);
                this._recvError = e instanceof Error ? e : new Error(String(e));
                this.disconnect();
                return;
            }
            await this._recvArray.push(data);
        }
    }

    async _initConn() {
        if (this._codec.tag) {
            await this.socket.write(this._codec.tag);
        }
    }

    async _send(data: Buffer) {
        const encodedPacket = this._codec.encodePacket(data);
        this.socket.write(encodedPacket);
    }

    async _recv() {
        return await this._codec.readPacket(this.socket);
    }

    toString() {
        return `${this._ip}:${this._port}/${this.constructor.name.replace(
            "Connection",
            ""
        )}`;
    }
}

/**
 * Connection with an obfuscation layer.
 * Subclasses implement `_createObfuscation()` to provide their layer.
 */
abstract class ObfuscatedConnection extends Connection {
    protected abstract _createObfuscation(): ObfuscationLayer;

    async _initConn() {
        const obf = this._createObfuscation();
        await obf.initHeader();
        this._obfuscation = obf;
        this.socket.write(obf.header);
    }

    async _send(data: Buffer) {
        if (!this._obfuscation) {
            throw new Error("Obfuscation layer not initialized");
        }
        this._obfuscation.write(this._codec.encodePacket(data));
    }

    async _recv() {
        if (!this._obfuscation) {
            throw new Error("Obfuscation layer not initialized");
        }
        return await this._codec.readPacket(this._obfuscation);
    }
}

class PacketCodec {
    tag?: Buffer;
    private _conn: Connection;

    constructor(connection: Connection) {
        this._conn = connection;
    }

    encodePacket(data: Buffer): Buffer {
        throw new Error("Not Implemented");
    }

    async readPacket(
        reader: PacketReader
    ): Promise<Buffer> {
        throw new Error("Not Implemented");
    }

    /**
     * Check if a 4-byte buffer is a transport error (404, 429, 444).
     * Only throws for KNOWN transport error codes, not for negative quick ACK tokens.
     * Returns the error code if transport error, 0 otherwise.
     */
    protected checkTransportError(header: Buffer): number {
        if (header.length !== 4) return 0;
        const val = header.readInt32LE(0);
        if (val >= 0) return 0; // positive = not a transport error

        const code = -val;
        // Only known transport error codes per MTProto spec
        if (code === 404 || code === 429 || code === 444) {
            throw new InvalidBufferError(header);
        }
        // Unknown negative value — likely a quick ACK token, not a transport error
        return 0;
    }
}

export { Connection, PacketCodec, ObfuscatedConnection };
