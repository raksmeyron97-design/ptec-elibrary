# Post-Incident Review — <incident name>

_Copy this file to `docs/drills/PIR-<YYYY-MM-DD>.md` within 5 working days of
resolution (RUNBOOKS.md §PIR convention). Blameless by rule: name systems and
gaps, never people. Facts over adjectives; timestamps in both UTC and
Asia/Phnom_Penh._

| Field | Value |
|---|---|
| Incident date | YYYY-MM-DD |
| Severity | Sev 1–4 (per ALERT-CATALOG.md) |
| Duration (detection → resolution) | e.g. 2 h 40 m |
| Author | role, e.g. WL |
| Related runbook | RUNBOOKS.md §I_ |
| Status of this PIR | draft / reviewed / actions-complete |

## 1. Summary

Two or three sentences: what broke, who noticed, what fixed it. Written so a
future maintainer with no context understands the incident from this
paragraph alone.

## 2. Impact

- Users affected (readers / editors / admins) and how (site down, PDFs 404,
  login broken, …)
- Data affected (loss, corruption, exposure — or explicitly none)
- Duration of visible impact vs. total incident time

## 3. Detection

- **Detected at**: timestamp
- **Detected by**: Telegram alert / UptimeRobot / GitHub email / user report /
  luck
- Time from first fault to detection, and whether an ALERT-CATALOG.md entry
  should have fired earlier (if one fired late or not at all, that is an
  action item)

## 4. Timeline

All times UTC (+07:00 local in parentheses). Include the boring entries —
"checked X, nothing" is signal for the next responder.

| Time (UTC) | Event |
|---|---|
| 00:00 | First fault (from logs, after the fact) |
| 00:00 | Alert fired / report received |
| 00:00 | Responder acknowledged |
| 00:00 | Diagnosis: … |
| 00:00 | Mitigation applied: … |
| 00:00 | Resolved (recovery criterion from ALERT-CATALOG.md met) |

## 5. Root cause

The mechanism, not the trigger. "The deploy failed" is a trigger; "the
healthcheck passed because it only probes `/` while the fault was in the
download route" is a mechanism. Ask "why" until the answer is a system
property this project controls.

## 6. What went well

- Which alerts, runbooks, rollbacks, or backups worked as designed

## 7. What didn't

- Missing/late alerts, stale docs, missing access, single-person bottlenecks

## 8. Action items

Every item has one owner and a date. "Improve monitoring" is not an action;
"add alert X to uptime.yml" is. Close the loop: check items off here, and
update the runbook/alert-catalog rows this incident proved wrong.

| # | Action | Owner | Due | Done |
|---|---|---|---|---|
| 1 | | WL | YYYY-MM-DD | ☐ |
| 2 | | | | ☐ |
