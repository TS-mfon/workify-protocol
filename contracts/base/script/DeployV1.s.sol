// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.30;

import { Script } from "forge-std/Script.sol";
import { BaseTreasuryV1 } from "../v1/BaseTreasuryV1.sol";
import { WorkEscrowV1 } from "../v1/WorkEscrowV1.sol";

contract DeployV1 is Script {
    address internal constant BASE_SEPOLIA_USDC = 0x036CbD53842c5426634e7929541eC2318f3dCF7e;
    address internal constant TREASURY_OWNER = 0x5905c9Dea6Ae52AA0947D8F7F218263889eDfC4E;

    function run() external returns (BaseTreasuryV1 treasury, WorkEscrowV1 escrow) {
        uint256 deployerKey = vm.envUint("BASE_SEPOLIA_DEPLOYER_PRIVATE_KEY");
        address attestor = vm.envAddress("VERDICT_ATTESTOR_ADDRESS");
        address operator = vm.envAddress("BASE_AUTOMATION_OPERATOR");
        vm.startBroadcast(deployerKey);
        treasury = new BaseTreasuryV1(TREASURY_OWNER);
        escrow = new WorkEscrowV1(
            BASE_SEPOLIA_USDC,
            address(treasury),
            TREASURY_OWNER,
            attestor,
            operator
        );
        vm.stopBroadcast();
    }
}
