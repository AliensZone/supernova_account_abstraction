// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.23;

contract Test {
    event BalanceChangeEvent(address indexed sender, uint256 value);

    uint256 private balance;

    function setAccountBalance(uint256 value) public {
        balance = value;
        emit BalanceChangeEvent(msg.sender, value);
    }

    function getAccountBalance() public view returns (uint256) {
        return balance;
    }
}
