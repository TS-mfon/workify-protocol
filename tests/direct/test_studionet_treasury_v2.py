def test_studionet_treasury_records_zero_fee_verification(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy("contracts/genlayer/v2/GenTreasuryV2.py", "0x" + direct_alice.hex())
    direct_vm.sender = direct_alice
    direct_vm.value = 0
    key = contract.fund_verification("0x" + "22" * 32, 1)
    payment = contract.get_payment(key)
    assert payment["funded"] is True
    assert int(payment["amount"]) == 0
    assert payment["payer"].lower() == ("0x" + direct_alice.hex()).lower()


def test_studionet_treasury_rejects_duplicate_zero_fee_record(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy("contracts/genlayer/v2/GenTreasuryV2.py", "0x" + direct_alice.hex())
    direct_vm.sender = direct_alice
    direct_vm.value = 0
    job_id = "0x" + "22" * 32
    contract.fund_verification(job_id, 1)
    with direct_vm.expect_revert("already funded"):
        contract.fund_verification(job_id, 1)


def test_studionet_treasury_rejects_nonzero_fee(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy("contracts/genlayer/v2/GenTreasuryV2.py", "0x" + direct_alice.hex())
    direct_vm.sender = direct_alice
    direct_vm.value = 1
    with direct_vm.expect_revert("zero GEN"):
        contract.fund_verification("0x" + "22" * 32, 1)
