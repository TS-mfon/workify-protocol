// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.30;

import { Script } from "forge-std/Script.sol";
import { BaseTreasuryV2 } from "../v2/BaseTreasuryV2.sol";
import { WorkEscrowV2 } from "../v2/WorkEscrowV2.sol";

contract DeployV2 is Script {
    address internal constant BASE_SEPOLIA_USDC = 0x036CbD53842c5426634e7929541eC2318f3dCF7e;

    function run() external returns (BaseTreasuryV2 treasury, WorkEscrowV2 escrow) {
        uint256 deployerKey = vm.envUint("BASE_SEPOLIA_DEPLOYER_PRIVATE_KEY");
        address owner = vm.envAddress("WORKIFY_OWNER_ADDRESS");
        address attestor = vm.envAddress("VERDICT_ATTESTOR_ADDRESS");
        address operator = vm.envAddress("BASE_AUTOMATION_OPERATOR");
        vm.startBroadcast(deployerKey);
        treasury = new BaseTreasuryV2(owner);
        escrow = new WorkEscrowV2(BASE_SEPOLIA_USDC, address(treasury), owner, attestor, operator);
        vm.stopBroadcast();
    }
}
