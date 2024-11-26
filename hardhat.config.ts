import { HardhatUserConfig } from "hardhat/config";
import "@nomiclabs/hardhat-waffle";
import "@nomiclabs/hardhat-ethers";

const config: HardhatUserConfig = {
  solidity: {
    compilers: [{
      version: '0.8.23',
      settings: {
        optimizer: { enabled: true, runs: 1000000 },
      }
    },
  ],
  },
  networks: {
    hardhat: {
      chainId: 31337, // The chain ID used for Hardhat network
      loggingEnabled: false, // Enable detailed logging
    },
    localhost: {
      url: "http://127.0.0.1:8545", // Localhost Hardhat node
      chainId: 1337, // Custom Chain ID for localhost
    },
    supernova: {
      url: "https://rpc.novascan.io", // Localhost Hardhat node
      chainId: 73405, // Custom Chain ID for supernova
    },
    supernova_fallback: {
      url: "https://rpc.supernova.zenon.red", // Localhost Hardhat node
      chainId: 73405, // Custom Chain ID for supernova
    },
  },
  paths: {
    sources: "./contracts", // Directory for your smart contracts
    tests: "./test", // Directory for your tests
    cache: "./cache", // Cache directory
    artifacts: "./artifacts", // Artifacts directory
  },
  mocha: {
    timeout: 60000, // Timeout for tests (optional)
  },
};

export default config;
