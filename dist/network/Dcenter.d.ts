import bigInt from "big-integer";
import { AuthKey } from "../crypto/AuthKey";
export declare class Dcenter {
    readonly dcId: number;
    readonly authKey: AuthKey;
    private _salt;
    readonly mediaTempKey: AuthKey;
    mediaTempExpiresAt: number;
    mediaBound: boolean;
    mediaTempFailed: boolean;
    constructor(dcId: number, authKey?: AuthKey);
    get mediaTempUsable(): boolean;
    resetMediaTempKey(): void;
    get salt(): bigInt.BigInteger;
    updateSalt(salt: bigInt.BigInteger | undefined | null): void;
}
export declare class DcenterRegistry {
    private readonly _dcs;
    get(dcId: number, seedKey?: AuthKey): Dcenter;
    clear(): void;
}
