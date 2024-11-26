import { Address } from "bip322-js";
const fast_sha256_1 = require("fast-sha256");

export function getPublicKeyForEth(address: string, pub: string): { pubKeyHex: string; addressType: string } {
    // Check whether the given signerAddress is valid
    if (!Address.isValidBitcoinAddress(address)) {
        throw new Error("Invalid Bitcoin address is provided.");
    }
    if (Address.isP2SH(address)) {
        return { pubKeyHex: "0x" + Array.from(Uint8Array.from(Buffer.from(pub, 'hex'))).map(byte => byte.toString(16).padStart(2, '0')).join(''), addressType: "p2sh" }
    } else if (Address.isP2TR(address)) {
        return { pubKeyHex: "0x" + Array.from(Uint8Array.from(Address.convertAdressToScriptPubkey(address))).map(byte => byte.toString(16).padStart(2, '0')).join(''), addressType: "p2tr" }
    } else {
        throw new Error("Only P2SH and P2TR address types accepted");
    }
}
