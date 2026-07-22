---
description: "Apply the unambiguous fixes from the analysis report, then re-present the analysis"
---

# Analyze Auto-Fix

Run after `/speckit-analyze`. The analyze command produces a read-only findings
report (it never edits files). This command takes that report and **applies the
fixes that are unambiguous**, then **re-runs the analysis and re-presents the
results** so what remains is only the judgment-dependent work.

See the `speckit-analyze-autofix-run` skill for the full procedure. In short:

1. Take the findings table from the just-completed analysis.
2. For each finding with a **single obvious correct fix**, apply it directly to
   the relevant artifact (`spec.md`, `plan.md`, `tasks.md`) — regardless of
   severity label.
3. **Stop and leave for the user** any finding that is ambiguous, needs a product
   decision, or has multiple reasonable resolutions.
4. Re-run the analysis (or recompute the findings) and present the updated report,
   clearly separating **Fixed automatically** from **Needs your attention**.
