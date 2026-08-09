"""Smoke-test a deployed Mizan against the settings every guard assumes.

    python -m scripts.smoke_production https://your-app.example.com
    python -m scripts.smoke_production https://your-app.example.com/backend-api

Reads nothing, writes nothing, and needs no credentials — every check here is
answered before authentication runs, which is the point.

**Why this exists.** A whole class of bug in this app is invisible until
deploy: the local `.env` sets `IDEMPOTENCY_ENFORCEMENT=false`, production sets
it true, and a mutation missing its `Idempotency-Key` works perfectly on a
laptop and returns 400 to a customer. There is now a source scan that stops
new ones (`frontend/src/lib/idempotency-coverage.test.ts`) and a test keeping
both exempt lists in step.

Both of those protect nothing if production is not actually enforcing. Nobody
had ever checked. This checks — and it can, without a login, because the
idempotency middleware is registered outside the auth dependency and answers
before the route is ever reached. A `POST` with no key gets 400 rather than
401, and *that* is the fingerprint of enforcement being on.

Exit code 0 if the deployment looks right, 1 if not, so it can be a deploy
gate later without becoming one now.
"""

from __future__ import annotations

import json
import ssl
import sys
import urllib.error
import urllib.request

TIMEOUT_S = 20


def _ssl_context() -> ssl.SSLContext:
    """Verify certificates, using `certifi` when the platform store is empty.

    A Python installed from python.org on macOS ships no trust store until
    someone runs `Install Certificates.command`, so every HTTPS call fails with
    `unable to get local issuer certificate` — including against a deployment
    that is perfectly healthy. `certifi` is already in this project's venv, so
    running with `.venv/bin/python` works either way.

    Verification is never disabled. A smoke test that skips certificate
    checking would pass against a man-in-the-middle, and "is production
    configured correctly" is exactly the question it is here to answer.
    """
    try:
        import certifi

        return ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        return ssl.create_default_context()


def explain_wrong_endpoint(status: int, body: str, base: str) -> str:
    """`/health` answered, but not as the Mizan API.

    Written after pointing this at the Vercel proxy, which is a **dev-only**
    rewrite: production sets `NEXT_PUBLIC_API_URL` to the Railway host and the
    browser never goes through `/backend-api`. Next served its own 404 page,
    and the script reported three failures and one PASS — because a 404 is
    "not 400", which was all the exempt check ever asked.
    """
    looks_like_a_web_page = "<!DOCTYPE html" in body or "<html" in body
    if looks_like_a_web_page:
        return (
            f"{base} answered with a web page, not the API.\n\n"
            "If this is the /backend-api path on Vercel: that rewrite is for local\n"
            "development only. Production sets NEXT_PUBLIC_API_URL to the Railway\n"
            "host, so the browser talks to the API directly and there is nothing\n"
            "to smoke-test through the proxy. Point this at the Railway URL."
        )
    return (
        f"{base}/health returned {status}, and not the Mizan API's reply.\n"
        f"  {body[:160]}\n\n"
        "Check the base URL — it should be the API host, with no path after it."
    )


def explain_connection_failure(reason: str, base: str) -> str:
    """Name the cause, not the symptom.

    The first version printed one blurb for every connection failure —
    "placeholder, or down, or the host name is wrong" — and printed it for a
    TLS trust-store problem on a deployment that was up and answering. Three
    guesses, all of them wrong, is worse than no guess: it sends you to check
    a deployment that has nothing wrong with it.
    """
    lowered = reason.lower()
    if "certificate" in lowered or "ssl" in lowered:
        return (
            "The host answered but its certificate could not be verified — this is\n"
            "almost always a local trust store, not the deployment. Try:\n"
            "  .venv/bin/python -m scripts.smoke_production " + base + "\n"
            "which has `certifi`. If you are using a python.org build of Python,\n"
            'running its "Install Certificates.command" once fixes it everywhere.'
        )
    if "nodename" in lowered or "name or service not known" in lowered:
        return (
            f"{base} does not resolve. If that is the placeholder from the\n"
            "instructions, pass the real URL — and check it begins with https://."
        )
    if "refused" in lowered:
        return (
            f"{base} resolved but refused the connection — the deployment is\n"
            "down, or the port is not the one being served."
        )
    return f"{base} did not answer: {reason}"


