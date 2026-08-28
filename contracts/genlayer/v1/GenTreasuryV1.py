# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

from genlayer import *


VERIFICATION_FEE = u256(100000000000000000)
APPEAL_FEE = u256(1000000000000000000)


class GenTreasuryV1(gl.Contract):
    owner: Address
    payments: TreeMap[str, str]
    amounts: TreeMap[str, u256]
    total_received: u256

    def __init__(self, owner: str):
        parsed = Address(owner)
        if parsed == Address("0x0000000000000000000000000000000000000000"):
            raise gl.vm.UserError("[EXPECTED] Invalid owner")
        self.owner = parsed
        self.total_received = u256(0)

    @gl.public.write.payable
    def fund_verification(self, job_id: str, attempt: u32) -> str:
        if len(job_id) != 66 or not job_id.startswith("0x"):
            raise gl.vm.UserError("[EXPECTED] Invalid job id")
        if attempt < u32(1) or attempt > u32(3):
            raise gl.vm.UserError("[EXPECTED] Invalid attempt")
        if gl.message.value != VERIFICATION_FEE:
            raise gl.vm.UserError("[EXPECTED] Verification requires exactly 0.1 GEN")
        key = job_id + ":verification:" + str(attempt)
        if self.amounts.get(key, u256(0)) != u256(0):
            raise gl.vm.UserError("[EXPECTED] Attempt already funded")
        self.payments[key] = str(gl.message.sender_address)
        self.amounts[key] = gl.message.value
        self.total_received = self.total_received + gl.message.value
        return key

    @gl.public.write.payable
    def fund_appeal(self, job_id: str) -> str:
        if len(job_id) != 66 or not job_id.startswith("0x"):
            raise gl.vm.UserError("[EXPECTED] Invalid job id")
        if gl.message.value != APPEAL_FEE:
            raise gl.vm.UserError("[EXPECTED] Appeal requires exactly 1 GEN")
        key = job_id + ":appeal"
        if self.amounts.get(key, u256(0)) != u256(0):
            raise gl.vm.UserError("[EXPECTED] Appeal already funded")
        self.payments[key] = str(gl.message.sender_address)
        self.amounts[key] = gl.message.value
        self.total_received = self.total_received + gl.message.value
        return key

    @gl.public.view
    def get_payment(self, key: str) -> dict:
        return {
            "payer": self.payments.get(key, ""),
            "amount": self.amounts.get(key, u256(0)),
        }

    @gl.public.write
    def withdraw(self, recipient: str, amount: u256) -> None:
        if gl.message.sender_address != self.owner:
            raise gl.vm.UserError("[EXPECTED] Only owner")
        if amount == u256(0) or amount > self.balance:
            raise gl.vm.UserError("[EXPECTED] Invalid amount")
        parsed = Address(recipient)
        if parsed == Address("0x0000000000000000000000000000000000000000"):
            raise gl.vm.UserError("[EXPECTED] Invalid recipient")
        gl.get_contract_at(parsed).emit_transfer(value=amount, on="finalized")
