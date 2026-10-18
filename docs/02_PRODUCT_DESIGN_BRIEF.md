# Product/Brand Design Brief — “Calm Control”

> The uploaded problem statement describes a sales-led service company workflow. It does **not** define a color theme or brand. This is a *proposed*, domain-specific direction: **RelayHQ**, a premium operations command center that makes urgency clear without causing alarm fatigue.

## Product narrative
Every lead is a promise someone must keep. RelayHQ is about **trust, ownership, clarity and forward motion**. Its UI must allow Owners to see at-risk revenue and Users to work through a queue quickly. It should feel like a modern professional tool used all day, not a lifestyle app, trendy fintech landing page, neon cyber-security dashboard or playful gamified CRM.

## Brand attributes
**Dependable, decisive, composed, human, precise.** Tone: “3 leads need attention” instead of “CRITICAL FAILURE!!!”. When an external system fails, state why and what happens next. Treat a high-stakes escalation with stronger visual weight than an ordinary conversion graph.

## Visual expression
- Dark mineral navy left rail anchors navigation; near-white/sage off-white work canvas rests the eyes.
- Small carefully designed brand mark: two offset arrows forming a handoff; no generic globe/AI sparkles.
- Ink heading type, open airy line height, high-quality numeric typesetting, predictable table density.
- Teal for actionable controls and verified states; warm amber for awaiting action; coral for overdue/failed; always pair colored indicators with words/icons.
- Hard information uses strong type and 1px separators; keep shadows very light, curves moderate (12–16px), and no decorative 3D/glassmorphism.
- Charts should reveal a decision; the hero callout is a **“lead protection status”** not a giant illustration.

## Reference research (patterns, not copied compositions)
1. Attio's docs distinguish filtered views from saved lists and present compact, flexible CRM tables/boards: https://attio.com/help/reference/attio-101/attios-data-model/define-your-data-model-objects-lists-and-views
2. Front's shared inbox design emphasizes assignment and clear queues: https://help.front.com/en/articles/2157
3. Front's live operations dashboard places action queues and workload beside metrics: https://help.front.com/en/articles/1146752
4. W3C WCAG 2.2 interaction requirements: https://www.w3.org/TR/WCAG22/
5. shadcn/ui semantic CSS theming: https://ui.shadcn.com/docs/theming

**Do not copy branding, assets, proprietary imagery or entire layouts** from references. Use only general information-architecture principles.

## Screen-specific design intent
| Screen | Feeling | Hero element | Avoid |
|---|---|---|---|
| Dashboard | Calm strategic command | Lead-protection status and clear KPIs | 12 unrelated charts |
| Recovery / Leads | Rapid triage | Rows with urgency, clock, owner, reason, action | Tiny warning icons with no labels |
| Pipeline | Organized possibilities | Beautiful compact Kanban with stage summaries | Decorative infinite cards |
| Contact 360 | Complete customer context | Header + information + chronological activity | 8 disconnected tabs |
| Inbox | Focused conversation | Sender, ownership and message status | Consumer-chat bright bubbles |
| Automation | Trustworthy rule control | Readable escalation ladder/timing | Complex node diagram UI |
| Integrations | Transparent reliability | Connection cards + last sync + errors | Green “connected” when failing |
| Appointments | Reliable booking | Availability and timezone | Fake calendar screenshots |

## Design QA gate
Before any implementation: compare desktop mockups at 1440×900 and mobile at 390×844 against `03_DESIGN_SYSTEM.md`. Ask: can a User immediately identify their next action? Can an Owner see risk and proof? Do colors describe states, not decoration? Can a developer implement this with standard React primitives? If any answer is no, revise the screen.
