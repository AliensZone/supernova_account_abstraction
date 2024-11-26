import { AddressType, getAddressInfo } from "bitcoin-address-validation";
import * as bip39 from "bip39";
import { signAsync } from "bitcoinjs-message";
import * as secp256k1 from "@noble/secp256k1";
import * as btc from "@scure/btc-signer";
import { hex } from "@scure/base";
import { crypto } from "bitcoinjs-lib";
import { encode } from "varuint-bitcoin";
import { BIP32Factory, BIP32Interface } from "bip32";
import * as ecc from "@bitcoinerlab/secp256k1";


type NetworkType = "Mainnet" | "Testnet";
type AccountType = "ledger" | "software";

const BTC_SEGWIT_PATH_PURPOSE = `m/84'/`;
const BTC_TAPROOT_PATH_PURPOSE = `m/86'/`;
const BTC_WRAPPED_SEGWIT_PATH_PURPOSE = `m/49'/`;

interface Account {
  id: number;
  stxAddress: string;
  btcAddress: string;
  ordinalsAddress: string;
  masterPubKey: string;
  stxPublicKey: string;
  btcPublicKey: string;
  ordinalsPublicKey: string;
  bnsName?: string;
  accountType?: AccountType;
  accountName?: string;
  deviceAccountIndex?: number;
}

interface BitcoinNetwork {
  bech32: string;
  pubKeyHash: number;
  scriptHash: number;
  wif: number;
}

const bitcoinMainnet: BitcoinNetwork = {
  bech32: "bc",
  pubKeyHash: 0x00,
  scriptHash: 0x05,
  wif: 0x80,
};

const bitcoinTestnet: BitcoinNetwork = {
  bech32: "tb",
  pubKeyHash: 0x6f,
  scriptHash: 0xc4,
  wif: 0xef,
};

const bitcoinNetworks: Record<NetworkType, BitcoinNetwork> = {
  Mainnet: bitcoinMainnet,
  Testnet: bitcoinTestnet,
};

const getBtcNetwork = (networkType: NetworkType) => {
  return bitcoinNetworks[networkType];
};

interface SignBip322MessageOptions {
  accounts: Account[];
  signatureAddress: string;
  message: string;
  network: NetworkType;
  seedPhrase: string;
}

export const signBip322Message = async ({
  accounts,
  message,
  network,
  seedPhrase,
  signatureAddress,
}: SignBip322MessageOptions) => {
  if (!accounts?.length) {
    throw new Error(
      "a List of Accounts are required to derive the correct Private Key"
    );
  }
  const { type } = getAddressInfo(signatureAddress);
  const seed = await bip39.mnemonicToSeed(seedPhrase);
  const bip32 = BIP32Factory(ecc);
  const master = bip32.fromSeed(seed);
  const signingDerivationPath = getSigningDerivationPath(
    accounts,
    signatureAddress,
    network
  );
  const child = master.derivePath(signingDerivationPath);
  if (child.privateKey) {
    if (type === AddressType.p2sh) {
      return (
        await signAsync(message, child.privateKey, false, {
          segwitType: "p2sh(p2wpkh)",
        })
      ).toString("base64");
    }
    const privateKey = child.privateKey?.toString("hex");
    const publicKey = getSigningPk(type, privateKey);
    const txScript = getSignerScript(type, publicKey, getBtcNetwork(network));
    const inputHash = hex.decode(
      "0000000000000000000000000000000000000000000000000000000000000000"
    );
    const txVersion = 0;
    const inputIndex = 4294967295;
    const sequence = 0;
    const scriptSig = btc.Script.encode([
      "OP_0",
      hex.decode(bip0322Hash(message)),
    ]);
    // tx-to-spend
    const txToSpend = new btc.Transaction({
      allowUnknownOutputs: true,
      version: txVersion,
    });
    txToSpend.addOutput({
      amount: BigInt(0),
      script: txScript.script,
    });
    txToSpend.addInput({
      txid: inputHash,
      index: inputIndex,
      sequence,
      finalScriptSig: scriptSig,
    });
    // tx-to-sign
    const txToSign = new btc.Transaction({
      allowUnknownOutputs: true,
      version: txVersion,
    });
    txToSign.addInput({
      txid: txToSpend.id,
      index: 0,
      sequence,
      tapInternalKey: type === AddressType.p2tr ? publicKey : undefined,
      witnessUtxo: {
        script: txScript.script,
        amount: BigInt(0),
      },
      redeemScript: AddressType.p2sh ? txScript.redeemScript : Buffer.alloc(0),
    });
    txToSign.addOutput({
      script: btc.Script.encode(["RETURN"]),
      amount: BigInt(0),
    });
    txToSign.sign(hex.decode(privateKey));
    txToSign.finalize();

    // formulate-signature
    const firstInput = txToSign.getInput(0);
    if (firstInput.finalScriptWitness?.length) {
      const len = encode(firstInput.finalScriptWitness?.length);
      const result = Buffer.concat([
        len,
        ...firstInput.finalScriptWitness.map((w) => encodeVarString(w)),
      ]);
      return result.toString("base64");
    } else {
      return "";
    }
  } else {
    throw new Error("Couldn't sign Message");
  }
};

