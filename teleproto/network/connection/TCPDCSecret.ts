import { ObfuscatedConnection } from "./Connection";
import { AbridgedPacketCodec } from "./codec/Abridged";
import { generateRandomBytes, sha256 } from "../../Helpers";
import { PromisedNetSockets } from "../../extensions";
import { CTR } from "../../crypto/CTR";

const SECRET_LEN = 16;
const PREFIX_FAKE_TLS = 0xee;
const PREFIX_DD_PADDING = 0xdd;

const OBF_HEADER_LEN = 64;
const OBF_TAG_OFFSET = 56;
const OBF_DC_OFFSET = 60;

const FORBIDDEN_HEADER_PREFIXES: ReadonlyArray<Buffer> = [
    Buffer.from("50567247", "hex"),
    Buffer.from("474554", "hex"),
    Buffer.from("504f5354", "hex"),
    Buffer.from("eeeeeeee", "hex"),
];

function pickObfuscationHeader(): Buffer {
    while (true) {
        const candidate = generateRandomBytes(OBF_HEADER_LEN);
        if (candidate[0] === 0xef) continue;
        if (candidate.subarray(4, 8).equals(Buffer.alloc(4))) continue;
        const head4 = candidate.subarray(0, 4);
        if (FORBIDDEN_HEADER_PREFIXES.some((p) => p.equals(head4))) continue;
        return candidate;
    }
}

interface ByteStream {
    readExactly(n: number): Promise<Buffer>;
    write(data: Buffer): void;
}

/**
 * Parses DC secret bytes and determines the protocol type.
 *
 * - `\xdd` prefix, length >= 17 → DD mode (Padded Intermediate)
 * - `\xee` prefix, length > 17 → TLS mode (Fake TLS)
 * - Otherwise → EF mode (Abridged)
 */
export function parseDCSecret(secret: Buffer): {
    key: Buffer;
    fakeTlsDomain?: string;
} {
    if (secret.length >= 17 && secret[0] === PREFIX_DD_PADDING) {
        return { key: Buffer.from(secret.subarray(1, 1 + SECRET_LEN)) };
    }
    if (secret.length > 1 + SECRET_LEN && secret[0] === PREFIX_FAKE_TLS) {
        return {
            key: Buffer.from(secret.subarray(1, 1 + SECRET_LEN)),
            fakeTlsDomain: secret.subarray(1 + SECRET_LEN).toString("utf8"),
        };
    }
    if (secret.length >= SECRET_LEN) {
        return { key: Buffer.from(secret.subarray(0, SECRET_LEN)) };
    }
    throw new Error(
        `DC secret must be at least ${SECRET_LEN} bytes, got ${secret.length}`
    );
}

/**
 * Obfuscated IO with secret-derived keys (for DC connections with secret).
 * Reuses the same key derivation as MTProxy but without the MTProxy dependency.
 */
class DCSecretObfuscatedIO {
    header?: Buffer;
    private readonly stream: ByteStream;
    private readonly packetCodec: AbridgedPacketCodec;
    private readonly secret: Buffer;
    private readonly dcId: number;
    private readonly dcTag: Buffer;
    private encryptor?: CTR;
    private decryptor?: CTR;

    constructor(connection: any, dcTag: Buffer) {
        this.stream = connection.socket;
        this.packetCodec = connection.PacketCodecClass as unknown as AbridgedPacketCodec;
        this.secret = connection._secret;
        this.dcId = connection._dcId;
        this.dcTag = dcTag;
    }

    async initHeader(): Promise<void> {
        const header = pickObfuscationHeader();
        const reversed = Buffer.from(header.subarray(8, 56)).reverse();

        const encryptKey = await sha256(
            Buffer.concat([header.subarray(8, 40), this.secret])
        );
        const encryptIv = Buffer.from(header.subarray(40, 56));
        const decryptKey = await sha256(
            Buffer.concat([reversed.subarray(0, 32), this.secret])
        );
        const decryptIv = Buffer.from(reversed.subarray(32, 48));

        this.encryptor = new CTR(encryptKey, encryptIv);
        this.decryptor = new CTR(decryptKey, decryptIv);

        // Stamp protocol tag and DC id
        this.dcTag.copy(header, OBF_TAG_OFFSET);
        header.writeInt8(this.dcId, OBF_DC_OFFSET);
        header[OBF_DC_OFFSET + 1] = 0;

        // Re-encrypt the stamped tail
        const encryptedTail = this.encryptor
            .encrypt(header)
            .subarray(OBF_TAG_OFFSET, OBF_HEADER_LEN);
        encryptedTail.copy(header, OBF_TAG_OFFSET);

        this.header = header;
    }

    async read(n: number): Promise<Buffer> {
        const data = await this.stream.readExactly(n);
        return this.decryptor!.encrypt(data);
    }

    write(data: Buffer): void {
        this.stream.write(this.encryptor!.encrypt(data));
    }
}

/**
 * Fake TLS socket wrapper for DC connections with `\xee` secret prefix.
 */
class FakeTlsSocket implements ByteStream {
    private readonly inner: PromisedNetSockets;
    private readonly secret: Buffer;
    private readonly domain: string;
    private clientRandom: Buffer = Buffer.alloc(0);
    private readBuf: Buffer = Buffer.alloc(0);

