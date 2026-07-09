import bigInt from "big-integer";
import Deferred from "../extensions/Deferred";
import { Api } from "../tl";
export declare class RequestState {
    containerId?: bigInt.BigInteger;
    msgId?: bigInt.BigInteger;
    forcedMsgId?: bigInt.BigInteger;
    request: any;
    data: Buffer;
    after: any;
    result: undefined;
    finished: Deferred;
    promise: Promise<unknown> | undefined;
    acknowledged: boolean;
    resolve: (value?: any) => void;
    reject: (reason?: any) => void;
    constructor(request: Api.AnyRequest | Api.MsgsAck | Api.MsgsStateInfo);
    isReady(): any;
    resetPromise(): void;
}
