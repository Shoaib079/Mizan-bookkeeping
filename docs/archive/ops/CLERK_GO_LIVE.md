# Clerk go-live runbook

Moving Mizan from a Clerk **development** instance to a **production** one.

Written while the details were fresh, after the development instance caused a
real incident: users were signed out, and signing back in landed on Clerk's own
"now connect Clerk to your application" page rather than the app.

---

## Why this is not optional

A Clerk development instance is not a smaller production instance. It is a
different thing:

- **Sessions are held in a "dev browser" token** passed via querystring
  (`__clerk_db_jwt`) instead of a proper session cookie, to sidestep
  cross-site cookie problems on `localhost`. Clerk's own documentation says
  this "is not secure enough for production use". It is why sessions dropped.
- **Capped at 100 users and 20 SMS messages.** Hitting either stops sign-up
  and sign-in entirely.
- **Emails and SMS carry a "development" prefix.** A restaurant owner you
  onboard receives a verification email visibly marked as a development
  message.
- **Social sign-in uses Clerk's shared OAuth credentials**, which are not
  yours and are not secure for production.

---

## Prerequisite: a domain

**You need a domain you own, with access to its DNS records.** Clerk production
serves its Frontend API from a subdomain of *your* domain (`clerk.example.com`)
and issues a TLS certificate for it. A `*.vercel.app` address cannot do this.

There is no way around this step. Everything below assumes the domain exists.

---

## 1. Create the production instance

1. Open the [Clerk Dashboard](https://dashboard.clerk.com).
2. At the top there is a button reading **Development**. It looks like a label
   but it is the instance selector. Click it → **Create production instance**.
3. Choose to clone the development settings (simplest) or start from Clerk's
   defaults.
4. The dashboard home page then lists what is still outstanding.

**Three settings do not clone across** and must be set again by hand:

- **SSO connections**
- **Integrations**
- **Paths** — this is the one that stranded users on Clerk's placeholder page.
  Set it here as well as the `fallbackRedirectUrl` already in
  `src/app/sign-in/[[...sign-in]]/page.tsx`.

## 2. DNS

The **Domains** page lists the CNAME records to add at your registrar.

- Propagation can take up to 48 hours, though it is usually far quicker.
- **If your DNS is behind Cloudflare, set these records to "DNS only".**
  Proxying them makes Clerk's validation fail, and the failure looks like the
  records were never added.
- Check for CAA records on the root domain: `dig example.com +short CAA`. An
  empty response is correct. Anything returned can block certificate issuance
  and leave the deployment stuck.

## 3. OAuth credentials

If Mizan offers Google or any other social sign-in, register your own OAuth
credentials with each provider and enter them in the production instance.
Development borrowed Clerk's shared credentials; those stop working.

## 4. Deploy certificates

When the dashboard's outstanding list is clear, a **Deploy certificates**
button appears. Pressing it is the moment the instance becomes live.

## 5. Environment variables

All of these come from the **production** instance. Frontend and backend
pointing at different instances rejects every token, with no useful error.

**Vercel (frontend)**

| Variable | Value |
| --- | --- |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | `pk_live_…` |
| `CLERK_AUTHORIZED_PARTIES` | `https://app.example.com` (comma-separated for several) |

**Railway (backend)**

| Variable | Value |
| --- | --- |
| `CLERK_SECRET_KEY` | `sk_live_…` |
| `CLERK_PUBLISHABLE_KEY` | `pk_live_…` |
| `CLERK_ISSUER` | `https://clerk.example.com` |
| `CLERK_JWKS_URL` | `https://clerk.example.com/.well-known/jwks.json` |
| `CLERK_AUDIENCE` | as configured on the instance |
| `CORS_ORIGINS` | the exact Vercel production origin |
| `APP_ENV` | `production` |

Redeploy both afterwards. Environment changes alone do not restart a running
deployment on either platform.

### `APP_ENV` and the live keys must ship together

`backend/app/launch.py` raises on startup if a `pk_test_`/`sk_test_` key is
present **and** `APP_ENV=production`.

- Set `APP_ENV=production` while still on test keys → **the backend will not
  boot**.
- Leave `APP_ENV` unset after switching to live keys → the guard never runs,
  along with the CORS check and the `CLERK_TEST_MODE` check. This is the state
  the app was in: not one guard failing, all of them skipped.

Change both in the same deploy. `warn_if_deployed_but_not_production()` logs a
warning when a deployment looks live but `APP_ENV` says otherwise — worth
checking the Railway logs after the first boot.

## 6. Afterwards

- **Users do not transfer between instances.** Everyone signs up again,
  including you. Plan for that before telling anyone the app has moved.
- **`pk_live_` will not work on `localhost`** — production keys are
  origin-locked. Keep the development keys in your local `.env`.
- Update any **webhook** endpoints to the production instance's URL and
  signing secret.

---

## Checks after go-live

- [ ] Sign in on the production domain and land on the dashboard, not on a
      Clerk page.
- [ ] Railway logs contain no `APP_ENV` warning at startup.
- [ ] A verification email arrives without a "development" prefix.
- [ ] `curl -I https://<domain>` returns the expected security headers.
- [ ] An API call from the frontend succeeds — proving the backend accepts a
      token minted by the same instance.

## Sources

- [Deploy your Clerk app to production](https://clerk.com/docs/guides/development/deployment/production)
- [Managing environments](https://clerk.com/docs/guides/development/managing-environments)
