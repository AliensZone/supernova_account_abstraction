//test/01_Deploy_Supernova.test.ts
import { ethers } from "hardhat";
const fs = require('fs');

const abi_Test = JSON.parse(fs.readFileSync('./test/data/export/Test/abi.json', 'utf8'));
const bytecode_Test = fs.readFileSync('./test/data/export/Test/bytecode.txt', 'utf8');

const abi_EntryPoint = JSON.parse(fs.readFileSync('./test/data/export/EntryPoint/abi.json', 'utf8'));
const bytecode_EntryPoint = fs.readFileSync('./test/data/export/EntryPoint/bytecode.txt', 'utf8');

const abi_BitcoinFactory = JSON.parse(fs.readFileSync('./test/data/export/BitcoinFactory/abi.json', 'utf8'));
const bytecode_BitcoinFactory = fs.readFileSync('./test/data/export/BitcoinFactory/bytecode.txt', 'utf8');

const abi_BitcoinAccount = JSON.parse(fs.readFileSync('./test/data/export/BitcoinAccount/abi.json', 'utf8'));
const bytecode_BitcoinAccount = fs.readFileSync('./test/data/export/BitcoinAccount/bytecode.txt', 'utf8');

const rpcURL = "https://rpc.supernova.zenon.red"

describe("Deploy", function () {

    const provider = new ethers.providers.JsonRpcProvider(rpcURL);
    const mnemonic = "hood focus chest license repair vocal avocado above into vicious silent exit"; // 0x90C24A7C698B2Ff91B68B92cb95968EB6275597D
    const deployer = ethers.Wallet.fromMnemonic(mnemonic).connect(provider);

    it("Start", async function () {
        console.log(`Deployer address: ${deployer.address}`);
        const balance = await provider.getBalance(deployer.address);
        const balanceInEth = ethers.utils.formatEther(balance);
        console.log(`Balance: ${balanceInEth} ETH`);
    });

    it("Deploy", async function () {
        const factory_Test = new ethers.ContractFactory(abi_Test, bytecode_Test, deployer);
        const contract_Test = await factory_Test.deploy();
        await contract_Test.deployed();
        console.log(`Test address is: ${contract_Test.address}`);

        const factory_EntryPoint = new ethers.ContractFactory(abi_EntryPoint, bytecode_EntryPoint, deployer);
        const contract_EntryPoint = await factory_EntryPoint.deploy();
        await contract_EntryPoint.deployed();
        console.log(`EntryPoint address is: ${contract_EntryPoint.address}`);

        const factory_BitcoinFactory = new ethers.ContractFactory(abi_BitcoinFactory, bytecode_BitcoinFactory, deployer);
        const contract_BitcoinFactory = await factory_BitcoinFactory.deploy(contract_EntryPoint.address);
        await contract_BitcoinFactory.deployed();
        console.log(`BitcoinFactory Factory address is: ${contract_BitcoinFactory.address}`);
    });
});