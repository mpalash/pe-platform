# Email (SES) — state and remaining work

Magic-link sign-in is load-bearing (hard rule 9): a silent send failure is a user
who cannot log in and cannot tell you. Locally Mailpit catches everything and
none of this matters. Deployed, it is the difference between working auth and none.

**Region `eu-north-1`**, matching the rest of the stack. SMTP endpoint is
`email-smtp.eu-north-1.amazonaws.com:587`.

---

## State as of 2026-09-11

Checked against SES (`--profile pe-hls-operator` can read it; the default
profile cannot) and against Namecheap's authoritative nameserver
(`dns1.registrar-servers.com`), so "not propagated yet" is ruled out.

| | |
|---|---|
| Domain identity `purgatoryedit.com` | exists, **FAILED**, sending disabled |
| DKIM | **FAILED** — tokens unchanged from §1; all three CNAMEs **NXDOMAIN** at Namecheap |
| Custom MAIL FROM `mail.purgatoryedit.com` | **FAILED** (was PENDING on 08-30) — MX and TXT **NXDOMAIN** |
| Production access | **DENIED** — case `172953218300473` in AWS Support Center. Still sandboxed: 200/day, 1/s |
| Verified addresses | `purgatoryeditarchive@gmail.com` only — the one recipient the sandbox will deliver to |
| SMTP credentials | not created |
| App transport | **cannot authenticate to SES** — see §4a |

The records were never added, or were added somewhere other than the zone the
domain actually uses (Namecheap BasicDNS). The doubled-name mistake
(`…_domainkey.purgatoryedit.com.purgatoryedit.com`) was checked and is not there
either. Nothing is wrong with the account; the records do not exist.

What IS in the zone: root MX → Namecheap email forwarding (`eforward1-5`), root
SPF `include:spf.efwd.registrar-servers.com include:_spf.smtp.mailtrap.live`,
and `_dmarc` at `p=none` reporting to Mailtrap. None of it conflicts with SES.

**Only DKIM gates verification.** The identity's status follows DKIM; MAIL FROM
is separate and, with `BehaviorOnMxFailure: USE_DEFAULT_VALUE`, a failed MAIL
FROM only means mail goes out from amazonses.com — it still sends, and DMARC
still passes on the aligned DKIM signature. So the three CNAMEs are the minimum.

## 1. Publish five DNS records (Namecheap)

DNS for `purgatoryedit.com` is at Namecheap, not Route 53 — every record here is
added by hand. Host values are relative to the domain; Namecheap appends it.

**DKIM — three CNAMEs.** Host is `<token>._domainkey`, value `<token>.dkim.amazonses.com`:

```
w4abj3d6hglhn3lqggl4kh6c6p5wjq6q
snil5w4bbk7zc262awmu2h5cnooyn2tq
ss6qqro4ohotn6274xzvelyiw2lv36tv
```

⚠️ These tokens belong to the CURRENT identity. If anyone deletes and recreates
it, SES issues three new ones and these become wrong. Re-read them with:

```bash
aws sesv2 get-email-identity --email-identity purgatoryedit.com \
  --region eu-north-1 --query 'DkimAttributes.Tokens'
```

**MAIL FROM — two records on the `mail` subdomain:**

| Type | Host | Value | Priority |
|---|---|---|---|
| MX | `mail` | `feedback-smtp.eu-north-1.amazonses.com` | 10 |
| TXT | `mail` | `v=spf1 include:amazonses.com ~all` | — |

⚠️ **The MX may collide with the domain's email forwarding.** Namecheap only
accepts MX records when the domain's Mail Settings are "Custom MX", and the root
currently uses "Email Forwarding" (the `eforward` MX records). Switching modes
would stop that forwarding unless it is rebuilt. If Namecheap refuses the MX,
skip MAIL FROM rather than break forwarding — see "Only DKIM gates
verification" above — or remove it from the identity so it stops reporting
FAILED.

Check propagation before expecting SES to notice — ask Namecheap's own server,
which answers the moment a record is saved:

```bash
dig +short @dns1.registrar-servers.com CNAME w4abj3d6hglhn3lqggl4kh6c6p5wjq6q._domainkey.purgatoryedit.com
```

or through any resolver:

```bash
host -t CNAME <token>._domainkey.purgatoryedit.com
host -t MX mail.purgatoryedit.com
```

## 2. Restart the DKIM check

DKIM is in `FAILED`, and SES does not retry a failed identity on its own —
publishing the records is not enough by itself. Toggle it: **SES → Identities →
purgatoryedit.com → DKIM → Edit → save.** That resets it to `PENDING`.

The API call is `ses:PutEmailIdentityDkimAttributes`, which is deliberately NOT in
`scripts/aws/ses-operator-policy.json`. Add it there if this should be scriptable.

## 3. Request production access — again

The first request was **denied** (case `172953218300473`). Read the reason in
AWS Support Center before resubmitting; replying on the case is usually faster
than opening a new one. A request made while the domain is unverified and no
bounce handling exists (see Notes) is weak on both counts, so verify DKIM first.

The sandbox only sends to verified addresses, which means sign-in works for
nobody real. **SES console → Account dashboard → Request production access.**
Approval is usually about a day, so this is the long pole — start it before the
DNS if you want them running in parallel.

Say what the mail actually is: transactional sign-in links to people who entered
their own address, no marketing, low volume. Requests are rejected for vagueness
more than for substance.

## 4. Create SMTP credentials

**SES → SMTP settings → Create SMTP credentials.** The console derives the SMTP
password from an IAM secret; the derivation is not the IAM secret itself, so
create it there rather than making an access key by hand.

These become `NUXT_SMTP_USER` and `NUXT_SMTP_PASS` in Railway. `NUXT_SMTP_FROM`
must be at the verified domain — `no-reply@purgatoryedit.com`.

## 4a. Give the app's mail transport credentials and TLS

**Setting those variables currently does nothing.** `server/utils/auth-mail.ts`
builds its transport with `secure: false, ignoreTLS: true` and no `auth`, and
`nuxt.config.ts` has no `smtpUser`/`smtpPass` keys for `NUXT_SMTP_USER`/`PASS`
to fill. SES on port 587 requires STARTTLS and SMTP authentication, so every
send would be refused. The comment there ("a config change rather than a code
change") is wrong — it needs both keys in runtimeConfig, `auth` when a user is
set, and TLS required unless the host is the local Mailpit.

## 5. Verify end to end

```bash
aws sesv2 get-email-identity --email-identity purgatoryedit.com --region eu-north-1 \
  --query '{Verified:VerifiedForSendingStatus,Dkim:DkimAttributes.Status,MailFrom:MailFromAttributes.MailFromDomainStatus}'
aws sesv2 get-account --region eu-north-1 --query 'ProductionAccessEnabled'
```

Wanted: `Verified: true`, `Dkim: SUCCESS`, `MailFrom: SUCCESS`,
`ProductionAccessEnabled: true`. Then request a sign-in link on the deployed site
and confirm it arrives at an address that was never verified — that is the only
test that proves the sandbox is actually behind you.

## Notes

- `scripts/aws/ses-operator-policy.json` covers identity creation, reading status,
  MAIL FROM, and a single `pe-ses-smtp` IAM user by ARN. It cannot touch the
  archive prefixes, and it omits DKIM mutation on purpose (see §2).
- Bounces and complaints are unhandled. SES will suspend a sender with a poor
  reputation, and magic links to mistyped addresses bounce. An SNS topic on the
  identity writing to a log collection is the obvious next step — hard rule 8
  applies: anything that must not be silently lost gets written down.
