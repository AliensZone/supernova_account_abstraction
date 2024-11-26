// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.23;

import "@openzeppelin/contracts/utils/Base64.sol";

/**
 * Utility function to verify bitcoin signatures for p2sh and p2tr
 */
library BitcoinLib {
    address constant precompiledBitcoinVerifier = address(255);

    function verifyBitcoinSignature(
        bytes memory bitcoinAddress,
        bytes memory signature,
        bytes32 userOphash
    ) internal view returns (bool) {
        string memory message = Base64.encode(abi.encodePacked(userOphash));
        bytes memory data = abi.encode(bitcoinAddress, signature, message);
        (bool success, bytes memory result) = precompiledBitcoinVerifier
            .staticcall(data);
        if (!success) {
            return false;
        }
        if (result.length > 0) {
            if (result[0] == 0x00) {
                return false;
            } else {
                return true;
            }
        } else {
            return false;
        }
        // return true;
    }
}