function getSigningDerivationPath(
  accounts: Array<Account>,
  address: string,
  network: NetworkType
): string {
  const { type } = getAddressInfo(address);

  if (accounts.length <= 0) {
    throw new Error("Invalid accounts list");
  }

  let path = "";

  accounts.forEach((account, index) => {
    if (type === "p2sh") {
      if (account.btcAddress === address) {
        path = getBitcoinDerivationPath({ index: BigInt(index), network });
      }
    } else if (type === "p2wpkh") {
      if (account.btcAddress === address) {
        path = getSegwitDerivationPath({ index: BigInt(index), network });
      }
    } else if (type === "p2tr") {
      if (account.ordinalsAddress === address) {
        path = getTaprootDerivationPath({ index: BigInt(index), network });
      }
    } else {
      throw new Error("Unsupported address type");
    }
  });

  if (path.length <= 0) {
    throw new Error("Address not found");
  }

  return path;
}

function getBitcoinDerivationPath({
  account,
  index,
  network,
}: {
  account?: bigint;
  index: bigint | number;
  network: NetworkType;
}) {
  const accountIndex = account ? account.toString() : "0";
  return network === "Mainnet"
    ? `${BTC_WRAPPED_SEGWIT_PATH_PURPOSE}0'/${accountIndex}'/0/${index.toString()}`
    : `${BTC_WRAPPED_SEGWIT_PATH_PURPOSE}1'/${accountIndex}'/0/${index.toString()}`;
}

const getSigningPk = (type: AddressType, privateKey: string | Buffer) => {
  switch (type) {
    case AddressType.p2tr: {
      return secp256k1.schnorr.getPublicKey(privateKey);
    }
    case AddressType.p2sh: {
      return secp256k1.getPublicKey(privateKey, true);
    }
    case AddressType.p2wpkh: {
      return secp256k1.getPublicKey(privateKey, true);
    }
    default: {
      throw new Error("Unsupported Address Type");
    }
  }
};

const getSignerScript = (
  type: AddressType,
  publicKey: Uint8Array,
  network: BitcoinNetwork
) => {
  switch (type) {
    case AddressType.p2tr: {
      return btc.p2tr(publicKey, undefined, network);
    }
    case AddressType.p2wpkh: {
      return btc.p2wpkh(publicKey, network);
    }
    case AddressType.p2sh: {
      const p2wph = btc.p2wpkh(publicKey, network);
      return btc.p2sh(p2wph, network);
    }
    default: {
      throw new Error("Unsupported Address Type");
    }
  }
};

function bip0322Hash(message: string) {
  const { sha256 } = crypto;
  const tag = "BIP0322-signed-message";
  const tagHash = sha256(Buffer.from(tag));
  const result = sha256(
    Buffer.concat([tagHash, tagHash, Buffer.from(message)])
  );
  return result.toString("hex");
}

function encodeVarString(b: Uint8Array) {
  return Buffer.concat([encode(b.byteLength), b]);
}

function getSegwitDerivationPath({
  account,
  index,
  network,
}: {
  account?: bigint;
  index: bigint | number;
  network: NetworkType;
}) {
  const accountIndex = account ? account.toString() : "0";
  return network === "Mainnet"
    ? `${BTC_SEGWIT_PATH_PURPOSE}0'/${accountIndex}'/0/${index.toString()}`
    : `${BTC_SEGWIT_PATH_PURPOSE}1'/${accountIndex}'/0/${index.toString()}`;
}

function getTaprootDerivationPath({
  account,
  index,
  network,
}: {
  account?: bigint;
  index: bigint | number;
  network: NetworkType;
}) {
  const accountIndex = account ? account.toString() : "0";
  return network === "Mainnet"
    ? `${BTC_TAPROOT_PATH_PURPOSE}0'/${accountIndex}'/0/${index.toString()}`
    : `${BTC_TAPROOT_PATH_PURPOSE}1'/${accountIndex}'/0/${index.toString()}`;
}
