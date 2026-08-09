"""The smoke script's judgement, tested without a network.

The script itself talks to a deployed URL, so it cannot run in CI. What can
be tested is the part that decides — and deciding is where it would go wrong,
because the useful failure is subtle: a `401` where a `400` was expected means
the request reached authentication, which means the idempotency middleware let
it through, which means enforcement is off in that environment.

A smoke test that reported "up" for a deployment with enforcement disabled
would be worse than none: it would certify the exact configuration the rest of
the guards assume cannot happen.
"""

from __future__ import annotations

import sys
import types

import pytest

from scripts.smoke_production import Result


def _run(monkeypatch, responses: dict[tuple[str, str], tuple[int, str]]) -> int:
    """Run the script against canned responses instead of a deployment."""
    import scripts.smoke_production as smoke

    def fake_request(url: str, *, method: str = "GET") -> tuple[int, str]:
        for (frag, wanted_method), reply in responses.items():
            if frag in url and wanted_method == method:
                return reply
        raise AssertionError(f"unexpected request: {method} {url}")

    monkeypatch.setattr(smoke, "_request", fake_request)
    return smoke.main(["smoke", "https://example.test"])


# The real replies, copied from a live run rather than invented. `service` is
# load-bearing: the script requires the body to name `mizan-api`, because a
# proxy or a parked domain answers 200 and means nothing. A fixture that only
# said `{"status":"ok"}` would test a laxer script than the one that ships.
HEALTHY = {
    ("/health/ready", "GET"): (
        200,
        '{"status":"ok","service":"mizan-api","db":"up"}',
    ),
    ("/health", "GET"): (200, '{"status":"ok","service":"mizan-api"}'),
    ("/expenses", "POST"): (400, '{"detail":"Idempotency-Key header required"}'),
    ("/dishes/suggest-description", "POST"): (401, '{"detail":"Unauthorized"}'),
}


def test_a_correctly_configured_deployment_passes(monkeypatch, capsys):
    assert _run(monkeypatch, HEALTHY) == 0
    assert "All checks passed" in capsys.readouterr().out


def test_enforcement_switched_off_is_caught(monkeypatch, capsys):
    """The whole reason the script exists.

    401 means the request reached authentication, so the middleware never
    refused it, so `IDEMPOTENCY_ENFORCEMENT` is not on. Everything else about
    the deployment looks perfect — which is why a human would not notice.
    """
    off = {**HEALTHY, ("/expenses", "POST"): (401, '{"detail":"Unauthorized"}')}
    assert _run(monkeypatch, off) == 1
    assert "mutations require an Idempotency-Key" in capsys.readouterr().out


def test_an_exempt_path_that_stopped_being_exempt_is_caught(monkeypatch):
    """The other direction: drafting would break in production only."""
    broken = {
        **HEALTHY,
        ("/dishes/suggest-description", "POST"): (
            400,
            '{"detail":"Idempotency-Key header required"}',
        ),
    }
    assert _run(monkeypatch, broken) == 1


def test_a_dead_api_is_caught(monkeypatch):
    dead = {**HEALTHY, ("/health", "GET"): (0, "connection refused")}
    assert _run(monkeypatch, dead) == 1


def test_a_url_serving_something_else_passes_nothing(monkeypatch, capsys):
    """Pointed at the Vercel proxy, Next served its own 404 page.

    The script reported three failures and — again — `PASS  exempt endpoints
    are still exempt`, because a 404 is "not 400" and that was all the check
    ever asked. Third instance of the same mistake in one script: a check
    written as *not the wrong answer* rather than *the right answer*.
    """
    html = '<!DOCTYPE html><html lang="en"><head><meta charSet="utf-8"/>'
    wrong = dict.fromkeys(HEALTHY, (404, html))

    assert _run(monkeypatch, wrong) == 1
    out = capsys.readouterr().out
    assert "PASS" not in out, "a check passed against a server that is not the API"
    assert "not the Mizan API" in out


