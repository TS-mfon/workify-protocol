// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.30;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { Ownable2Step } from "@openzeppelin/contracts/access/Ownable2Step.sol";
import { Pausable } from "@openzeppelin/contracts/utils/Pausable.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { EIP712 } from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import { ECDSA } from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

contract WorkEscrowV2 is Ownable2Step, Pausable, ReentrancyGuard, EIP712 {
    using SafeERC20 for IERC20;

    uint16 public constant BPS_DENOMINATOR = 10_000;
    uint16 public constant PLATFORM_FEE_BPS = 100;
    uint64 public constant MIN_JOB_TERM = 15 minutes;
    uint64 public constant MAX_JOB_TERM = 30 days;
    uint64 public constant APPEAL_WINDOW = 5 minutes;
    uint64 public constant APPEAL_FUNDING_WINDOW = 30 minutes;
    uint64 public constant RETRY_WINDOW = 30 minutes;
    uint8 public constant MAX_ATTEMPTS = 3;
    uint8 public constant UNDETERMINED_FINAL_ATTEMPT = 2;

    bytes32 public constant VERDICT_TYPEHASH = keccak256(
        "Verdict(bytes32 jobId,uint256 chainId,address escrow,bytes32 verifierId,bytes32 genlayerTxHash,uint8 attempt,bytes32 specificationHash,bytes32 evidenceHash,bytes32 policyHash,uint8 decision,uint16 payoutBps,bytes32 resultHash,uint256 nonce,bool appeal)"
    );
    bytes32 public constant OUTCOME_TYPEHASH = keccak256(
        "AttemptOutcome(bytes32 jobId,uint256 chainId,address escrow,bytes32 verifierId,bytes32 genlayerTxHash,uint8 attempt,bytes32 evidenceHash,bytes32 policyHash,uint8 outcome,uint256 nonce,bool appeal)"
    );
    bytes32 public constant APPEAL_FUNDED_TYPEHASH = keccak256(
        "AppealFunded(bytes32 jobId,uint256 chainId,address escrow,address appellant,bytes32 genlayerPaymentTxHash,uint256 nonce)"
    );

    enum Status {
        NONE,
        AWAITING_DELIVERY,
        DELIVERY_LOCKED,
        VERIFYING,
        RETRY_WINDOW,
        APPEAL_WINDOW,
        APPEAL_FUNDING,
        APPEAL_VERIFYING,
        SETTLEABLE,
        SETTLED,
        REFUNDED
    }

    enum Decision {
        NONE,
        PASS,
        FAIL,
        PARTIAL,
        UNVERIFIABLE,
        SPLIT
    }

    enum AttemptOutcome {
        NONE,
        UNDETERMINED,
        EXECUTION_ERROR
    }

    struct Job {
        address client;
        address worker;
        uint128 reward;
        uint64 createdAt;
        uint64 deliveryDeadline;
        uint64 retryDeadline;
        uint64 verdictAt;
        uint64 appealDeadline;
        uint64 appealFundingDeadline;
        uint32 deliveryVersion;
        uint8 attempts;
        uint8 appealAttempts;
        uint16 payoutBps;
        Status status;
        Decision decision;
        bytes32 specificationHash;
        bytes32 evidenceHash;
        bytes32 policyHash;
        bytes32 resultHash;
        bytes32 verifierId;
        bytes32 genlayerTxHash;
        bytes32 appealPaymentTxHash;
        address appellant;
        uint8 verdictAttempt;
        bool verdictAppeal;
        bool appealFunded;
    }

    struct VerdictAttestation {
        bytes32 jobId;
        bytes32 verifierId;
        bytes32 genlayerTxHash;
        uint8 attempt;
        bytes32 specificationHash;
        bytes32 evidenceHash;
        bytes32 policyHash;
        Decision decision;
        uint16 payoutBps;
        bytes32 resultHash;
        uint256 nonce;
        bool appeal;
    }

    struct OutcomeAttestation {
        bytes32 jobId;
        bytes32 verifierId;
        bytes32 genlayerTxHash;
        uint8 attempt;
        bytes32 evidenceHash;
        bytes32 policyHash;
        AttemptOutcome outcome;
        uint256 nonce;
        bool appeal;
    }

    error Unauthorized();
    error InvalidAddress();
    error InvalidAmount();
    error InvalidDeadline();
    error InvalidState(Status expected, Status actual);
    error InvalidDecision();
    error InvalidPayout();
    error InvalidAttempt();
    error InvalidEvidence();
    error InvalidSignature();
    error Replay();
    error DeadlineNotReached();
    error DeadlinePassed();
    error JobExists();
    error JobMissing();
    error AppealAlreadyUsed();

    event JobCreated(
        bytes32 indexed jobId,
        address indexed client,
        address indexed worker,
        uint256 reward,
        uint64 deliveryDeadline,
        bytes32 specificationHash,
        bytes32 policyHash
    );
    event DeliverySubmitted(bytes32 indexed jobId, uint32 version, bytes32 evidenceHash);
    event DeliveryLocked(bytes32 indexed jobId, bytes32 evidenceHash);
    event VerificationRequested(bytes32 indexed jobId, uint8 attempt, bool appeal);
    event AttemptUndetermined(
        bytes32 indexed jobId,
        bytes32 indexed verifierId,
        bytes32 indexed genlayerTxHash,
        uint8 attempt,
        bool appeal,
        uint64 retryDeadline
    );
    event VerdictImported(
        bytes32 indexed jobId,
        bytes32 indexed verifierId,
        bytes32 indexed genlayerTxHash,
        uint8 attempt,
        Decision decision,
        uint16 payoutBps,
        bytes32 resultHash,
        bool appeal
    );
    event AppealOpened(bytes32 indexed jobId, address indexed appellant, uint64 fundingDeadline);
    event AppealFunded(bytes32 indexed jobId, address indexed appellant, bytes32 genlayerPaymentTxHash);
    event JobSettled(bytes32 indexed jobId, uint256 workerAmount, uint256 clientAmount, uint256 protocolFee);
    event JobRefunded(bytes32 indexed jobId, uint256 amount, bytes32 reason);
    event VerdictAttestorUpdated(address indexed previousAttestor, address indexed newAttestor);
    event OperatorUpdated(address indexed previousOperator, address indexed newOperator);

    IERC20 public immutable usdc;
    address public immutable treasury;
    address public verdictAttestor;
    address public operator;

    mapping(bytes32 jobId => Job job) private jobs;
    mapping(uint256 nonce => bool used) public usedAttestationNonces;
    mapping(bytes32 jobId => bool used) public appealUsed;

    modifier onlyOperator() {
        if (msg.sender != operator) revert Unauthorized();
        _;
    }

    constructor(
        address usdcAddress,
        address treasuryAddress,
        address initialOwner,
        address initialAttestor,
        address initialOperator
    ) Ownable(initialOwner) EIP712("Workify", "2") {
        if (
            usdcAddress == address(0) || treasuryAddress == address(0) || initialOwner == address(0)
                || initialAttestor == address(0) || initialOperator == address(0)
        ) revert InvalidAddress();
        usdc = IERC20(usdcAddress);
        treasury = treasuryAddress;
        verdictAttestor = initialAttestor;
        operator = initialOperator;
    }

    function createFundedJob(
        bytes32 jobId,
        address worker,
        uint128 reward,
        uint64 deliveryDeadline,
        bytes32 specificationHash,
        bytes32 policyHash
    ) external whenNotPaused nonReentrant {
        if (jobs[jobId].status != Status.NONE) revert JobExists();
        if (worker == address(0) || worker == msg.sender) revert InvalidAddress();
        if (reward == 0) revert InvalidAmount();
        if (specificationHash == bytes32(0) || policyHash == bytes32(0)) revert InvalidEvidence();
        if (
            deliveryDeadline < block.timestamp + MIN_JOB_TERM
                || deliveryDeadline > block.timestamp + MAX_JOB_TERM
        ) revert InvalidDeadline();

        usdc.safeTransferFrom(msg.sender, address(this), reward);
        jobs[jobId] = Job({
            client: msg.sender,
            worker: worker,
            reward: reward,
            createdAt: uint64(block.timestamp),
            deliveryDeadline: deliveryDeadline,
            retryDeadline: 0,
            verdictAt: 0,
            appealDeadline: 0,
            appealFundingDeadline: 0,
            deliveryVersion: 0,
            attempts: 0,
            appealAttempts: 0,
            payoutBps: 0,
            status: Status.AWAITING_DELIVERY,
            decision: Decision.NONE,
            specificationHash: specificationHash,
            evidenceHash: bytes32(0),
            policyHash: policyHash,
            resultHash: bytes32(0),
            verifierId: bytes32(0),
            genlayerTxHash: bytes32(0),
            appealPaymentTxHash: bytes32(0),
            appellant: address(0),
            verdictAttempt: 0,
            verdictAppeal: false,
            appealFunded: false
        });
        emit JobCreated(jobId, msg.sender, worker, reward, deliveryDeadline, specificationHash, policyHash);
    }

    function submitOrReplaceDelivery(bytes32 jobId, bytes32 evidenceHash) external {
        Job storage job = _job(jobId);
        if (msg.sender != job.worker) revert Unauthorized();
        if (job.status != Status.AWAITING_DELIVERY) {
            revert InvalidState(Status.AWAITING_DELIVERY, job.status);
        }
        if (block.timestamp > job.deliveryDeadline) revert DeadlinePassed();
        if (evidenceHash == bytes32(0)) revert InvalidEvidence();
        job.evidenceHash = evidenceHash;
        unchecked {
            job.deliveryVersion += 1;
        }
        emit DeliverySubmitted(jobId, job.deliveryVersion, evidenceHash);
    }

    function lockDelivery(bytes32 jobId) external {
        Job storage job = _job(jobId);
        if (msg.sender != job.worker) revert Unauthorized();
        if (job.status != Status.AWAITING_DELIVERY) {
            revert InvalidState(Status.AWAITING_DELIVERY, job.status);
        }
        if (block.timestamp > job.deliveryDeadline) revert DeadlinePassed();
        if (job.evidenceHash == bytes32(0)) revert InvalidEvidence();
        job.status = Status.DELIVERY_LOCKED;
        emit DeliveryLocked(jobId, job.evidenceHash);
    }

    function requestVerification(bytes32 jobId, bool appeal) external onlyOperator {
        Job storage job = _job(jobId);
        if (appeal) {
            if (job.status != Status.APPEAL_FUNDING || !job.appealFunded) {
                revert InvalidState(Status.APPEAL_FUNDING, job.status);
            }
            if (job.appealAttempts >= MAX_ATTEMPTS) revert InvalidAttempt();
            unchecked {
                job.appealAttempts += 1;
            }
            job.status = Status.APPEAL_VERIFYING;
            emit VerificationRequested(jobId, job.appealAttempts, true);
            return;
        }

        bool initial = job.status == Status.DELIVERY_LOCKED;
        bool retry = job.status == Status.RETRY_WINDOW && block.timestamp <= job.retryDeadline;
        if (!initial && !retry) revert InvalidState(Status.DELIVERY_LOCKED, job.status);
        if (job.attempts >= MAX_ATTEMPTS) revert InvalidAttempt();
        unchecked {
            job.attempts += 1;
        }
        job.status = Status.VERIFYING;
        emit VerificationRequested(jobId, job.attempts, false);
    }

    function importFinalVerdict(VerdictAttestation calldata verdict, bytes calldata signature) external {
        Job storage job = _job(verdict.jobId);
        _consumeNonce(verdict.nonce);
        _verifyVerdict(job, verdict, signature);
        _recordProvenance(job, verdict.verifierId, verdict.genlayerTxHash, verdict.attempt, verdict.appeal);

        if (verdict.appeal) {
            if (job.status != Status.APPEAL_VERIFYING || verdict.attempt != job.appealAttempts) {
                revert InvalidState(Status.APPEAL_VERIFYING, job.status);
            }
            _applyFinalDecision(
                verdict.jobId, job, verdict.decision, verdict.payoutBps, verdict.resultHash, true
            );
            return;
        }

        if (job.status != Status.VERIFYING || verdict.attempt != job.attempts) {
            revert InvalidState(Status.VERIFYING, job.status);
        }
        _applyFinalDecision(
            verdict.jobId, job, verdict.decision, verdict.payoutBps, verdict.resultHash, false
        );
    }

    function recordAttemptOutcome(OutcomeAttestation calldata outcome, bytes calldata signature) external {
        Job storage job = _job(outcome.jobId);
        if (outcome.outcome != AttemptOutcome.UNDETERMINED) revert InvalidDecision();
        _consumeNonce(outcome.nonce);
        _verifyOutcome(job, outcome, signature);
        _recordProvenance(job, outcome.verifierId, outcome.genlayerTxHash, outcome.attempt, outcome.appeal);

        if (outcome.appeal) {
            if (job.status != Status.APPEAL_VERIFYING || outcome.attempt != job.appealAttempts) {
                revert InvalidState(Status.APPEAL_VERIFYING, job.status);
            }
            if (job.appealAttempts >= UNDETERMINED_FINAL_ATTEMPT) {
                _applyFinalDecision(outcome.jobId, job, Decision.SPLIT, 5_000, outcome.genlayerTxHash, true);
            } else {
                job.status = Status.APPEAL_FUNDING;
                job.retryDeadline = uint64(block.timestamp + RETRY_WINDOW);
                emit AttemptUndetermined(
                    outcome.jobId,
                    outcome.verifierId,
                    outcome.genlayerTxHash,
                    outcome.attempt,
                    true,
                    job.retryDeadline
                );
            }
            return;
        }

        if (job.status != Status.VERIFYING || outcome.attempt != job.attempts) {
            revert InvalidState(Status.VERIFYING, job.status);
        }
        if (job.attempts >= UNDETERMINED_FINAL_ATTEMPT) {
            _applyFinalDecision(outcome.jobId, job, Decision.SPLIT, 5_000, outcome.genlayerTxHash, false);
        } else {
            job.status = Status.RETRY_WINDOW;
            job.retryDeadline = uint64(block.timestamp + RETRY_WINDOW);
            emit AttemptUndetermined(
                outcome.jobId,
                outcome.verifierId,
                outcome.genlayerTxHash,
                outcome.attempt,
                false,
                job.retryDeadline
            );
        }
    }

    function openAppealIntent(bytes32 jobId) external {
        Job storage job = _job(jobId);
        if (job.status != Status.APPEAL_WINDOW) revert InvalidState(Status.APPEAL_WINDOW, job.status);
        if (block.timestamp > job.appealDeadline) revert DeadlinePassed();
        if (msg.sender != job.client && msg.sender != job.worker) revert Unauthorized();
        if (appealUsed[jobId]) revert AppealAlreadyUsed();
        appealUsed[jobId] = true;
        job.appellant = msg.sender;
        job.appealFundingDeadline = uint64(block.timestamp + APPEAL_FUNDING_WINDOW);
        job.status = Status.APPEAL_FUNDING;
        emit AppealOpened(jobId, msg.sender, job.appealFundingDeadline);
    }

    function confirmAppealFunded(
        bytes32 jobId,
        bytes32 genlayerPaymentTxHash,
        uint256 nonce,
        bytes calldata signature
    ) external {
        Job storage job = _job(jobId);
        if (job.status != Status.APPEAL_FUNDING) revert InvalidState(Status.APPEAL_FUNDING, job.status);
        if (block.timestamp > job.appealFundingDeadline) revert DeadlinePassed();
        if (genlayerPaymentTxHash == bytes32(0)) revert InvalidEvidence();
        _consumeNonce(nonce);
        bytes32 digest = _hashTypedDataV4(
            keccak256(
                abi.encode(
                    APPEAL_FUNDED_TYPEHASH,
                    jobId,
                    block.chainid,
                    address(this),
                    job.appellant,
                    genlayerPaymentTxHash,
                    nonce
                )
            )
        );
        if (ECDSA.recover(digest, signature) != verdictAttestor) revert InvalidSignature();
        job.appealFunded = true;
        job.appealPaymentTxHash = genlayerPaymentTxHash;
        emit AppealFunded(jobId, job.appellant, genlayerPaymentTxHash);
    }

    function expireUnfundedAppeal(bytes32 jobId) external {
        Job storage job = _job(jobId);
        if (job.status != Status.APPEAL_FUNDING || job.appealFunded) {
            revert InvalidState(Status.APPEAL_FUNDING, job.status);
        }
        if (block.timestamp <= job.appealFundingDeadline) revert DeadlineNotReached();
        job.status = Status.SETTLEABLE;
    }

    function expireRetryWindow(bytes32 jobId) external nonReentrant {
        Job storage job = _job(jobId);
        if (job.status != Status.RETRY_WINDOW) revert InvalidState(Status.RETRY_WINDOW, job.status);
        if (block.timestamp <= job.retryDeadline) revert DeadlineNotReached();
        _refund(jobId, job, keccak256("RETRY_NOT_FUNDED"));
    }

    function refundExpiredJob(bytes32 jobId) external nonReentrant {
        Job storage job = _job(jobId);
        if (job.status != Status.AWAITING_DELIVERY) {
            revert InvalidState(Status.AWAITING_DELIVERY, job.status);
        }
        if (block.timestamp <= job.deliveryDeadline) revert DeadlineNotReached();
        _refund(jobId, job, keccak256("DELIVERY_EXPIRED"));
    }

    function settle(bytes32 jobId) external nonReentrant {
        Job storage job = _job(jobId);
        if (job.status == Status.APPEAL_WINDOW) {
            if (block.timestamp <= job.appealDeadline) revert DeadlineNotReached();
            job.status = Status.SETTLEABLE;
        }
        if (job.status != Status.SETTLEABLE) revert InvalidState(Status.SETTLEABLE, job.status);

        uint256 grossWorker = uint256(job.reward) * job.payoutBps / BPS_DENOMINATOR;
        uint256 protocolFee = grossWorker * PLATFORM_FEE_BPS / BPS_DENOMINATOR;
        uint256 workerAmount = grossWorker - protocolFee;
        uint256 clientAmount = uint256(job.reward) - grossWorker;

        job.status = job.payoutBps == 0 ? Status.REFUNDED : Status.SETTLED;
        if (workerAmount > 0) usdc.safeTransfer(job.worker, workerAmount);
        if (clientAmount > 0) usdc.safeTransfer(job.client, clientAmount);
        if (protocolFee > 0) usdc.safeTransfer(treasury, protocolFee);
        emit JobSettled(jobId, workerAmount, clientAmount, protocolFee);
    }

    function getJob(bytes32 jobId) external view returns (Job memory) {
        return _job(jobId);
    }

    function setVerdictAttestor(address newAttestor) external onlyOwner {
        if (newAttestor == address(0)) revert InvalidAddress();
        emit VerdictAttestorUpdated(verdictAttestor, newAttestor);
        verdictAttestor = newAttestor;
    }

    function setOperator(address newOperator) external onlyOwner {
        if (newOperator == address(0)) revert InvalidAddress();
        emit OperatorUpdated(operator, newOperator);
        operator = newOperator;
    }

    function pauseNewJobs() external onlyOwner {
        _pause();
    }

    function unpauseNewJobs() external onlyOwner {
        _unpause();
    }

    function _applyFinalDecision(
        bytes32 jobId,
        Job storage job,
        Decision decision,
        uint16 payoutBps,
        bytes32 resultHash,
        bool appeal
    ) internal {
        _validateDecision(decision, payoutBps);
        if (resultHash == bytes32(0)) revert InvalidEvidence();
        job.decision = decision;
        job.payoutBps = payoutBps;
        job.resultHash = resultHash;
        job.verdictAt = uint64(block.timestamp);
        if (appeal) {
            job.status = Status.SETTLEABLE;
        } else {
            job.appealDeadline = uint64(block.timestamp + APPEAL_WINDOW);
            job.status = Status.APPEAL_WINDOW;
        }
        emit VerdictImported(
            jobId,
            job.verifierId,
            job.genlayerTxHash,
            job.verdictAttempt,
            decision,
            payoutBps,
            resultHash,
            appeal
        );
    }

    function _recordProvenance(
        Job storage job,
        bytes32 verifierId,
        bytes32 genlayerTxHash,
        uint8 attempt,
        bool appeal
    ) internal {
        job.verifierId = verifierId;
        job.genlayerTxHash = genlayerTxHash;
        job.verdictAttempt = attempt;
        job.verdictAppeal = appeal;
    }

    function _verifyVerdict(Job storage job, VerdictAttestation calldata verdict, bytes calldata signature)
        internal
        view
    {
        if (
            verdict.specificationHash != job.specificationHash || verdict.evidenceHash != job.evidenceHash
                || verdict.policyHash != job.policyHash || verdict.verifierId == bytes32(0)
                || verdict.genlayerTxHash == bytes32(0)
        ) revert InvalidEvidence();
        bytes32 digest = _hashTypedDataV4(
            keccak256(
                abi.encode(
                    VERDICT_TYPEHASH,
                    verdict.jobId,
                    block.chainid,
                    address(this),
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
            )
        );
        if (ECDSA.recover(digest, signature) != verdictAttestor) revert InvalidSignature();
    }

    function _verifyOutcome(Job storage job, OutcomeAttestation calldata outcome, bytes calldata signature)
        internal
        view
    {
        if (
            outcome.evidenceHash != job.evidenceHash || outcome.policyHash != job.policyHash
                || outcome.verifierId == bytes32(0) || outcome.genlayerTxHash == bytes32(0)
        ) revert InvalidEvidence();
        bytes32 digest = _hashTypedDataV4(
            keccak256(
                abi.encode(
                    OUTCOME_TYPEHASH,
                    outcome.jobId,
                    block.chainid,
                    address(this),
                    outcome.verifierId,
                    outcome.genlayerTxHash,
                    outcome.attempt,
                    outcome.evidenceHash,
                    outcome.policyHash,
                    outcome.outcome,
                    outcome.nonce,
                    outcome.appeal
                )
            )
        );
        if (ECDSA.recover(digest, signature) != verdictAttestor) revert InvalidSignature();
    }

    function _validateDecision(Decision decision, uint16 payoutBps) internal pure {
        if (decision == Decision.PASS && payoutBps != BPS_DENOMINATOR) revert InvalidPayout();
        if ((decision == Decision.FAIL || decision == Decision.UNVERIFIABLE) && payoutBps != 0) {
            revert InvalidPayout();
        }
        if (decision == Decision.PARTIAL && (payoutBps == 0 || payoutBps >= BPS_DENOMINATOR)) {
            revert InvalidPayout();
        }
        if (decision == Decision.SPLIT && payoutBps != 5_000) revert InvalidPayout();
        if (decision == Decision.NONE) revert InvalidDecision();
    }

    function _consumeNonce(uint256 nonce) internal {
        if (usedAttestationNonces[nonce]) revert Replay();
        usedAttestationNonces[nonce] = true;
    }

    function _refund(bytes32 jobId, Job storage job, bytes32 reason) internal {
        uint256 amount = job.reward;
        job.status = Status.REFUNDED;
        usdc.safeTransfer(job.client, amount);
        emit JobRefunded(jobId, amount, reason);
    }

    function _job(bytes32 jobId) internal view returns (Job storage job) {
        job = jobs[jobId];
        if (job.status == Status.NONE) revert JobMissing();
    }
}
