# A more relaxed evening of poker

The companions now keep early pots smaller and leave more room for decisions on the flop, turn, and river.

- **Before the flop:** normal opening raises are 2.5–3 big blinds. Once someone has raised, the AI calls or folds instead of starting a re-raising loop.
- **On the flop:** opening bets are usually about 28–35% of the pot, subject to a stack budget. The AI does not re-raise on this street.
- **Early all-ins:** the AI does not proactively shove preflop or on the flop. Calling with the last few chips remains possible; a short stack is still a short stack.
- **Later streets:** strong hands can receive value bets and occasional raises. Each AI seat raises at most once on the street, and avoids further escalation after a bet and raise. Very strong later hands can still commit a stack.
- **Large calls:** expensive early calls require stronger evidence than a small, routine call.

The old sizing approach could repeatedly increase raises with the growing pot, then turn an oversized suggestion into an entire-stack wager. The new policy checks its budget before selecting a raise. If even the minimum raise is too large, it chooses among calling, checking, or folding.

These are choices made by the companions. The human player's legal actions and the poker rules are unchanged. AI decisions still use only the acting companion's cards, the visible board, stacks, and public betting history. The hand journal is unchanged.

## Before-and-after checks

The scripted baseline did not reproduce all-ins on almost every opening round. It did show avoidable early all-ins and fewer hands with live betting on later streets.

All scenarios start with four stacks of 500 and blinds of 5/10. Separate seeded streams produce cards and AI decisions. The neutral human checks or calls. The small-opening human opens to 25 chips when first given an unraised preflop opportunity, then checks or calls. Continuing sessions preserve stacks and stop when the human busts, one player remains, or 40 hands finish.

The same 100 session seeds were used before and after for each continuing scenario. Their hand counts differ because the changed play lets sessions last longer. The fresh-stack scenario uses 1,000 independent, single-hand seeds.

| Scenario | Hands before → after | Hands with an AI preflop all-in | Hands with any early AI all-in | Hands with an early AI shove or all-in raise |
| --- | ---: | ---: | ---: | ---: |
| Fresh stacks; check/call | 1,000 → 1,000 | 0.1% → 0.0% | 2.6% → 0.0% | 2.6% → 0.0% |
| Continuing stacks; check/call | 679 → 2,205 | 0.3% → 0.3% | 2.4% → 0.3% | 1.9% → 0.0% |
| Continuing stacks; small openings | 515 → 1,631 | 0.2% → 0.2% | 3.3% → 0.2% | 2.1% → 0.0% |

“Early” means preflop or flop. All-in counts include calls that use the remaining stack. The remaining early all-ins after the change were calls, not proactive AI shoves.

Simply dealing all five board cards can hide an automatic all-in runout. The following table instead measures hands with **at least one live betting decision** on each street:

| Scenario | Flop before → after | Turn before → after | River before → after |
| --- | ---: | ---: | ---: |
| Fresh stacks; check/call | 99.9% → 100.0% | 97.4% → 100.0% | 91.5% → 100.0% |
| Continuing stacks; check/call | 100.0% → 99.8% | 97.9% → 99.6% | 92.5% → 99.1% |
| Continuing stacks; small openings | 96.9% → 99.1% | 94.2% → 99.0% | 85.0% → 98.2% |

For comparison, full-board dealing occurred in 100% of neutral-caller hands both before and after. With small human openings, it occurred in 97.5% before and 99.4% after. This is why live betting opportunities are the more useful pacing measure.

These are deterministic comparisons under the stated human policies, not promises about every real game. Large human raises and short stacks can still end a hand early.

## Verification

The full suite now has **51 passing checks**, including the nine new AI checks and eight cat animation checks. The nine new behavior checks cover small premium-hand openings, prevention of early re-raising loops, real public-action counting, stack-budget limits, short-stack calls, disciplined expensive calls, later strong value play, and seeded pacing. Existing poker and companion checks still pass, including hidden-information independence and chip conservation.

From the `game` folder:

```text
node --test tests/*.test.cjs
node tests/ai-simulation.cjs
```

The simulation command prints current raw counts for all three scenarios, including board dealing and actual betting opportunities. All-ins are counted at the moment chips are committed, before a possible payout changes the stack.
