"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConnectionTCPTLSSecret = exports.ConnectionTCPDDSecret = void 0;
exports.parseDCSecret = parseDCSecret;
const Connection_1 = require("./Connection");
const Abridged_1 = require("./codec/Abridged");
const Helpers_1 = require("../../Helpers");
const CTR_1 = require("../../crypto/CTR");
const SECRET_LEN = 16;
const PREFIX_FAKE_TLS = 0xee;
const PREFIX_DD_PADDING = 0xdd;
const OBF_HEADER_LEN = 64;
const OBF_TAG_OFFSET = 56;
const OBF_DC_OFFSET = 60;
const FORBIDDEN_HEADER_PREFIXES = [
    Buffer.from("50567247", "hex"),
    Buffer.from("474554", "hex"),
    Buffer.from("504f5354", "hex"),
    Buffer.from("eeeeeeee", "hex"),
];
function pickObfuscationHeader() {
    while (true) {
        const candidate = (0, Helpers_1.generateRandomBytes)(OBF_HEADER_LEN);
        if (candidate[0] === 0xef)
            continue;
        if (candidate.subarray(4, 8).equals(Buffer.alloc(4)))
            continue;
        const head4 = candidate.subarray(0, 4);
        if (FORBIDDEN_HEADER_PREFIXES.some((p) => p.equals(head4)))
            continue;
        return candidate;
    }
}
/**
 * Parses DC secret bytes and determines the protocol type.
 *
 * - `\xdd` prefix, length >= 17 → DD mode (Padded Intermediate)
 * - `\xee` prefix, length > 17 → TLS mode (Fake TLS)
 * - Otherwise → EF mode (Abridged)
 */
function parseDCSecret(secret) {
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
    throw new Error(`DC secret must be at least ${SECRET_LEN} bytes, got ${secret.length}`);
}
/**
 * Obfuscated IO with secret-derived keys (for DC connections with secret).
 * Reuses the same key derivation as MTProxy but without the MTProxy dependency.
 */
class DCSecretObfuscatedIO {
    constructor(connection, dcTag) {
        this.dcTag = dcTag;
        this.dcId = connection._dcId;
        this.secret = connection._secret;
        this.stream = connection.socket;
        this.packetCodec = connection.PacketCodecClass;
    }
    async initHeader() {
        const header = pickObfuscationHeader();
        const reversed = Buffer.from(header.subarray(8, 56)).reverse();
        const encryptKey = await (0, Helpers_1.sha256)(Buffer.concat([header.subarray(8, 40), this.secret]));
        const encryptIv = Buffer.from(header.subarray(40, 56));
        const decryptKey = await (0, Helpers_1.sha256)(Buffer.concat([reversed.subarray(0, 32), this.secret]));
        const decryptIv = Buffer.from(reversed.subarray(32, 48));
        this.encryptor = new CTR_1.CTR(encryptKey, encryptIv);
        this.decryptor = new CTR_1.CTR(decryptKey, decryptIv);
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
    async read(n) {
        const data = await this.stream.readExactly(n);
        return this.decryptor.encrypt(data);
    }
    write(data) {
        this.stream.write(this.encryptor.encrypt(data));
    }
}
/**
 * Fake TLS socket wrapper for DC connections with `\xee` secret prefix.
 */
class FakeTlsSocket {
    constructor(inner, secret, domain) {
        this.clientRandom = Buffer.alloc(0);
        this.readBuf = Buffer.alloc(0);
        this.inner = inner;
        this.secret = secret;
        this.domain = domain;
    }
    async handshake() {
        const hello = this.buildClientHello();
        this.inner.write(hello);
        await this.readServerHandshake();
    }
    write(data) {
        for (let off = 0; off < data.length; off += 16384) {
            const chunkLen = Math.min(16384, data.length - off);
            const hdr = Buffer.alloc(5);
            hdr[0] = 0x17; // ApplicationData
            hdr[1] = 0x03;
            hdr[2] = 0x03;
            hdr.writeUInt16BE(chunkLen, 3);
            this.inner.write(Buffer.concat([hdr, data.subarray(off, off + chunkLen)]));
        }
    }
    async readExactly(n) {
        while (this.readBuf.length < n) {
            const hdr = await this.inner.readExactly(5);
            const len = hdr.readUInt16BE(3);
            const payload = await this.inner.readExactly(len);
            if (hdr[0] !== 0x17)
                continue; // skip non-ApplicationData
            this.readBuf = Buffer.concat([this.readBuf, payload]);
        }
        const out = Buffer.from(this.readBuf.subarray(0, n));
        this.readBuf = this.readBuf.subarray(n);
        return out;
    }
    buildClientHello() {
        // Simplified Chrome-like ClientHello for fake TLS
        const sessionId = (0, Helpers_1.generateRandomBytes)(32);
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
    async readServerHandshake() {
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
class ConnectionTCPDDSecret extends Connection_1.ObfuscatedConnection {
    constructor(params) {
        super(params);
        this.ObfuscatedIO = DCSecretObfuscatedIO;
        this.PacketCodecClass = Abridged_1.AbridgedPacketCodec;
        const parsed = parseDCSecret(params.dcSecret);
        this._secret = parsed.key;
        this._dcId = params.dcId;
    }
    async _initConn() {
        this._obfuscation = new this.ObfuscatedIO(this, Buffer.from("dddddddd", "hex"));
        await this._obfuscation.initHeader();
        this.socket.write(this._obfuscation.header);
    }
}
exports.ConnectionTCPDDSecret = ConnectionTCPDDSecret;
/**
 * Connection for DCs with `\xee` secret prefix (Fake TLS + obfuscation).
 */
class ConnectionTCPTLSSecret extends Connection_1.ObfuscatedConnection {
    constructor(params) {
        super(params);
        this.ObfuscatedIO = DCSecretObfuscatedIO;
        this.PacketCodecClass = Abridged_1.AbridgedPacketCodec;
        const parsed = parseDCSecret(params.dcSecret);
        this._secret = parsed.key;
        this._dcId = params.dcId;
        this._fakeTlsDomain = parsed.fakeTlsDomain;
    }
    async _initConn() {
        if (this._fakeTlsDomain) {
            const tls = new FakeTlsSocket(this.socket, this._secret, this._fakeTlsDomain);
            await tls.handshake();
            this.socket = tls;
        }
        this._obfuscation = new this.ObfuscatedIO(this, Buffer.from("efefefef", "hex"));
        await this._obfuscation.initHeader();
        this.socket.write(this._obfuscation.header);
    }
}
exports.ConnectionTCPTLSSecret = ConnectionTCPTLSSecret;
