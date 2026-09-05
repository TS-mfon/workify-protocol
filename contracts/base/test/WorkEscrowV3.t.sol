// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.30;

import { Test } from "forge-std/Test.sol";
import { BaseTreasuryV2 } from "../v2/BaseTreasuryV2.sol";
import { MockUSDC } from "../v1/MockUSDC.sol";
import { FeeOnTransferMock } from "./FeeOnTransferMock.sol";
import { WorkEscrowV3 } from "../v3/WorkEscrowV3.sol";

contract WorkEscrowV3Test is Test {
    bytes32 private constant VERDICT_TYPEHASH = keccak256(
        "Verdict(bytes32 jobId,uint256 chainId,address escrow,bytes32 verifierId,bytes32 genlayerTxHash,uint8 attempt,bytes32 specificationHash,bytes32 evidenceHash,bytes32 policyHash,uint8 decision,uint16 payoutBps,bytes32 resultHash,uint256 nonce,bool appeal)"
    );
    bytes32 private constant OUTCOME_TYPEHASH = keccak256(
        "AttemptOutcome(bytes32 jobId,uint256 chainId,address escrow,bytes32 verifierId,bytes32 genlayerTxHash,uint8 attempt,bytes32 evidenceHash,bytes32 policyHash,uint8 outcome,uint256 nonce,bool appeal)"
    );

    uint256 private attestorKey = 0xA11CE;
    address private attestor;
    address private owner = makeAddr("owner");
    address private operator = makeAddr("operator");
    address private client = makeAddr("client");
    address private worker = makeAddr("worker");
    bytes32 private specificationHash = keccak256("specification");
    bytes32 private evidenceHash = keccak256("evidence");
    bytes32 private policyHash = keccak256("github-software-v1.0");
    bytes32 private verifierId = keccak256("github-verifier-v1");

    MockUSDC private usdc;
    BaseTreasuryV2 private treasury;
    WorkEscrowV3 private escrow;

    function setUp() external {
        attestor = vm.addr(attestorKey);
        usdc = new MockUSDC();
        treasury = new BaseTreasuryV2(owner);
        escrow = new WorkEscrowV3(address(usdc), address(treasury), owner, attestor, operator);
        usdc.mint(client, 1_000_000e6);
        vm.prank(client);
        usdc.approve(address(escrow), type(uint256).max);
    }

    function testCreateJobLocksFundsAtomically() external {
        bytes32 jobId = _createJob(100e6);
        WorkEscrowV3.Job memory job = escrow.getJob(jobId);
        assertEq(job.client, client);
        assertEq(job.worker, worker);
        assertEq(job.reward, 100e6);
        assertEq(usdc.balanceOf(address(escrow)), 100e6);
    }

    function testFeeOnTransferTokenCannotUnderfundEscrow() external {
        FeeOnTransferMock feeToken = new FeeOnTransferMock();
        WorkEscrowV3 feeEscrow = new WorkEscrowV3(address(feeToken), address(treasury), owner, attestor, operator);
        bytes32 jobId = keccak256("fee-token-job");
        feeToken.mint(client, 100e18);
        vm.prank(client);
        feeToken.approve(address(feeEscrow), type(uint256).max);
        vm.prank(client);
        vm.expectRevert(WorkEscrowV3.UnsupportedTokenBehavior.selector);
        feeEscrow.createFundedJob(jobId, worker, 100e18, uint64(block.timestamp + 7 days), specificationHash, policyHash);
    }

    function testPassPaysWorkerAndTreasury() external {
        bytes32 jobId = _lockedJob(100e6);
        _request(false, jobId);
        _importVerdict(jobId, WorkEscrowV3.Decision.PASS, 10_000, 1, false, 1);
        vm.warp(block.timestamp + 5 minutes + 1);
        escrow.settle(jobId);
        assertEq(usdc.balanceOf(worker), 99e6);
        assertEq(usdc.balanceOf(address(treasury)), 1e6);
        assertEq(usdc.balanceOf(address(escrow)), 0);
    }

    function testRefundsClientWithoutFeeForRejectedVerdict() external {
        uint256 beforeBalance = usdc.balanceOf(client);
        bytes32 jobId = _lockedJob(100e6);
        _request(false, jobId);
        _importVerdict(jobId, WorkEscrowV3.Decision.FAIL, 0, 1, false, 2);
        vm.warp(block.timestamp + 5 minutes + 1);
        escrow.settle(jobId);
        assertEq(usdc.balanceOf(client), beforeBalance);
        assertEq(usdc.balanceOf(address(treasury)), 0);
    }

    function testPartialConservesEscrowAndChargesOnlyWorkerShare() external {
        uint256 clientBefore = usdc.balanceOf(client);
        bytes32 jobId = _lockedJob(101e6);
        _request(false, jobId);
        _importVerdict(jobId, WorkEscrowV3.Decision.PARTIAL, 4_000, 1, false, 3);
        vm.warp(block.timestamp + 5 minutes + 1);
        escrow.settle(jobId);
        uint256 grossWorker = 40_400_000;
        uint256 fee = 404_000;
        assertEq(usdc.balanceOf(worker), grossWorker - fee);
        assertEq(usdc.balanceOf(address(treasury)), fee);
        assertEq(usdc.balanceOf(client), clientBefore - grossWorker);
        assertEq(usdc.balanceOf(address(escrow)), 0);
    }

    function testThirdUndeterminedAttemptSettlesFiftyFifty() external {
        bytes32 jobId = _lockedJob(100e6);
        for (uint8 attempt = 1; attempt <= 3; attempt++) {
            _request(false, jobId);
            _recordUndetermined(jobId, attempt, false, 100 + attempt);
        }
        vm.warp(block.timestamp + 5 minutes + 1);
        escrow.settle(jobId);
        assertEq(usdc.balanceOf(worker), 49_500_000);
        assertEq(usdc.balanceOf(address(treasury)), 500_000);
        WorkEscrowV3.Job memory job = escrow.getJob(jobId);
        assertEq(uint8(job.decision), uint8(WorkEscrowV3.Decision.SPLIT));
    }

    function testExpiredDeliveryRefundIsPermissionless() external {
        uint256 beforeBalance = usdc.balanceOf(client);
        bytes32 jobId = _createJob(100e6);
        WorkEscrowV3.Job memory job = escrow.getJob(jobId);
        vm.warp(job.deliveryDeadline + 1);
        vm.prank(makeAddr("keeper"));
        escrow.refundExpiredJob(jobId);
        assertEq(usdc.balanceOf(client), beforeBalance);
    }

    function testWorkerCanOpenAppealAndFreezeSettlement() external {
        bytes32 jobId = _lockedJob(100e6);
        _request(false, jobId);
        _importVerdict(jobId, WorkEscrowV3.Decision.FAIL, 0, 1, false, 10);
        vm.prank(worker);
        escrow.openAppealIntent(jobId);
        vm.expectRevert();
        escrow.settle(jobId);
    }

    function testAttestationReplayIsRejected() external {
        bytes32 jobId = _lockedJob(100e6);
        _request(false, jobId);
        WorkEscrowV3.VerdictAttestation memory verdict =
            _verdict(jobId, WorkEscrowV3.Decision.PASS, 10_000, 1, false, 55);
        bytes memory signature = _signVerdict(verdict);
        escrow.importFinalVerdict(verdict, signature);
        vm.expectRevert(WorkEscrowV3.Replay.selector);
        escrow.importFinalVerdict(verdict, signature);
    }

    function testForgedAttestationCannotImportVerdict() external {
        bytes32 jobId = _lockedJob(100e6);
        _request(false, jobId);
        WorkEscrowV3.VerdictAttestation memory verdict =
            _verdict(jobId, WorkEscrowV3.Decision.PASS, 10_000, 1, false, 56);
        bytes32 digest = keccak256("forged verdict");
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(0xBAD, digest);
        vm.expectRevert(WorkEscrowV3.InvalidSignature.selector);
        escrow.importFinalVerdict(verdict, abi.encodePacked(r, s, v));
    }

    function testVerdictCannotSubstituteLockedHashes() external {
        bytes32 jobId = _lockedJob(100e6);
        _request(false, jobId);
        WorkEscrowV3.VerdictAttestation memory verdict =
            _verdict(jobId, WorkEscrowV3.Decision.PASS, 10_000, 1, false, 57);
        verdict.evidenceHash = keccak256("attacker evidence");
        vm.expectRevert(WorkEscrowV3.InvalidEvidence.selector);
        escrow.importFinalVerdict(verdict, _signVerdict(verdict));
    }

    function testPermissionlessSettlementCannotRedirectRecipients() external {
        address attacker = makeAddr("maliciousRelayer");
        uint256 clientBefore = usdc.balanceOf(client);
        bytes32 jobId = _lockedJob(100e6);
        _request(false, jobId);
        _importVerdict(jobId, WorkEscrowV3.Decision.PARTIAL, 4_000, 1, false, 58);
        vm.warp(block.timestamp + 5 minutes + 1);

        vm.prank(attacker);
        escrow.settle(jobId);

        assertEq(usdc.balanceOf(attacker), 0);
        assertEq(usdc.balanceOf(worker), 39_600_000);
        assertEq(usdc.balanceOf(address(treasury)), 400_000);
        assertEq(usdc.balanceOf(client), clientBefore - 40e6);
        assertEq(usdc.balanceOf(address(escrow)), 0);
    }

    function testFuzzRewardConservation(uint128 reward, uint16 payoutBps) external {
        reward = uint128(bound(reward, 10_000, 1_000_000e6));
        payoutBps = uint16(bound(payoutBps, 1, 9_999));
        bytes32 jobId = _lockedJob(reward);
        _request(false, jobId);
        _importVerdict(jobId, WorkEscrowV3.Decision.PARTIAL, payoutBps, 1, false, 77);
        vm.warp(block.timestamp + 5 minutes + 1);
        uint256 workerBefore = usdc.balanceOf(worker);
        uint256 clientBefore = usdc.balanceOf(client);
        uint256 treasuryBefore = usdc.balanceOf(address(treasury));
        escrow.settle(jobId);
        uint256 distributed = usdc.balanceOf(worker) - workerBefore + usdc.balanceOf(client) - clientBefore
            + usdc.balanceOf(address(treasury)) - treasuryBefore;
        assertEq(distributed, reward);
    }

    function _createJob(uint128 reward) private returns (bytes32 jobId) {
        jobId = keccak256(abi.encode(block.timestamp, reward, usdc.balanceOf(address(escrow))));
        vm.prank(client);
        escrow.createFundedJob(
            jobId, worker, reward, uint64(block.timestamp + 7 days), specificationHash, policyHash
        );
    }

    function _lockedJob(uint128 reward) private returns (bytes32 jobId) {
        jobId = _createJob(reward);
        vm.prank(worker);
        escrow.submitOrReplaceDelivery(jobId, evidenceHash);
        vm.prank(worker);
        escrow.lockDelivery(jobId);
    }

    function _request(bool appeal, bytes32 jobId) private {
        vm.prank(operator);
        escrow.requestVerification(jobId, appeal);
    }

    function _verdict(
        bytes32 jobId,
        WorkEscrowV3.Decision decision,
        uint16 payoutBps,
        uint8 attempt,
        bool appeal,
        uint256 nonce
    ) private view returns (WorkEscrowV3.VerdictAttestation memory) {
        return WorkEscrowV3.VerdictAttestation({
            jobId: jobId,
            verifierId: verifierId,
            genlayerTxHash: keccak256(abi.encode("genlayer", nonce)),
            attempt: attempt,
            specificationHash: specificationHash,
            evidenceHash: evidenceHash,
            policyHash: policyHash,
            decision: decision,
            payoutBps: payoutBps,
            resultHash: keccak256(abi.encode("result", nonce)),
            nonce: nonce,
            appeal: appeal
        });
    }

    function _importVerdict(
        bytes32 jobId,
        WorkEscrowV3.Decision decision,
        uint16 payoutBps,
        uint8 attempt,
        bool appeal,
        uint256 nonce
    ) private {
        WorkEscrowV3.VerdictAttestation memory verdict =
            _verdict(jobId, decision, payoutBps, attempt, appeal, nonce);
        escrow.importFinalVerdict(verdict, _signVerdict(verdict));
    }

    function _recordUndetermined(bytes32 jobId, uint8 attempt, bool appeal, uint256 nonce) private {
        WorkEscrowV3.OutcomeAttestation memory outcome = WorkEscrowV3.OutcomeAttestation({
            jobId: jobId,
            verifierId: verifierId,
            genlayerTxHash: keccak256(abi.encode("undetermined", nonce)),
            attempt: attempt,
            evidenceHash: evidenceHash,
            policyHash: policyHash,
            outcome: WorkEscrowV3.AttemptOutcome.UNDETERMINED,
            nonce: nonce,
            appeal: appeal
        });
        bytes32 structHash = keccak256(
            abi.encode(
                OUTCOME_TYPEHASH,
                outcome.jobId,
                block.chainid,
                address(escrow),
                outcome.verifierId,
                outcome.genlayerTxHash,
                outcome.attempt,
                outcome.evidenceHash,
                outcome.policyHash,
                outcome.outcome,
                outcome.nonce,
                outcome.appeal
            )
        );
        escrow.recordAttemptOutcome(outcome, _sign(structHash));
    }

    function _signVerdict(WorkEscrowV3.VerdictAttestation memory verdict)
        private
        view
        returns (bytes memory)
    {
        bytes32 structHash = keccak256(
            abi.encode(
                VERDICT_TYPEHASH,
                verdict.jobId,
                block.chainid,
                address(escrow),
                verdict.verifierId,
                verdict.genlayerTxHash,
                verdict.attempt,
                verdict.specificationHash,
                verdict.evidenceHash,
                verdict.policyHash,
                verdict.decision,
                verdict.payoutBps,
                verdict.resultHash,
                verdict.nonce,
                verdict.appeal
            )
        );
        return _sign(structHash);
    }

    function _sign(bytes32 structHash) private view returns (bytes memory) {
        bytes32 domainSeparator = keccak256(
            abi.encode(
                keccak256(
                    "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
                ),
                keccak256("Workify"),
                keccak256("2"),
                block.chainid,
                address(escrow)
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(attestorKey, digest);
        return abi.encodePacked(r, s, v);
    }
}
