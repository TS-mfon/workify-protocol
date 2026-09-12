// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.30;

import { Test } from "forge-std/Test.sol";
import { BaseTreasuryV2 } from "../v2/BaseTreasuryV2.sol";
import { MockUSDC } from "../v1/MockUSDC.sol";
import { WorkEscrowV4 } from "../v4/WorkEscrowV4.sol";

contract WorkEscrowV4Test is Test {
    uint256 private constant ATTESTOR_KEY = 0xA11CE;
    address private attestor;
    address private owner = makeAddr("owner");
    address private operator = makeAddr("operator");
    address private client = makeAddr("client");
    address private worker = makeAddr("worker");
    bytes32 private specificationHash = keccak256("specification");
    bytes32 private evidenceHash = keccak256("evidence");
    bytes32 private policyHash = keccak256("content-document-v12.0");
    bytes32 private verifierId = keccak256("document-verifier-v12");
    bytes32 private constant APPEAL_FUNDED_TYPEHASH = keccak256(
        "AppealFunded(bytes32 jobId,uint256 chainId,address escrow,address appellant,bytes32 genlayerPaymentTxHash,uint256 nonce)"
    );
    MockUSDC private usdc;
    BaseTreasuryV2 private treasury;
    WorkEscrowV4 private escrow;

    function setUp() external {
        attestor = vm.addr(ATTESTOR_KEY);
        usdc = new MockUSDC();
        treasury = new BaseTreasuryV2(owner);
        escrow = new WorkEscrowV4(address(usdc), address(treasury), owner, attestor, operator);
        usdc.mint(client, 1_000e6);
        vm.prank(client);
        usdc.approve(address(escrow), type(uint256).max);
    }

    function testCreateFundedJobLocksReward() external {
        bytes32 jobId = _createJob(1e6);
        WorkEscrowV4.Job memory job = escrow.getJob(jobId);
        assertEq(job.client, client);
        assertEq(job.worker, worker);
        assertEq(job.reward, 1e6);
        assertEq(uint8(job.status), uint8(WorkEscrowV4.Status.AWAITING_DELIVERY));
        assertEq(usdc.balanceOf(address(escrow)), 1e6);
    }

    function testPassSettlementUsesFixedRecipientsAndFee() external {
        bytes32 jobId = _lockedJob();
        vm.prank(operator);
        escrow.requestVerification(jobId, false);
        WorkEscrowV4.VerdictAttestation memory verdict = _verdict(jobId, WorkEscrowV4.Decision.PASS, 10_000, 1, false, 1);
        escrow.importFinalVerdict(verdict, _signVerdict(verdict));
        vm.warp(block.timestamp + escrow.APPEAL_WINDOW() + 1);
        escrow.settle(jobId);
        assertEq(usdc.balanceOf(worker), 990_000);
        assertEq(usdc.balanceOf(address(treasury)), 10_000);
        assertEq(usdc.balanceOf(address(escrow)), 0);
    }

    function testReplayNonceRejected() external {
        bytes32 jobId = _lockedJob();
        vm.prank(operator);
        escrow.requestVerification(jobId, false);
        WorkEscrowV4.VerdictAttestation memory verdict = _verdict(jobId, WorkEscrowV4.Decision.FAIL, 0, 1, false, 7);
        bytes memory signature = _signVerdict(verdict);
        escrow.importFinalVerdict(verdict, signature);
        vm.expectRevert(WorkEscrowV4.Replay.selector);
        escrow.importFinalVerdict(verdict, signature);
    }

    function testAppealResolutionEmitsDedicatedEvent() external {
        bytes32 jobId = _lockedJob();
        vm.prank(operator);
        escrow.requestVerification(jobId, false);
        WorkEscrowV4.VerdictAttestation memory initial = _verdict(jobId, WorkEscrowV4.Decision.FAIL, 0, 1, false, 11);
        escrow.importFinalVerdict(initial, _signVerdict(initial));
        vm.prank(client);
        escrow.openAppealIntent(jobId);
        bytes32 paymentHash = keccak256("zero-fee-appeal-review");
        uint256 paymentNonce = 13;
        bytes32 paymentStructHash = keccak256(abi.encode(
            APPEAL_FUNDED_TYPEHASH, jobId, block.chainid, address(escrow), client, paymentHash, paymentNonce
        ));
        bytes32 paymentDomain = keccak256(abi.encode(
            keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
            keccak256("Workify"), keccak256("3"), block.chainid, address(escrow)
        ));
        (uint8 paymentV, bytes32 paymentR, bytes32 paymentS) = vm.sign(
            ATTESTOR_KEY, keccak256(abi.encodePacked("\x19\x01", paymentDomain, paymentStructHash))
        );
        escrow.confirmAppealFunded(jobId, paymentHash, paymentNonce, abi.encodePacked(paymentR, paymentS, paymentV));
        vm.prank(operator);
        escrow.requestVerification(jobId, true);
        WorkEscrowV4.VerdictAttestation memory appeal = _verdict(jobId, WorkEscrowV4.Decision.PASS, 10_000, 1, true, 12);
        vm.expectEmit(true, false, false, true);
        emit WorkEscrowV4.AppealResolved(jobId, WorkEscrowV4.Decision.PASS, 10_000, appeal.resultHash);
        escrow.importFinalVerdict(appeal, _signVerdict(appeal));
    }

    function _createJob(uint128 reward) private returns (bytes32 jobId) {
        jobId = keccak256(abi.encode(block.timestamp, reward));
        vm.prank(client);
        escrow.createFundedJob(jobId, worker, reward, uint64(block.timestamp + 7 days), specificationHash, policyHash);
    }

    function _lockedJob() private returns (bytes32 jobId) {
        jobId = _createJob(1e6);
        vm.prank(worker);
        escrow.submitOrReplaceDelivery(jobId, evidenceHash);
        vm.prank(worker);
        escrow.lockDelivery(jobId);
    }

    function _verdict(bytes32 jobId, WorkEscrowV4.Decision decision, uint16 payoutBps, uint8 attempt, bool appeal, uint256 nonce)
        private view returns (WorkEscrowV4.VerdictAttestation memory)
    {
        return WorkEscrowV4.VerdictAttestation({
            jobId: jobId, verifierId: verifierId, genlayerTxHash: keccak256(abi.encode("genlayer", nonce)), attempt: attempt,
            specificationHash: specificationHash, evidenceHash: evidenceHash, policyHash: policyHash, decision: decision,
            payoutBps: payoutBps, resultHash: keccak256(abi.encode("result", nonce)), nonce: nonce, appeal: appeal
        });
    }

    function _signVerdict(WorkEscrowV4.VerdictAttestation memory verdict) private view returns (bytes memory) {
        bytes32 structHash = keccak256(abi.encode(
            escrow.VERDICT_TYPEHASH(), verdict.jobId, block.chainid, address(escrow), verdict.verifierId, verdict.genlayerTxHash,
            verdict.attempt, verdict.specificationHash, verdict.evidenceHash, verdict.policyHash, verdict.decision,
            verdict.payoutBps, verdict.resultHash, verdict.nonce, verdict.appeal
        ));
        bytes32 domainSeparator = keccak256(abi.encode(
            keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
            keccak256("Workify"), keccak256("3"), block.chainid, address(escrow)
        ));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(ATTESTOR_KEY, digest);
        return abi.encodePacked(r, s, v);
    }
}
