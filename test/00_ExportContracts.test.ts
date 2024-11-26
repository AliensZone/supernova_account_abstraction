//test/00_ExportContracts.test.ts
const fs = require('fs');
const path = require('path');

describe("Export Contracts", function () {

	it("Export", async function () {
		var contract:any
		const folderPath = path.join(__dirname, "data","export");

		if (fs.existsSync(folderPath)) {
				fs.rmSync(folderPath, { recursive: true, force: true });
				fs.mkdirSync(folderPath);
		} else {
				fs.mkdirSync(folderPath);
		}
		fs.mkdirSync(path.join(folderPath, "Test"));
		fs.mkdirSync(path.join(folderPath, "EntryPoint"));
		fs.mkdirSync(path.join(folderPath, "BitcoinFactory"));
		fs.mkdirSync(path.join(folderPath, "BitcoinAccount"));
		
		// Test
		contract = JSON.parse(fs.readFileSync(path.join(__dirname, '../artifacts/contracts/account-abstraction/main/Test.sol/Test.json'), 'utf8'));
		fs.writeFileSync(path.join(folderPath, "Test","bytecode.txt"), contract.bytecode.slice(2));
		fs.writeFileSync(path.join(folderPath, "Test","abi.json"), JSON.stringify(contract.abi, null, 2));

		// EntryPoint
		contract = JSON.parse(fs.readFileSync(path.join(__dirname, '../artifacts/contracts/account-abstraction/main/EntryPoint.sol/EntryPoint.json'), 'utf8'));
		fs.writeFileSync(path.join(folderPath, "EntryPoint","bytecode.txt"), contract.bytecode.slice(2));
		fs.writeFileSync(path.join(folderPath, "EntryPoint","abi.json"), JSON.stringify(contract.abi, null, 2));

		// BitcoinFactory
		contract = JSON.parse(fs.readFileSync(path.join(__dirname, '../artifacts/contracts/account-abstraction/main/BitcoinFactory.sol/BitcoinFactory.json'), 'utf8'));
		fs.writeFileSync(path.join(folderPath, "BitcoinFactory","bytecode.txt"), contract.bytecode.slice(2));
		fs.writeFileSync(path.join(folderPath, "BitcoinFactory","abi.json"), JSON.stringify(contract.abi, null, 2));
		
		// BitcoinAccount
		contract = JSON.parse(fs.readFileSync(path.join(__dirname, '../artifacts/contracts/account-abstraction/main/BitcoinAccount.sol/BitcoinAccount.json'), 'utf8'));
		fs.writeFileSync(path.join(folderPath, "BitcoinAccount","bytecode.txt"), contract.bytecode.slice(2));
		fs.writeFileSync(path.join(folderPath, "BitcoinAccount","abi.json"), JSON.stringify(contract.abi, null, 2));

		console.log("Contracts exported in",folderPath);
	});
});