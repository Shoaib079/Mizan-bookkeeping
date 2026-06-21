"""Default chart of accounts API — seed preview for onboarding."""

from fastapi import APIRouter

from app.core.chart_of_accounts.default_chart import DEFAULT_CHART, opening_balance_accounts

router = APIRouter(prefix="/chart-of-accounts", tags=["chart-of-accounts"])


@router.get("/default")
def get_default_chart() -> list[dict]:
    return [
        {
            "code": a.code,
            "name_en": a.name_en,
            "name_tr": a.name_tr,
            "account_type": a.account_type.value,
            "normal_balance": a.normal_balance.value,
            "accepts_opening_balance": a.accepts_opening_balance,
        }
        for a in DEFAULT_CHART
    ]


@router.get("/default/opening-balance-accounts")
def get_opening_balance_accounts() -> list[dict]:
    return [
        {
            "code": a.code,
            "name_en": a.name_en,
            "name_tr": a.name_tr,
            "account_type": a.account_type.value,
            "normal_balance": a.normal_balance.value,
        }
        for a in opening_balance_accounts()
    ]
