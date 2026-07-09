import bigInt from "big-integer";
export type RegisterResult = "success" | "duplicate" | "tooOld";
export type LookupResult = "notFound" | "needsAck" | "noAckNeeded";
export declare class ReceivedIdsManager {
    private readonly ids;
    registerMsgId(msgId: bigInt.BigInteger, needAck: boolean): RegisterResult;
    lookup(msgId: bigInt.BigInteger): LookupResult;
    markAcked(msgId: bigInt.BigInteger): void;
    min(): bigInt.BigInteger;
    max(): bigInt.BigInteger;
    shrink(): void;
    clear(): void;
    get size(): number;
    private lowerBound;
    private indexOf;
}
