"""Print the balance sheet totals the report itself computes, per entity/date.

The ledger is known sound (scripts/diagnose_balance_sheet.sql section 4), so an
imbalance on screen comes from the report layer. This calls get_balance_sheet
exactly as the API does, for both views, and shows which one breaks and by how
much — the difference is usually recognisable as a specific account.

Run from backend/ with the venv active:

    .venv/bin/python scripts/diagnose_balance_sheet.py                # today
    .venv/bin/python scripts/diagnose_balance_sheet.py 2026-06-30     # a date
"""

from __future__ import annotations

import sys
from datetime import date

from sqlalchemy import select

from app.db.session import SessionLocal
from app.features.entities.models import Entity
from app.features.reports import financial_statements as fs


def main() -> None:
    as_of = date.fromisoformat(sys.argv[1]) if len(sys.argv) > 1 else date.today()
    print(f"as_of = {as_of}\n")

    with SessionLocal() as session:
        entities = list(session.scalars(select(Entity).order_by(Entity.name)))
        if not entities:
            print("No entities found.")
            return

        for entity in entities:
            print(f"--- {entity.name}  ({entity.id})")
            for view in (fs.VIEW_AS_CLOSED, fs.VIEW_LIVE):
                try:
                    report = fs.get_balance_sheet(
                        session, entity.id, as_of, view=view
                    )
                except Exception as exc:  # noqa: BLE001 - diagnostic
                    print(f"    {view:<10} raised {type(exc).__name__}: {exc}")
                    continue

                diff = (
                    report.total_assets_kurus
                    - report.total_liabilities_and_equity_kurus
                )
                flag = "OK " if report.accounting_equation_balanced else "OFF"
                print(
                    f"    {view:<10} [{flag}] served={report.source:<10} "
                    f"assets={report.total_assets_kurus:>14,} "
                    f"L+E={report.total_liabilities_and_equity_kurus:>14,} "
                    f"diff={diff:>12,}"
                )
                if report.sealed is not None:
                    print(
                        f"               sealed {report.sealed.period_start}"
                        f"..{report.sealed.period_end}"
                        f" drifted={report.sealed.drifted}"
                        f" drift={report.sealed.drift_kurus}"
                    )
                if not report.accounting_equation_balanced:
                    print(
                        f"               liabilities={report.total_liabilities_kurus:,}"
                        f" equity={report.total_equity_kurus:,}"
                        f" unclosed_net_income="
                        f"{report.equity.unclosed_net_income_kurus:,}"
                    )
            print()


if __name__ == "__main__":
    main()
