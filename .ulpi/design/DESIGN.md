# Workify Design Language

## Design Read
Workify should feel like a precise settlement instrument: quiet, evidence-led, and unmistakably operational.

## Direction
**Technical / utilitarian with cinematic restraint.** The interface borrows the discipline of a transaction terminal and the pacing of an editorial cover. It rejects generic Web3 glass, purple gradients, ornamental glows, floating tokens, fake dashboards, and card grids without hierarchy.

## Register and System
- Register: product and protocol.
- Base system: custom CSS tokens on semantic HTML and Lucide icons.
- Signature: the **Settlement Line**, a thin emerald route that advances through Specification, Escrow, Evidence, Consensus, and Settlement. It appears only where lifecycle context is useful.

## Color (Locked)
| role | OKLCH | hex | use |
|---|---|---|---|
| background | 0.125 0.010 150 | #090c0a | page canvas |
| surface | 0.165 0.014 150 | #101512 | navigation and raised records |
| elevated | 0.205 0.016 150 | #171d19 | hover and focused records |
| text | 0.955 0.008 145 | #f2f6f3 | primary text, 18.1:1 on background |
| muted | 0.685 0.018 150 | #98a69c | supporting text, 7.2:1 on background |
| subtle | 0.455 0.018 150 | #657168 | metadata |
| accent | 0.785 0.185 145 | #45df79 | actions and verified state, 10.8:1 with dark text |
| success | 0.785 0.185 145 | #45df79 | pass and settlement |
| warning | 0.795 0.145 85 | #e3c65b | partial and deadlines |
| danger | 0.705 0.190 25 | #ff7770 | failures |
| info | 0.735 0.085 220 | #7fc1c5 | neutral protocol data |

## Type (Locked)
| role | family | use | notes |
|---|---|---|---|
| display | Geist Sans | headlines | 600-700, tight tracking, sentence case |
| body | Geist Sans | reading and controls | 400-550, maximum 72ch |
| utility | Geist Mono | hashes, amounts, statuses | tabular numerals |

## Scales (Locked)
- Spacing: 4, 8, 12, 16, 24, 32, 48, 64, 96.
- Radius: 8, 12, 16, 20, full. No asymmetric novelty corners.
- Motion: 120ms interaction, 280ms layout, 520ms orchestrated reveal. Easing `cubic-bezier(.16,1,.3,1)`. No bounce.
- Focus: 2px accent outline with 3px background offset.

## Layout Rules
- Landing uses an asymmetric editorial hero, a horizontal settlement line, ruled evidence sections, and a single settlement panel.
- Application uses a 232px navigation rail, compact top bar, table-first records, and summary cards only for true summaries.
- Explorer uses a ledger list, never a decorative card gallery.
- One primary action per view. Wallet connection is always visible.

## Voice
- Register: plain, confident, technical.
- Use: fund, lock, submit, verify, appeal, settle, finalized.
- Never use generic hype, fake statistics, or unsupported claims.
