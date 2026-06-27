---
type: framework
name: Naming Convention
status: active
created: 2026-06-27
updated: 2026-06-27
---

# Naming Convention

## What it is
The code that names every script/creative so its key attributes are readable at a glance and parseable by Nathan's detect flow.

## Format
```
{PRODUCT}-{FORMAT}-{ANGLE}-{AWARENESS}-{AVATAR}-{SEQ}-{MM/YY}
```

## Worked example
`O3-UGC-Mechanism-PA-DPP-001-06/26`
| Segment | Value | Meaning |
|---|---|---|
| O3 | Omega-3 Oil | Product |
| UGC | UGC | Format |
| Mechanism | Mechanism / Root Cause | Angle |
| PA | Problem Aware | Awareness level |
| DPP | Desperate Pet Parent | Avatar |
| 001 | Sequence | Script number in that set |
| 06/26 | June 2026 | Month / year |

## Known codes
**Products:** DP = Dental Powder · O3 = Omega-3 Oil · (Joint Support — code TBC)
**Awareness:** PA = Problem Aware · SA = Solution Aware
**Avatars:** PPP = Premium Pete · DPP = Desperate Pet Parent
_(extend these tables as new products/avatars/awareness codes are added)_

## How to apply it
- In the actual code use `MM/YY` (e.g. `06/26`).
- In the **filename**, replace the slash with a hyphen (e.g. `...-001-06-26.md`) because `/` is not filename-safe.

## Notes
- This convention drives Pass 1 of the Script Builder's `smartDetectScript()`.