    constructor(inner: PromisedNetSockets, secret: Buffer, domain: string) {
        this.inner = inner;
        this.secret = secret;
        this.domain = domain;
    }

    async handshake(): Promise<void> {
        const hello = this.buildClientHello();
        this.inner.write(hello);
        await this.readServerHandshake();
    }

    write(data: Buffer): void {
        for (let off = 0; off < data.length; off += 16384) {
            const chunkLen = Math.min(16384, data.length - off);
            const hdr = Buffer.alloc(5);
            hdr[0] = 0x17; // ApplicationData
            hdr[1] = 0x03;
            hdr[2] = 0x03;
            hdr.writeUInt16BE(chunkLen, 3);
            this.inner.write(
                Buffer.concat([hdr, data.subarray(off, off + chunkLen)])
            );
        }
    }

    async readExactly(n: number): Promise<Buffer> {
        while (this.readBuf.length < n) {
            const hdr = await this.inner.readExactly(5);
            const len = hdr.readUInt16BE(3);
            const payload = await this.inner.readExactly(len);
            if (hdr[0] !== 0x17) continue; // skip non-ApplicationData
            this.readBuf = Buffer.concat([this.readBuf, payload]);
        }
        const out = Buffer.from(this.readBuf.subarray(0, n));
        this.readBuf = this.readBuf.subarray(n);
        return out;
    }

    private buildClientHello(): Buffer {
        // Simplified Chrome-like ClientHello for fake TLS
        const sessionId = generateRandomBytes(32);
        const random = Buffer.alloc(32);
        const stamp = require("node:crypto")
            .createHmac("sha256", this.secret)
            .update(Buffer.alloc(517)) // simplified
            .digest();
        stamp.copy(random);

        const sni = Buffer.from(this.domain, "utf8");
        const sniExt = Buffer.concat([
            Buffer.from([0x00, 0x00]), // SNI type
            Buffer.from([0x00, sni.length + 5]), // ext len
            Buffer.from([0x00, sni.length + 3, 0x00]), // server name list
            Buffer.from([0x00, sni.length]), // server name len
            sni,
        ]);

        // Build minimal ClientHello
        const hello = Buffer.concat([
            Buffer.from([0x16, 0x03, 0x01, 0x02, 0x00]), // TLS record
            Buffer.from([0x01, 0x00, 0x01, 0xfc]), // handshake header
            Buffer.from([0x03, 0x03]), // TLS 1.2
            random,
            Buffer.from([sessionId.length]),
            sessionId,
            Buffer.from([0x00, 0x02]), // cipher suites len
            Buffer.from([0x13, 0x01]), // TLS_AES_128_GCM_SHA256
            Buffer.from([0x01, 0x00]), // compression methods
            Buffer.from([0x00, sniExt.length]), // extensions len
            sniExt,
        ]);

        this.clientRandom = random;
        return hello;
    }

    private async readServerHandshake(): Promise<void> {
        // Read ServerHello + ChangeCipherSpec + Finished
        for (let i = 0; i < 3; i++) {
            const hdr = await this.inner.readExactly(5);
            const len = hdr.readUInt16BE(3);
            await this.inner.readExactly(len);
        }
    }
}

/**
 * Connection for DCs with `\xdd` secret prefix (Padded Intermediate + obfuscation).
 */
export class ConnectionTCPDDSecret extends ObfuscatedConnection {
    ObfuscatedIO = DCSecretObfuscatedIO;
    PacketCodecClass = AbridgedPacketCodec;
    _secret: Buffer;
    _dcId: number;

    constructor(params: any) {
        super(params);
        const parsed = parseDCSecret(params.dcSecret);
        this._secret = parsed.key;
        this._dcId = params.dcId;
    }

    async _initConn(): Promise<void> {
        const obf = new (this.ObfuscatedIO as any)(
            this,
            Buffer.from("dddddddd", "hex")
        );
        await obf.initHeader();
        if (!obf.header) {
            throw new Error("Obfuscation header not initialized");
        }
        this._obfuscation = obf;
        this.socket.write(obf.header);
    }
}

/**
 * Connection for DCs with `\xee` secret prefix (Fake TLS + obfuscation).
 */
export class ConnectionTCPTLSSecret extends ObfuscatedConnection {
    ObfuscatedIO = DCSecretObfuscatedIO;
    PacketCodecClass = AbridgedPacketCodec;
    _secret: Buffer;
    _dcId: number;
    _fakeTlsDomain?: string;

    constructor(params: any) {
        super(params);
        const parsed = parseDCSecret(params.dcSecret);
        this._secret = parsed.key;
        this._dcId = params.dcId;
        this._fakeTlsDomain = parsed.fakeTlsDomain;
    }

    async _initConn(): Promise<void> {
        if (this._fakeTlsDomain) {
            const tls = new FakeTlsSocket(
                this.socket,
                this._secret,
                this._fakeTlsDomain
            );
            await tls.handshake();
            this.socket = tls as unknown as PromisedNetSockets;
        }
        const obf = new (this.ObfuscatedIO as any)(
            this,
            Buffer.from("efefefef", "hex")
        );
        await obf.initHeader();
        if (!obf.header) {
            throw new Error("Obfuscation header not initialized");
        }
        this._obfuscation = obf;
        this.socket.write(obf.header);
    }
}
