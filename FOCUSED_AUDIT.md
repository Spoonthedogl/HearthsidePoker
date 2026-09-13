# Focused audit — 12 September 2026

Scope: existing automated rules/evaluator/AI/save/presentation/audio checks, targeted source review, and one native UI regression check. No new artwork or external services.

Fixed:
- Side-pot announcements no longer assign the first winner's hand category to every winner. Different winners direct players to the per-pot recap; ties explicitly say Split pot.
- Payout announcements say collect/collects, avoiding a plus sign that could be mistaken for net profit. Uncalled returns remain excluded.
- A call using the player's entire stack explicitly says All-in call.
- Escape opens Settings from the raise controls, closing the raise controls first.

Validation: all 101 automated checks passed; the changed presentation helper was rechecked after wording polish. Packaged Unreal UI verified creating a heads-up table, opening raise controls, and Escape opening Settings. This was a focused audit, not exhaustive soak testing or a guarantee that no bugs remain.
