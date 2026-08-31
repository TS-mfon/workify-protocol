import hashlib
import json


def test_treasury_requires_exact_verification_fee(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy("contracts/genlayer/v1/GenTreasuryV1.py", "0x" + direct_alice.hex())
    direct_vm.sender = direct_alice
    direct_vm.value = 100000000000000000
    key = contract.fund_verification("0x" + "11" * 32, 1)
    assert key.endswith(":verification:1")
    assert int(contract.get_payment(key)["amount"]) == 100000000000000000


def test_treasury_rejects_wrong_fee(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy("contracts/genlayer/v1/GenTreasuryV1.py", "0x" + direct_alice.hex())
    direct_vm.sender = direct_alice
    direct_vm.value = 1
    with direct_vm.expect_revert("exactly 0.1 GEN"):
        contract.fund_verification("0x" + "11" * 32, 1)


def test_verifier_rejects_non_operator(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy(
        "contracts/genlayer/v1/WorkVerifierV1.py",
        "0x" + direct_alice.hex(), "GITHUB_SOFTWARE", "github-software-v1.0",
    )
    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("Only operator"):
        contract.verify(
            "0x" + "11" * 32,
            "https://example.com/spec.json",
            "a" * 64,
            "https://example.com/evidence.json",
            "b" * 64,
            1,
            False,
            "",
        )


def test_verifier_normalizes_pass(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy(
        "contracts/genlayer/v1/WorkVerifierV1.py",
        "0x" + direct_alice.hex(), "GITHUB_SOFTWARE", "github-software-v1.0",
    )
    spec = {
        "version": "1.0.0",
        "workType": "GITHUB_SOFTWARE",
        "criteria": [{"id": "C-001", "severity": "CRITICAL"}],
    }
    source = b"public source"
    evidence = {
        "version": "1.0.0",
        "artifacts": [{"id": "pr", "type": "GITHUB_PR", "canonicalUrl": "https://example.com/source"}],
    }
    spec_bytes = json.dumps(spec, separators=(",", ":"), sort_keys=True).encode()
    evidence_bytes = json.dumps(evidence, separators=(",", ":"), sort_keys=True).encode()
    direct_vm.mock_web(r".*spec.json", {"status": 200, "body": spec_bytes})
    direct_vm.mock_web(r".*evidence.json", {"status": 200, "body": evidence_bytes})
    direct_vm.mock_web(r".*example.com/source", {"status": 200, "body": source})
    direct_vm.mock_llm(
        r".*Workify decentralized work-delivery adjudicator.*",
        json.dumps(
            {
                "decision": "PASS",
                "payout_bps": 10000,
                "score": 95,
                "confidence": 90,
                "criteria": [
                    {
                        "id": "C-001",
                        "decision": "PASS",
                        "severity": "CRITICAL",
                        "evidence": ["pr"],
                        "reason": "Implemented",
                    }
                ],
                "critical_failures": [],
                "missing_evidence": [],
                "final_reasoning": "All mandatory criteria pass.",
            }
        ),
    )
    direct_vm.sender = direct_alice
    result = json.loads(
        contract.verify(
            "0x" + "11" * 32,
            "https://example.com/spec.json",
            hashlib.sha256(spec_bytes).hexdigest(),
            "https://example.com/evidence.json",
            hashlib.sha256(evidence_bytes).hexdigest(),
            1,
            False,
            "",
        )
    )
    assert result["decision"] == "PASS"
    assert result["payout_bps"] == 10000
    assert len(result["result_hash"]) == 64


def test_v2_verifier_normalizes_pass_without_storage_in_nondet(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy(
        "contracts/genlayer/v2/WorkVerifierV2.py",
        "0x" + direct_alice.hex(), "GITHUB_SOFTWARE", "github-software-v2.0",
    )
    spec = {"criteria": [{"id": "C-001", "severity": "CRITICAL"}]}
    source = b"complete implementation and meaningful tests"
    evidence = {"artifacts": [{"id": "pr", "type": "GITHUB_PR", "canonicalUrl": "https://example.com/source"}]}
    spec_bytes = json.dumps(spec, separators=(",", ":"), sort_keys=True).encode()
    evidence_bytes = json.dumps(evidence, separators=(",", ":"), sort_keys=True).encode()
    direct_vm.mock_web(r".*spec.json", {"status": 200, "body": spec_bytes})
    direct_vm.mock_web(r".*evidence.json", {"status": 200, "body": evidence_bytes})
    direct_vm.mock_web(r".*example.com/source", {"status": 200, "body": source})
    direct_vm.mock_llm(r".*Workify decentralized work-delivery adjudicator.*", json.dumps({
        "decision": "PASS", "payout_bps": 10000, "score": 94, "confidence": 90,
        "criteria": [{"id": "C-001", "decision": "PASS", "severity": "CRITICAL", "evidence": ["pr"], "reason": "Implemented"}],
        "critical_failures": [], "missing_evidence": [], "final_reasoning": "Complete",
    }))
    direct_vm.sender = direct_alice
    result = json.loads(contract.verify(
        "0x" + "22" * 32, "https://example.com/spec.json", hashlib.sha256(spec_bytes).hexdigest(),
        "https://example.com/evidence.json", hashlib.sha256(evidence_bytes).hexdigest(), 1, False, "",
    ))
    assert result["decision"] == "PASS"


def test_v4_derives_pass_and_structured_result(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy(
        "contracts/genlayer/v4/WorkVerifierV4.py",
        "0x" + direct_alice.hex(), "GITHUB_SOFTWARE", "github-software-v4.0",
    )
    spec = {
        "criteria": [
            {"id": "C-001", "severity": "CRITICAL"},
            {"id": "C-002", "severity": "HIGH"},
        ],
    }
    source = b"complete implementation and meaningful tests"
    evidence = {"artifacts": [{"id": "pr", "type": "GITHUB_PR", "canonicalUrl": "https://example.com/source"}]}
    spec_bytes = json.dumps(spec, separators=(",", ":"), sort_keys=True).encode()
    evidence_bytes = json.dumps(evidence, separators=(",", ":"), sort_keys=True).encode()
    direct_vm.mock_web(r".*spec.json", {"status": 200, "body": spec_bytes})
    direct_vm.mock_web(r".*evidence.json", {"status": 200, "body": evidence_bytes})
    direct_vm.mock_web(r".*example.com/source", {"status": 200, "body": source})
    direct_vm.mock_llm(r".*Workify decentralized work-delivery adjudicator.*", json.dumps({
        "confidence": 92,
        "criteria": [
            {"id": "C-001", "decision": "PASS", "evidence": ["pr"], "reason": "Implemented"},
            {"id": "C-002", "decision": "PASS", "evidence": ["pr"], "reason": "Tested"},
        ],
        "missing_evidence": [],
        "final_reasoning": "Complete",
    }))
    direct_vm.sender = direct_alice
    result = json.loads(contract.verify(
        "0x" + "44" * 32,
        "https://example.com/spec.json",
        hashlib.sha256(spec_bytes).hexdigest(),
        "https://example.com/evidence.json",
        hashlib.sha256(evidence_bytes).hexdigest(),
        1,
        False,
        "",
    ))
    assert result["decision"] == "PASS"
    assert result["payout_bps"] == 10000
    assert result["criteria"][0]["critical"] is True


def test_v4_critical_failure_is_zero_payout(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy(
        "contracts/genlayer/v4/WorkVerifierV4.py",
        "0x" + direct_alice.hex(), "GITHUB_SOFTWARE", "github-software-v4.0",
    )
    normalized = contract._normalize(
        {
            "confidence": 85,
            "criteria": [
                {"id": "C-001", "decision": "PARTIAL", "evidence": [], "reason": "Incomplete"},
                {"id": "C-002", "decision": "PASS", "evidence": ["tests"], "reason": "Covered"},
            ],
            "missing_evidence": ["runtime proof"],
            "final_reasoning": "Critical requirement incomplete",
        },
        {"criteria": [{"id": "C-001", "severity": "CRITICAL"}, {"id": "C-002", "severity": "HIGH"}]},
        "github-software-v4.0",
        "a" * 64,
        "b" * 64,
        1,
    )
    assert normalized["decision"] == "FAIL"
    assert normalized["payout_bps"] == 0


def test_v6_accepts_fenced_json_and_confidence_label(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy(
        "contracts/genlayer/v6/WorkVerifierV6.py",
        "0x" + direct_alice.hex(), "GITHUB_SOFTWARE", "github-software-v6.0",
    )
    normalized = contract._normalize(
        """```json
        {"criteria":[{"id":"C-001","decision":"PASS","evidence":["SOURCE-01"],"reason":"Implemented"}],"confidence":"HIGH","missing_evidence":[],"final_reasoning":"Complete"}
        ```""",
        {"criteria": [{"id": "C-001", "severity": "CRITICAL"}]},
        "github-software-v6.0",
        "a" * 64,
        "b" * 64,
        1,
    )
    assert normalized["decision"] == "PASS"
    assert normalized["confidence"] == 90
