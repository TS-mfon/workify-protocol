// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.30;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract FeeOnTransferMock is ERC20 {
    constructor() ERC20("Fee Token", "FEE") { }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function _update(address from, address to, uint256 amount) internal override {
        if (from != address(0) && to != address(0)) {
            uint256 fee = amount / 10;
            super._update(from, to, amount - fee);
            super._update(from, address(0), fee);
            return;
        }
        super._update(from, to, amount);
    }
}
