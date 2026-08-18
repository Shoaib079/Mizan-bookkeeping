"""An employee cannot both be owed salary and be holding your advance.

The owner, looking at Yasir Khan: *"salaries were cleared out net is zero but
when i am recording salary the app still shows me i owe this staff money"*.
Both figures were real — 2.730 owed, 2.730 advance held — and they netted to
nothing. Nothing was wrong; nothing had settled them either.

They never settle themselves because staff is modelled on **two** GL accounts:
1300 Employee Advances (an asset, he owes you) and 2250 Salaries Payable (a
liability, you owe him). Partners net on sight because they are one account,
2150, that runs both directions. Two accounts do not move value between
themselves — a journal entry has to, and that entry is what the "Apply advance"
button posts. So the button exists to make up for the shape of the model, and
it only fires when somebody remembers to press it.

`post_salary_payment` already nets, but only against the part of the salary
that cash did not cover:

    advance_applied = max(0, min(advance, remaining - cash))

Pay the exact amount owed and `remaining - cash` is zero, so the advance is
untouched. That is defensible on its own terms — you handed over the whole
salary and he does still owe you the advance separately — and it is how you
end up looking at the same number on both sides. It is also not the only
route in: editing an accrual upward after a payment has already parked a
surplus leaves the two standing without any payment being involved, which is
exactly how Yasir's arose.

So this does not live at payment time. It is an invariant, checked after every
staff write: **min(salary owed, advance held) must be zero**. Whatever both
sides have in common is settled immediately, through the same poster the button
uses. No new accounting — the entry is the one an owner would have posted by
hand, posted without being asked.

Two deliberate refusals:

*FX employees are skipped.* `post_apply_advance` is TRY-only because an FX
advance carries a lira cost basis from the day it was paid, and applying it has
to use that rate rather than today's. Settling those through a salary payment
is the existing route and it is correct; forcing this one on them would book
the expense at the wrong rate.

*A locked period is skipped, not raised.* The owner's standing rule is that a
warning is fine but nothing may stop them recording. Failing their accrual
because a *tidy-up* could not be posted into a closed month would do exactly
that. The manual button remains, so the settlement is still one click away
once the period is open.
"""

from __future__ import annotations

import uuid
from datetime import date

from sqlalchemy.orm import Session

from app.core.period_locks.errors import PeriodLockedError, PeriodUnlockRequiredError
from app.core.staff import ledger as staff_ledger
from app.core.staff.posting import InvalidStaffPostingError, post_apply_advance
from app.core.staff.types import PayCurrency
from app.db.session import entity_context, require_entity_context
from app.features.staff.models import Employee

# What the automatic entry says on the ledger. Deliberately not the same words
# as a hand-pressed apply, so an owner reading the row knows nobody typed it.
AUTO_SETTLE_DESCRIPTION = "Advance settled against salary owed"


def settleable_minor(session: Session, employee_id: uuid.UUID) -> int:
    """What salary owed and advance held have in common. Needs entity context."""
    require_entity_context()
    owed = staff_ledger.remaining_accrual_minor(session, employee_id)
    advance = staff_ledger.outstanding_advance_minor(session, employee_id)
    return max(0, min(owed, advance))


def settle_advance_against_owed(
    session: Session,
    entity_id: uuid.UUID,
    employee_id: uuid.UUID,
    *,
    on_date: date,
    actor_id: uuid.UUID,
) -> uuid.UUID | None:
    """Net the overlap away, if there is one. Returns the entry it posted.

    Safe to call after any staff write, including after itself: once it has
    run, the overlap is zero and the next call returns None. That is the
    termination argument — there is no recursion guard because there is
    nothing to guard, and a flag would only hide it if that ever stopped
    being true.
    """
    with entity_context(session, entity_id):
        require_entity_context()
        employee = session.get(Employee, employee_id)
        if employee is None or employee.pay_currency != PayCurrency.TRY:
            return None
        amount = settleable_minor(session, employee_id)
        if amount <= 0:
            return None

    try:
        result = post_apply_advance(
            session,
            entity_id,
            employee_id,
            applied_date=on_date,
            description=AUTO_SETTLE_DESCRIPTION,
            actor_id=actor_id,
            amount_minor=amount,
        )
    except (PeriodLockedError, PeriodUnlockRequiredError):
        # The owner's entry stands; the tidy-up waits for the period to open.
        return None
    except InvalidStaffPostingError:
        # The poster recomputes the cap itself and is the authority on it. If
        # it disagrees with the figure read a moment ago, believe the poster
        # and leave the books alone rather than force a number past it.
        return None
    return result.journal_entry.id
