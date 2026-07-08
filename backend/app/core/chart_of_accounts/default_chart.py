"""Default restaurant chart of accounts seed (Decisions §1).

Inventory excluded — out of v1 scope (Decisions §28).
"""

from __future__ import annotations

from dataclasses import dataclass

from app.core.chart_of_accounts.types import AccountNormalBalance, AccountType

OPENING_BALANCE_EQUITY_CODE = "3900"
INPUT_VAT_CODE = "1500"
ACCOUNTS_RECEIVABLE_CODE = "1200"
ACCOUNTS_PAYABLE_CODE = "2000"
LOANS_PAYABLE_CODE = "2200"
SALARIES_PAYABLE_CODE = "2250"
PARTNER_REIMBURSEMENT_PAYABLE_CODE = "2150"
RETAINED_EARNINGS_CODE = "3100"
OWNER_DRAWINGS_CODE = "3200"
PARTNER_CAPITAL_CODE = "3300"
SALARY_EXPENSE_CODE = "5100"
EMPLOYEE_ADVANCES_CODE = "1300"
CARD_SALES_CLEARING_CODE = "1400"
DELIVERY_CLEARING_PARENT_CODE = "1450"
SALES_REVENUE_CODE = "4000"
GROUP_SALES_REVENUE_CODE = "4300"
BANK_CHARGES_CODE = "5300"
CASH_OVER_SHORT_CODE = "5400"
FX_GAIN_CODE = "4200"
FX_LOSS_CODE = "5600"
GENERAL_EXPENSE_CODE = "5200"
UTILITIES_EXPENSE_CODE = "5210"
SUPPLIES_EXPENSE_CODE = "5220"
REPAIRS_EXPENSE_CODE = "5230"
ADVERTISING_EXPENSE_CODE = "5240"
TRANSPORT_EXPENSE_CODE = "5250"
CLEANING_EXPENSE_CODE = "5260"
OFFICE_EXPENSE_CODE = "5270"
DELIVERY_COMMISSION_EXPENSE_CODE = "5500"
SALES_DISCOUNT_CODE = "5800"


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
        DELIVERY_CLEARING_PARENT_CODE,
        "Delivery Platform Clearing",
        "Yemek Platformu Takas",
        AccountType.ASSET,
        AccountNormalBalance.DEBIT,
        True,
    ),
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
        True,
    ),
    DefaultAccount("2200", "Loans Payable", "Krediler", AccountType.LIABILITY, AccountNormalBalance.CREDIT, True),
    DefaultAccount(
        SALARIES_PAYABLE_CODE,
        "Salaries Payable",
        "Ödenecek Maaşlar",
        AccountType.LIABILITY,
        AccountNormalBalance.CREDIT,
        True,
    ),
    # Equity
    DefaultAccount("3000", "Owner Capital", "Sermaye", AccountType.EQUITY, AccountNormalBalance.CREDIT, False),
    DefaultAccount("3100", "Retained Earnings", "Geçmiş Yıl Karları", AccountType.EQUITY, AccountNormalBalance.CREDIT, False),
    DefaultAccount("3200", "Owner Drawings", "Ortak Çekimleri", AccountType.EQUITY, AccountNormalBalance.DEBIT, False),
    DefaultAccount(
        PARTNER_CAPITAL_CODE,
        "Partner Capital",
        "Ortak Sermaye Hesabı",
        AccountType.EQUITY,
        AccountNormalBalance.CREDIT,
        False,
    ),
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
    DefaultAccount(
        GROUP_SALES_REVENUE_CODE,
        "Group / Agency Sales",
        "Grup / Acente Satışları",
        AccountType.REVENUE,
        AccountNormalBalance.CREDIT,
        False,
    ),
    DefaultAccount("4100", "Other Income", "Diğer Gelirler", AccountType.REVENUE, AccountNormalBalance.CREDIT, False),
    DefaultAccount(FX_GAIN_CODE, "FX Gain", "Kur Kazancı", AccountType.REVENUE, AccountNormalBalance.CREDIT, False),
    # Expenses
    DefaultAccount("5000", "Rent Expense", "Kira Gideri", AccountType.EXPENSE, AccountNormalBalance.DEBIT, False),
    DefaultAccount(
        SALES_DISCOUNT_CODE,
        "Sales Discounts",
        "Satış İskontoları",
        AccountType.EXPENSE,
        AccountNormalBalance.DEBIT,
        False,
    ),
    DefaultAccount(
        SALARY_EXPENSE_CODE,
        "Salaries & Wages",
        "Maaş ve Ücretler",
        AccountType.EXPENSE,
        AccountNormalBalance.DEBIT,
        False,
    ),
    DefaultAccount(
        GENERAL_EXPENSE_CODE,
        "General Expense",
        "Genel Giderler",
        AccountType.EXPENSE,
        AccountNormalBalance.DEBIT,
        False,
    ),
    DefaultAccount(
        UTILITIES_EXPENSE_CODE,
        "Utilities",
        "Elektrik, Su, Doğalgaz",
        AccountType.EXPENSE,
        AccountNormalBalance.DEBIT,
        False,
    ),
    DefaultAccount(
        SUPPLIES_EXPENSE_CODE,
        "Supplies & Ingredients",
        "Malzeme ve Malzemeler",
        AccountType.EXPENSE,
        AccountNormalBalance.DEBIT,
        False,
    ),
    DefaultAccount(
        REPAIRS_EXPENSE_CODE,
        "Repairs & Maintenance",
        "Bakım ve Onarım",
        AccountType.EXPENSE,
        AccountNormalBalance.DEBIT,
        False,
    ),
    DefaultAccount(
        ADVERTISING_EXPENSE_CODE,
        "Advertising",
        "Reklam",
        AccountType.EXPENSE,
        AccountNormalBalance.DEBIT,
        False,
    ),
    DefaultAccount(
        TRANSPORT_EXPENSE_CODE,
        "Transport & Fuel",
        "Ulaşım ve Yakıt",
        AccountType.EXPENSE,
        AccountNormalBalance.DEBIT,
        False,
    ),
    DefaultAccount(
        CLEANING_EXPENSE_CODE,
        "Cleaning",
        "Temizlik",
        AccountType.EXPENSE,
        AccountNormalBalance.DEBIT,
        False,
    ),
    DefaultAccount(
        OFFICE_EXPENSE_CODE,
        "Office Expense",
        "Ofis Giderleri",
        AccountType.EXPENSE,
        AccountNormalBalance.DEBIT,
        False,
    ),
    DefaultAccount("5300", "Bank Charges", "Banka Masrafları", AccountType.EXPENSE, AccountNormalBalance.DEBIT, False),
    DefaultAccount("5400", "Cash Over/Short", "Kasa Fazlası/Eksiği", AccountType.EXPENSE, AccountNormalBalance.DEBIT, False),
    DefaultAccount(
        DELIVERY_COMMISSION_EXPENSE_CODE,
        "Delivery Platform Commission",
        "Yemek Platformu Komisyonu",
        AccountType.EXPENSE,
        AccountNormalBalance.DEBIT,
        False,
    ),
    DefaultAccount(FX_LOSS_CODE, "FX Loss", "Kur Zararı", AccountType.EXPENSE, AccountNormalBalance.DEBIT, False),
)


def chart_by_code() -> dict[str, DefaultAccount]:
    return {account.code: account for account in DEFAULT_CHART}


def opening_balance_accounts() -> tuple[DefaultAccount, ...]:
    return tuple(a for a in DEFAULT_CHART if a.accepts_opening_balance)