def test_a_200_from_something_that_is_not_mizan_passes_nothing(monkeypatch, capsys):
    """A proxy or a parked domain can return 200 and mean nothing.

    Status alone cannot establish what answered; the body has to say.
    """
    impostor = dict.fromkeys(HEALTHY, (200, '{"status":"ok"}'))
    assert _run(monkeypatch, impostor) == 1
    assert "PASS" not in capsys.readouterr().out


def test_an_unreachable_host_passes_nothing(monkeypatch, capsys):
    """The first version reported a pass for a URL that did not resolve.

    Every check was written as "not the bad status", and a connection failure
    is not the bad status either — so `exempt endpoints are still exempt`
    printed PASS against a host that had answered nothing at all. Someone
    reading four lines with a PASS among them concludes part of the
    deployment is fine. None of it was checked.
    """
    unreachable = dict.fromkeys(HEALTHY, (0, "[Errno 8] nodename nor servname provided"))

    assert _run(monkeypatch, unreachable) == 1
    out = capsys.readouterr().out
    assert "PASS" not in out, "a check passed against a host that never answered"
    assert "Nothing was checked" in out


def test_an_unreachable_host_says_the_url_may_be_wrong(monkeypatch, capsys):
    """The likeliest cause, said plainly.

    The first real run was against the placeholder from the instructions. The
    output was three DNS errors and a stray PASS, which describes the symptom
    and not the cause.
    """
    unreachable = dict.fromkeys(HEALTHY, (0, "nodename nor servname provided"))
    _run(monkeypatch, unreachable)
    assert "placeholder" in capsys.readouterr().out


class TestExplainConnectionFailure:
    """Each cause gets its own answer, and must not get another's.

    The second real run hit a TLS trust-store problem against a deployment
    that was up and answering, and was told the URL might be a placeholder,
    or the deployment down, or the host name wrong. Three guesses, none of
    them right, pointing at a deployment with nothing wrong with it. A wrong
    diagnosis costs more than none — it sends you somewhere else entirely.
    """

    BASE = "https://mizan-api-production-e574.up.railway.app"

    def _explain(self, reason: str) -> str:
        from scripts.smoke_production import explain_connection_failure

        return explain_connection_failure(reason, self.BASE)

    def test_a_certificate_problem_is_named_as_local(self):
        message = self._explain(
            "[SSL: CERTIFICATE_VERIFY_FAILED] certificate verify failed: "
            "unable to get local issuer certificate (_ssl.c:1032)"
        )
        assert ".venv/bin/python" in message, "must say how to fix it, not just what broke"
        assert "placeholder" not in message
        assert "down" not in message

    def test_dns_failure_is_named_as_the_url(self):
        message = self._explain("[Errno 8] nodename nor servname provided, or not known")
        assert "does not resolve" in message
        assert "certifi" not in message

    def test_a_refused_connection_is_named_as_the_deployment(self):
        message = self._explain("[Errno 61] Connection refused")
        assert "down" in message
        assert "does not resolve" not in message

    def test_an_unrecognised_reason_is_repeated_rather_than_guessed(self):
        # Better to hand back the raw reason than to name a cause at random,
        # which is the mistake this class exists to stop.
        message = self._explain("something nobody has seen before")
        assert "something nobody has seen before" in message


def test_a_reachable_api_with_a_dead_database_is_caught(monkeypatch):
    """503 from readiness is the shape a migration failure takes."""
    no_db = {
        **HEALTHY,
        ("/health/ready", "GET"): (503, '{"status":"unavailable","db":"down"}'),
    }
    assert _run(monkeypatch, no_db) == 1


def test_the_runner_refuses_to_guess_a_url():
    from scripts.smoke_production import main

    assert main(["smoke"]) == 2


def test_result_counts_only_failures():
    """Small enough to be obviously right, and it decides the exit code."""
    result = Result()
    result.check(True, "fine")
    result.check(False, "broken")
    assert result.failures == ["broken"]
