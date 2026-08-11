# Manual Ping QA And Test Deployment Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:verification-before-completion to verify every claim before reporting completion.

**Goal:** Validate manual Ping from table and card, confirm isolated protocols for Leads, Cold Targets, and Clients, back up production, and deploy the verified `main` build to the test server.

**Architecture:** Run automated route and UI tests first, then perform API smoke checks against isolated test records. The deployment is test-only after a production logical database and storage backup; production services are not restarted.

## Test Cases

- `PING-01`: Manual Ping from Lead card with each channel; verify actor, timestamp, protocol entry, and derived Ping.
- `PING-02`: Manual Ping from Leads table; verify row updates without opening the card, then card history matches.
- `PING-03`: Manual Ping from Cold Target card/table; verify the same UI format and a separate history.
- `PING-04`: Manual Ping from Client; verify Client Ping and history use `clientId`.
- `PING-05`: Isolation; create/choose Lead A, Lead B, Cold Target A, and Client A, record distinct channels, and verify no protocol contains another entity's touch.
- `PING-06`: Persistence; reload each table/card and verify the newest Ping and protocol entries remain.

## Gates

1. Run web route tests for manual Ping, Leads, and Cold Targets.
2. Run all 40 UI tests, web typecheck, and production build.
3. Run `git diff --check` and confirm only intended files are staged.
4. Create production backup using the handoff's `pg_dump` and `.local-storage` commands.
5. Deploy `origin/main` to `/opt/apps/lightcrm-test`, rebuild, restart only `lightcrm-test-web.service`, and verify service health plus HTTP auth redirect.
