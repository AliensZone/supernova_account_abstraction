//test/02_Create_Accounts_Supernova.test.ts
import { expect } from "chai";
import { ethers } from "hardhat";
import btcWallets from "./data/P2TRWallets.json";
const fs = require('fs');

const abi_BitcoinFactory = JSON.parse(fs.readFileSync('./test/data/export/BitcoinFactory/abi.json', 'utf8'));
const abi_BitcoinAccount = JSON.parse(fs.readFileSync('./test/data/export/BitcoinAccount/abi.json', 'utf8'));

const txOptions = {
    gasLimit: 30000000, // Set the gas limit for the transaction
};

const activeWallet = btcWallets[0];

const rpcURL = "https://rpc.supernova.zenon.red"

describe("Create BTC Associated Accounts", function () {

    const provider = new ethers.providers.JsonRpcProvider(rpcURL);
    const mnemonic = "hood focus chest license repair vocal avocado above into vicious silent exit";
    const deployer = ethers.Wallet.fromMnemonic(mnemonic).connect(provider);

    // Test address is: 0x319B86eb05A3210646Dc014e23F5d73ffcC8A996
    // EntryPoint address is: 0x4f5aD4CBc8F6F21bd6Ecd0E37d844f7a4CDBA87A
    // BitcoinFactory Factory address is: 0x9892B065db43CF67f027b7b22f716C66a61706DD
    // Update address after each deploy
    const factory_Address = "0x9892B065db43CF67f027b7b22f716C66a61706DD";

    it("Start", async function () {
        console.log(`Deployer address: ${deployer.address}`);
        const balance = await provider.getBalance(deployer.address);
        const balanceInEth = ethers.utils.formatEther(balance);
        console.log(`Balance: ${balanceInEth} ETH`);
    });

    it("Create Bitcoin Account - P2TR", async function () {
        // Init Bitcoin Factory contract
        const contract_BitcoinFactory = new ethers.Contract(factory_Address, abi_BitcoinFactory, provider);

        // Get address
        const ordinalsAddressBytes = ethers.utils.toUtf8Bytes(activeWallet.walletAccounts[0].ordinalsAddress);
        console.log("ordinalsAddress:", activeWallet.walletAccounts[0].ordinalsAddress);
        console.log("ordinalsAddress.bytes:", ordinalsAddressBytes);

        // Calculate future address of this P2TR account based on script pub key
        const p2tr_calculated_Address = await contract_BitcoinFactory.getAddress(ordinalsAddressBytes, 0);
        console.log(`p2tr_calculated_Address: ${p2tr_calculated_Address}`);

        // Create the account
        const tx = await contract_BitcoinFactory.connect(deployer).createAccount(ordinalsAddressBytes, 0, txOptions);
        await tx.wait();
        const receipt = await tx.wait();
        console.log("receipt.status", receipt.status);

        // Init P2TR Account contract
        const contract_BitcoinAccount = new ethers.Contract(p2tr_calculated_Address, abi_BitcoinAccount, provider);

        // Call contract 
        const actualOrdinalsAddressBytes = await contract_BitcoinAccount.getBitcoinAddress();
        console.log(`actualOrdinalsAddressBytes: ${actualOrdinalsAddressBytes}`);
        const actualOrdinalsAddress = ethers.utils.toUtf8String(actualOrdinalsAddressBytes);
        console.log(`actualOrdinalsAddress: ${actualOrdinalsAddress}`);

        // Verify
        expect(activeWallet.walletAccounts[0].ordinalsAddress).to.equal(actualOrdinalsAddress);
    });

    it("Create Bitcoin Account - P2SH", async function () {
        // Init Bitcoin Factory contract
        const contract_BitcoinFactory = new ethers.Contract(factory_Address, abi_BitcoinFactory, provider);

        // Get address
        const btcAddressBytes = ethers.utils.toUtf8Bytes(activeWallet.walletAccounts[0].btcAddress);
        console.log("btcAddressBytes:", activeWallet.walletAccounts[0].btcAddress);
        console.log("btcAddressBytes.bytes:", btcAddressBytes);

        // Calculate future address of this P2TR account based on script pub key
        const p2sh_calculated_Address = await contract_BitcoinFactory.getAddress(btcAddressBytes, 0);
        console.log(`p2sh_calculated_Address: ${p2sh_calculated_Address}`);

        // Create the account
        const tx = await contract_BitcoinFactory.connect(deployer).createAccount(btcAddressBytes, 0, txOptions);
        await tx.wait();
        const receipt = await tx.wait();
        console.log("receipt.status", receipt.status);

        // Init P2SH Account contract
        const contract_BitcoinAccount = new ethers.Contract(p2sh_calculated_Address, abi_BitcoinAccount, provider);

        // Call contract 
        const actualBtcAddressBytes = await contract_BitcoinAccount.getBitcoinAddress();
        console.log(`actualBtcAddressBytes: ${actualBtcAddressBytes}`);
        const actualBtcAddress = ethers.utils.toUtf8String(actualBtcAddressBytes);
        console.log(`actualBtcAddress: ${actualBtcAddress}`);

        // Verify
        expect(activeWallet.walletAccounts[0].btcAddress).to.equal(actualBtcAddress);
    });
});