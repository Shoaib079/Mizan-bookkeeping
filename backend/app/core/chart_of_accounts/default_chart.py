"""Default restaurant chart of accounts seed (Decisions §1).

Inventory excluded — out of v1 scope (Decisions §28).
"""

from __future__ import annotations

from dataclasses import dataclass

from app.core.chart_of_accounts.types import AccountNormalBalance, AccountType

OPENING_BALANCE_EQUITY_CODE = "3900"
INPUT_VAT_CODE = "1500"
ACCOUNTS_PAYABLE_CODE = "2000"
PARTNER_REIMBURSEMENT_PAYABLE_CODE = "2150"
CARD_SALES_CLEARING_CODE = "1400"
SALES_REVENUE_CODE = "4000"
BANK_CHARGES_CODE = "5300"
CASH_OVER_SHORT_CODE = "5400"


@dataclass(frozen=True, slots=True)
class DefaultAccount:
    code: str
    name_en: str
    name_tr: str
    account_type: AccountType
    normal_balance: AccountNormalBalance
    accepts_opening_balance: bool


DEFAULT_CHART: tuple[DefaultAccount, ...] = (
    # Assets
    DefaultAccount("1000", "Cash — TRY", "Kasa — TRY", AccountType.ASSET, AccountNormalBalance.DEBIT, True),
    DefaultAccount("1010", "Cash — USD", "Kasa — USD", AccountType.ASSET, AccountNormalBalance.DEBIT, True),
    DefaultAccount("1020", "Cash — EUR", "Kasa — EUR", AccountType.ASSET, AccountNormalBalance.DEBIT, True),
    DefaultAccount("1030", "Cash — GBP", "Kasa — GBP", AccountType.ASSET, AccountNormalBalance.DEBIT, True),
    DefaultAccount("1100", "Bank — TRY", "Banka — TRY", AccountType.ASSET, AccountNormalBalance.DEBIT, True),
    DefaultAccount("1200", "Accounts Receivable", "Alacaklar", AccountType.ASSET, AccountNormalBalance.DEBIT, True),
    DefaultAccount("1300", "Employee Advances", "Personel Avansları", AccountType.ASSET, AccountNormalBalance.DEBIT, True),
    DefaultAccount("1400", "Card Sales Clearing", "POS Kart Takas", AccountType.ASSET, AccountNormalBalance.DEBIT, True),
    DefaultAccount(
        INPUT_VAT_CODE,
        "Input VAT",
        "Indirilecek KDV",
        AccountType.ASSET,
        AccountNormalBalance.DEBIT,
        False,
    ),
    # Liabilities
    DefaultAccount("2000", "Accounts Payable", "Borçlar (Tedarikçi)", AccountType.LIABILITY, AccountNormalBalance.CREDIT, True),
    DefaultAccount("2100", "Credit Card Payable", "Kredi Kartı Borcu", AccountType.LIABILITY, AccountNormalBalance.CREDIT, True),
    DefaultAccount(
        "2150",
        "Partner Reimbursements Payable",
        "Ortak Masraf Borçları",
        AccountType.LIABILITY,
        AccountNormalBalance.CREDIT,
        False,
    ),
    DefaultAccount("2200", "Loans Payable", "Krediler", AccountType.LIABILITY, AccountNormalBalance.CREDIT, True),
    # Equity
    DefaultAccount("3000", "Owner Capital", "Sermaye", AccountType.EQUITY, AccountNormalBalance.CREDIT, False),
    DefaultAccount("3100", "Retained Earnings", "Geçmiş Yıl Karları", AccountType.EQUITY, AccountNormalBalance.CREDIT, False),
    DefaultAccount("3200", "Owner Drawings", "Ortak Çekimleri", AccountType.EQUITY, AccountNormalBalance.DEBIT, False),
    DefaultAccount(
        OPENING_BALANCE_EQUITY_CODE,
        "Opening Balance Equity",
        "Açılış Bakiyesi Öz Sermaye",
        AccountType.EQUITY,
        AccountNormalBalance.CREDIT,
        False,
    ),
    # Revenue
    DefaultAccount("4000", "Sales Revenue", "Satış Geliri", AccountType.REVENUE, AccountNormalBalance.CREDIT, False),
    DefaultAccount("4100", "Other Income", "Diğer Gelirler", AccountType.REVENUE, AccountNormalBalance.CREDIT, False),
    # Expenses
    DefaultAccount("5000", "Rent Expense", "Kira Gideri", AccountType.EXPENSE, AccountNormalBalance.DEBIT, False),
    DefaultAccount("5100", "Salary Expense", "Maaş Gideri", AccountType.EXPENSE, AccountNormalBalance.DEBIT, False),
    DefaultAccount("5200", "Utility Expense", "Genel Giderler", AccountType.EXPENSE, AccountNormalBalance.DEBIT, False),
    DefaultAccount("5300", "Bank Charges", "Banka Masrafları", AccountType.EXPENSE, AccountNormalBalance.DEBIT, False),
    DefaultAccount("5400", "Cash Over/Short", "Kasa Fazlası/Eksiği", AccountType.EXPENSE, AccountNormalBalance.DEBIT, False),
    DefaultAccount("5500", "FX Gain/Loss", "Kur Farkı", AccountType.EXPENSE, AccountNormalBalance.DEBIT, False),
)


def chart_by_code() -> dict[str, DefaultAccount]:
    return {account.code: account for account in DEFAULT_CHART}


def opening_balance_accounts() -> tuple[DefaultAccount, ...]:
    return tuple(a for a in DEFAULT_CHART if a.accepts_opening_balance)