UNREACHABLE = 0


class Result:
    def __init__(self) -> None:
        self.failures: list[str] = []

    def check(self, ok: bool, name: str, detail: str = "") -> None:
        print(f"  {'PASS' if ok else 'FAIL'}  {name}")
        if detail:
            print(f"          {detail}")
        if not ok:
            self.failures.append(name)


def _request(url: str, *, method: str = "GET") -> tuple[int, str]:
    req = urllib.request.Request(url, method=method)
    if method != "GET":
        # A body, so the request is shaped like a real mutation rather than
        # something a server might reject for an unrelated reason.
        req.data = b"{}"
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(
            req, timeout=TIMEOUT_S, context=_ssl_context()
        ) as response:
            return response.status, response.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as exc:
        return exc.code, exc.read().decode("utf-8", "replace")
    except urllib.error.URLError as exc:
        return 0, str(exc.reason)


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print(__doc__)
        return 2
    base = argv[1].rstrip("/")

    print(f"Smoke test — {base}\n")
    result = Result()

    status, body = _request(f"{base}/health")
    if status == UNREACHABLE:
        # Stop here rather than run the rest against a host that is not
        # answering. The first version did not, and printed
        # "PASS  exempt endpoints are still exempt" for a URL that did not
        # resolve — the check was `status != 400`, and a dead connection is
        # not 400. A smoke test that reports a pass when it reached nothing
        # is worse than no smoke test.
        print("  FAIL  the API is up")
        print(f"          GET /health → could not connect: {body}")
        print()
        print("Nothing was checked — no request got through.\n")
        print(explain_connection_failure(body, base))
        return 1

    # Not "status is not an error" — *this is the Mizan API and it said so*.
    # Every check below assumes it is talking to Mizan, so that has to be
    # established rather than inferred from the absence of a bad answer.
    if status != 200 or "mizan-api" not in body:
        print("  FAIL  the API is up")
        print(f"          GET /health → {status}")
        print()
        print("Nothing was checked — this is not the Mizan API.\n")
        print(explain_wrong_endpoint(status, body, base))
        return 1

    result.check(True, "the API is up", f"GET /health → {status}")

    status, body = _request(f"{base}/health/ready")
    db_up = False
    if status == 200:
        try:
            db_up = json.loads(body).get("db") == "up"
        except json.JSONDecodeError:
            db_up = False
    result.check(
        db_up,
        "the database is reachable from the API",
        f"GET /health/ready → {status} {body[:120]}",
    )

    # The check that could not be made any other way. This path needs auth; we
    # send none. If enforcement is on, the middleware answers 400 before auth
    # is consulted. A 401 means the request got past the middleware — which
    # means IDEMPOTENCY_ENFORCEMENT is not set in this environment, and every
    # guard written against that assumption is protecting nothing.
    status, body = _request(
        f"{base}/entities/00000000-0000-4000-8000-000000000000/expenses",
        method="POST",
    )
    enforcing = status == 400 and "Idempotency-Key" in body
    result.check(
        enforcing,
        "mutations require an Idempotency-Key",
        f"POST without a key → {status} {body[:120]}"
        + ("" if enforcing else "   ← expected 400 'Idempotency-Key header required'"),
    )

    # And the other half: a path that is meant to be exempt must still be
    # exempt in the deployed build. If this also returned 400, the exempt list
    # did not survive deploy and drafting would be broken in production while
    # working locally.
    status, body = _request(
        f"{base}/entities/00000000-0000-4000-8000-000000000000/dishes/suggest-description",
        method="POST",
    )
    result.check(
        # `status != 400` alone passes for a request that never arrived. Every
        # check here has to require that something answered.
        status != UNREACHABLE and not (status == 400 and "Idempotency-Key" in body),
        "exempt endpoints are still exempt",
        f"POST to an exempt path → {status}",
    )

    print()
    if result.failures:
        print(f"{len(result.failures)} check(s) failed: {', '.join(result.failures)}")
        return 1
    print("All checks passed.")
    return 0


if __name__ == "__main__":  # pragma: no cover - entrypoint
    raise SystemExit(main(sys.argv))
