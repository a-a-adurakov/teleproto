import bigInt from "big-integer";
import { AuthKey } from "../crypto/AuthKey";

export class Dcenter {
    readonly dcId: number;
    readonly authKey: AuthKey;
    readonly mediaTempKey = new AuthKey();
    private _salt: bigInt.BigInteger;

    mediaBound = false;
    mediaTempExpiresAt = 0;

    constructor(dcId: number, authKey?: AuthKey) {
        this.dcId = dcId;
        this._salt = bigInt.zero;
        this.authKey = authKey ?? new AuthKey();
    }

    get mediaTempUsable(): boolean {
        return true;
    }

    resetMediaTempKey(): void {
        this.mediaTempKey.setKey(
            undefined
        );

        this.mediaBound = false;
        this.mediaTempExpiresAt = 0;
    }

    get salt(): bigInt.BigInteger {
        return this._salt;
    }

    updateSalt(salt: bigInt.BigInteger | undefined | null): void {
        if (salt && !salt.isZero()) {
            this._salt = salt;
        }
    }
}

export class DcenterRegistry {
    private readonly _dcs = new Map<number, Dcenter>();

    get(dcId: number, seedKey?: AuthKey): Dcenter {
        let dc = this._dcs.get(dcId);
        if (!dc) {
            dc = new Dcenter(dcId, seedKey);
            const result = this._dcs.set(dcId, dc);
        }
        return dc;
    }

    clear(): void {
        this._dcs.clear();
    }
}