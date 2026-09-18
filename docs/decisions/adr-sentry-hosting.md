# ADR: Sentry Hosting and Data Retention for Crash Reporting

**Status:** Accepted  
**Ticket:** #442  
**Date:** 2026-08-06

---

## Context

Ticket #442 requires crash and error monitoring for the Android app. The acceptance
criteria explicitly calls for a decision on retention and hosting, with GDPR noted as
a concern given that the app handles sensitive budget and financial data.

Three options were evaluated:

| Option | Hosting | Data region | Effort |
|---|---|---|---|
| Firebase Crashlytics | Google-managed | US (no EU option) | Low — but no JS layer |
| Sentry SaaS (sentry.io) | Sentry-managed | EU or US, configurable | Low |
| Self-hosted Sentry | Self-managed | EU (our own infra) | High |

---

## Decision

**Sentry SaaS on the EU region** (`ingest.de.sentry.io`).

The DSN registered for this project routes all event data through Sentry's
EU-based ingestion infrastructure. This is visible in the DSN itself — the
`ingest.de.sentry.io` hostname confirms the EU region.

Self-hosting was evaluated and rejected for this phase. It would require
standing up and maintaining a separate Sentry instance (PostgreSQL, Redis,
object storage, worker processes), which is disproportionate overhead for a
project of this size. The EU SaaS option satisfies GDPR adequacy requirements
without that operational burden.

Firebase Crashlytics was rejected because it only covers native crashes and
provides no JS/WebView layer support, which is the primary error surface for a
Capacitor app.

---

## Consequences

**Data residency:** All crash event data is stored in Sentry's EU region.
Sentry GmbH is subject to GDPR as a German entity. Their DPA (Data Processing
Agreement) is available at https://sentry.io/legal/dpa/.

**Retention:** Sentry's default event retention on the free/team plan is 90 days.
This is acceptable — crash reports older than 90 days have no actionable value
for the current release cycle. If longer retention is required in future,
upgrade the plan or export events via the Sentry API before expiry.

**PII:** The integration is configured with multiple layers to prevent financial
data from appearing in crash reports:
- `sendDefaultPii: false` — SDK never attaches IP addresses, cookies, or
  request bodies automatically.
- `beforeSend` hook in `monitoring.ts` — strips the user identity block and
  scrubs emails, IBANs, and amounts from all event fields including `extra`,
  `contexts`, and breadcrumbs.
- Session replays disabled (`replaysSessionSampleRate: 0`,
  `replaysOnErrorSampleRate: 0`) — screen content is never recorded.

**Future review trigger:** If the project migrates to self-hosted infrastructure
or if EU SaaS adequacy is challenged by a legal/DPO review, revisit this ADR.
The self-hosted Sentry path remains viable with moderate effort.
