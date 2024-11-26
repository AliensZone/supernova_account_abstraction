# Bitcoin Account Abstraction for the Supernova EVM extension-chain

## Install dependencies

```bash
npm install
```

## Compile contracts

```bash
npx hardhat compile
```

## Export contracts (ABI/bytecode) artifacts in `./test/data/exports`

```bash
npx hardhat test ./test/00_ExportContracts.test.ts
```

## Deploy contracts on Supernova EVM

```bash
npx hardhat test ./test/01_Deploy_Supernova.test.ts
```

After deployment, update tests `02_...` and `03_...` with the newly deployed contract addresses.

## Create Bitcoin accounts: P2TR and P2SH

```bash
npx hardhat test ./test/02_Create_Accounts_Supernova.test.ts
```

After creating the accounts, update in tests `03_...` the value of `p2tr_calculated_Address`.

## Fund the Bitcoin account and execute a test transaction

```bash
npx hardhat test ./test/03_Execute_Transaction_Supernova.test.ts
```
