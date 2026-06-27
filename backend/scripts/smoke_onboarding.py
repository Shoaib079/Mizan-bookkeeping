#!/usr/bin/env python3
"""Owner onboarding smoke — HTTP cold-start path against local or staging API.

Usage:
  API_URL=http://127.0.0.1:8000 python scripts/smoke_onboarding.py
  API_URL=https://staging-api.example.com SMOKE_AUTH=enforced python scripts/smoke_onboarding.py
  API_URL=https://staging-api.example.com SMOKE_BEARER_TOKEN='eyJ...' python scripts/smoke_onboarding.py
"""

from __future__ import annotations

import argparse
import os
import sys
import uuid
from datetime import date

import httpx

from app.smoke.onboarding import (
    OnboardingSmokeError,
    auth_header,
    run_onboarding_smoke,
    test_bearer_token,
)


def _provision_test_owner(
    client: httpx.Client,
    *,
    api_url: str,
    email: str,
    display_name: str,
) -> str:
    clerk_id = f"smoke_{uuid.uuid4().hex[:12]}"
    create = client.post(
        f"{api_url.rstrip('/')}/users",
        json={"email": email, "display_name": display_name},
    )
    if create.status_code not in {201, 409}:
        raise OnboardingSmokeError(
            f"provision owner user: HTTP {create.status_code} — {create.text[:500]}"
        )
    return test_bearer_token(clerk_id=clerk_id, email=email)


def main() -> int:
    parser = argparse.ArgumentParser(description="Mizan owner onboarding API smoke")
    parser.add_argument(
        "--api-url",
        default=os.environ.get("API_URL", ""),
        help="API base URL (or set API_URL env)",
    )
    parser.add_argument(
        "--entity-name",
        default=os.environ.get("SMOKE_ENTITY_NAME", "Mizan Smoke Test Cafe"),
    )
    parser.add_argument(
        "--member-email",
        default=os.environ.get("SMOKE_MEMBER_EMAIL", "smoke-staff@example.com"),
    )
    parser.add_argument(
        "--owner-email",
        default=os.environ.get(
            "SMOKE_OWNER_EMAIL",
            f"smoke-owner-{uuid.uuid4().hex[:8]}@example.com",
        ),
    )
    parser.add_argument(
        "--skip-post-ob",
        action="store_true",
        help="Validate opening balances only; do not post",
    )
    args = parser.parse_args()

    api_url = args.api_url.strip()
    if not api_url:
        print("ERROR: set API_URL or pass --api-url", file=sys.stderr)
        return 1

    auth_mode = os.environ.get("SMOKE_AUTH", "auto").lower()
    bearer = os.environ.get("SMOKE_BEARER_TOKEN", "").strip()
    headers: dict[str, str] = {}

    timeout = httpx.Timeout(60.0, connect=15.0)
    with httpx.Client(timeout=timeout) as http:
        if bearer:
            headers = auth_header(bearer)
        elif auth_mode in {"enforced", "staging", "1", "true", "yes"}:
            token = _provision_test_owner(
                http,
                api_url=api_url,
                email=args.owner_email,
                display_name="Smoke Owner",
            )
            headers = auth_header(token)
            print(f"==> Using test bearer for {args.owner_email}")

        print(f"==> POST /entities (onboarding smoke against {api_url})")
        try:
            result = run_onboarding_smoke(
                http,
                base_url=api_url,
                headers=headers,
                entity_name=args.entity_name,
                member_email=args.member_email,
                post_opening_balances=not args.skip_post_ob,
                go_live_date=date.today().replace(day=1),
            )
        except OnboardingSmokeError as exc:
            print(f"FAIL: {exc}", file=sys.stderr)
            return 1
        except httpx.HTTPError as exc:
            print(f"FAIL: network error — {exc}", file=sys.stderr)
            return 1

    print(f"entity_id={result.entity_id}")
    print(f"cash_account_id={result.cash_account_id}")
    print(f"member_email={result.member_email}")
    print(f"net_income_kurus={result.report_net_income_kurus}")
    print("==> Onboarding smoke passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
