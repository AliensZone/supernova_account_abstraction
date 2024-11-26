//test/03_Execute_Transaction_Supernova.test.ts
import { expect } from "chai";
import { ContractFactory } from "ethers";
import { ethers } from "hardhat";
import btcWallets from "./data/P2TRWallets.json";
import { fillAndPack, fillUserOp, getUserOpHash } from "./utils/AAUtils";
import { signBip322Message } from "./utils/Sign";
const fs = require('fs');

const abi_Test = JSON.parse(fs.readFileSync('./test/data/export/Test/abi.json', 'utf8'));
const abi_EntryPoint = JSON.parse(fs.readFileSync('./test/data/export/EntryPoint/abi.json', 'utf8'));

const txOptions = {
	gasLimit: 30000000, // Set the gas limit for the transaction
};
const activeWallet = btcWallets[0];

const rpcURL = "https://rpc.supernova.zenon.red"

describe("Supernova Live", function () {

	const chainId = 73405;
	const provider = new ethers.providers.JsonRpcProvider(rpcURL);
	const mnemonic = "hood focus chest license repair vocal avocado above into vicious silent exit";
	const deployer = ethers.Wallet.fromMnemonic(mnemonic).connect(provider);

	// Test address is: 0x319B86eb05A3210646Dc014e23F5d73ffcC8A996
	// EntryPoint address is: 0x4f5aD4CBc8F6F21bd6Ecd0E37d844f7a4CDBA87A
	// BitcoinFactory Factory address is: 0x9892B065db43CF67f027b7b22f716C66a61706DD
	// p2tr_calculated_Address: 0x5d2bA0335EA12dEeE8C764377687A86F2e669800
	// Update address after each deploy
	const test_Address = "0x319B86eb05A3210646Dc014e23F5d73ffcC8A996";
	const entryPoint_Address = "0x4f5aD4CBc8F6F21bd6Ecd0E37d844f7a4CDBA87A";
	var p2tr_calculated_Address = "0x5d2bA0335EA12dEeE8C764377687A86F2e669800";
	var p2tr_EntrypointBalance = 0

	it("Start", async function () {

		console.log(`Deployer address: ${deployer.address}`);
		const balance = await provider.getBalance(deployer.address);
		const balanceInEth = ethers.utils.formatEther(balance);
		const balanceP2TR = await provider.getBalance(p2tr_calculated_Address);
		const balanceP2TRInEth = ethers.utils.formatEther(balanceP2TR);

		const contract_aa_EntryPoint = new ethers.Contract(entryPoint_Address, abi_EntryPoint, provider);
		p2tr_EntrypointBalance = await contract_aa_EntryPoint.balanceOf(p2tr_calculated_Address);

		console.log(`Balance: ${balanceInEth} ETH`);
		console.log(`Balance P2TR Account (native): ${balanceP2TRInEth} ETH`);
		console.log(`Balance P2TR Account (EntryPoint): ${ethers.utils.formatEther(p2tr_EntrypointBalance)} ETH`);
	});

	it("Fund Bitcoin Account - P2TR", async function () {
		if (p2tr_EntrypointBalance == 0) {
			// Init EntryPoint contract
			const contract_EntryPoint = new ethers.Contract(entryPoint_Address, abi_EntryPoint, provider);
			// Init transaction and deposit amount
			const txOptionsDeposit = {
				gasLimit: 9999999, // Set the gas limit for the transaction
				value: 5000000000000000
			};
			// Deposit to entry point an amount to fund the P2TR account address
			const tx = await contract_EntryPoint.connect(deployer).depositTo(p2tr_calculated_Address, txOptionsDeposit);
			const receipt = await tx.wait();
			console.log("receipt.status", receipt.status);
			// Verify
			expect(receipt.status).to.equal(1);
		}
	});

	it("Execute Test transaction from Bitcoin Account - P2TR", async function () {
		// Init Test contract
		const contract_Test = new ethers.Contract(test_Address, abi_Test, provider);
		// Init EntryPoint contract
		const contract_EntryPoint = new ethers.Contract(entryPoint_Address, abi_EntryPoint, provider);
		// Init the test contract test value
		const testBalance = 2131
		// Build the payload for Test contract call
		const accountCallData = contract_Test.interface.encodeFunctionData('setAccountBalance', [testBalance])
		// Get contract factory(ethers) for P2TR account
		const factory_BitcoinAccount: ContractFactory = await ethers.getContractFactory("BitcoinAccount");
		// Build the payload for P2TR Account execute method
		const callData = factory_BitcoinAccount.interface.encodeFunctionData('execute', [contract_Test.address, 0, accountCallData])
		// Init user operation
		const uop = {
			sender: p2tr_calculated_Address,
			callData: callData,
			verificationGasLimit: 3e6,
		}
		// Enhance user operation (call gas limit, nonce etd)
		const puop = await fillAndPack(uop, contract_EntryPoint);
		console.log("puop:", puop);
		// Calculate user operation hash for signing
		const dataHashLocal = getUserOpHash(await fillUserOp(uop, contract_EntryPoint), contract_EntryPoint!.address, chainId);
		console.log("dataHashLocal: ", dataHashLocal);
		const dataHashLocalBytes = Buffer.from(dataHashLocal.slice(2), "hex");
		console.log("dataHashLocalBytes: ", dataHashLocalBytes);
		const dataHashLocalBase64 = ethers.utils.base64.encode(dataHashLocalBytes);
		console.log("dataHashLocalBase64: ", dataHashLocalBase64);
		// Sign the user operation hash 
		const signedMessage = await signBip322Message({
			accounts: activeWallet.walletAccounts,
			message: dataHashLocalBase64,
			network: "Mainnet",
			signatureAddress: activeWallet.walletAccounts[0].ordinalsAddress,
			seedPhrase: activeWallet.seedPhrase,
		});
		console.log("signedMessage: ", signedMessage);
		// Add signature to packed user operation
		puop.signature = ethers.utils.hexlify(ethers.utils.base64.decode(signedMessage));
		console.log("puop:", puop);
		// Call EntryPoint handle ops to submit user operation
		const tx = await contract_EntryPoint.connect(deployer).handleOps([puop], deployer.getAddress(), txOptions);
		const receipt = await tx.wait();
		console.log("receipt.status", receipt.status);
		// Call Test contract to check stored value
		const deployersTestsNos = await contract_Test.getAccountBalance();
		// Verify 
		expect(receipt.status).to.equal(1);
		expect(deployersTestsNos).to.equal(testBalance);
	});
});