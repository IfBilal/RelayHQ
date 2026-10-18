# RelayHQ Design System — Version 1.0

## 1. Locked semantic palette (proposed)
| Token | Hex | Use |
|---|---|---|
| `--ink` | `#142B35` | Sidebar, hero, primary headings |
| `--ink-soft` | `#344C55` | Secondary headings |
| `--teal` | `#127568` | Primary CTA, active, actionable success |
| `--teal-dark` | `#0C5B51` | Hover/accessibly dark teal |
| `--surface` | `#FFFFFF` | Data cards, modals |
| `--canvas` | `#F5F7F4` | App page background |
| `--mist` | `#E6EFEB` | Soft teal/sage section surface |
| `--line` | `#E4E9E6` | Borders/dividers |
| `--muted` | `#63747B` | Secondary text |
| `--amber` | `#B47424` | Warning text and pending clock |
| `--amber-bg` | `#FCF2E1` | Pending/warning surface |
| `--coral` | `#BB5049` | Overdue/error text (verify contrast) |
| `--coral-bg` | `#FCEDEA` | Overdue/error background |
| `--success-bg` | `#E5F4ED` | Healthy signal background |

Colors are **semantic states**, not just palette decoration. Verify actual combinations via automated contrast tests; adjust pairings, not the intended meaning. Do not render pale color-coded text on white.

## 2. Typography
- Headings: **Inter Display** (fallback Inter, system UI), weight 650–750, tracking -0.03em on display headings, never uppercase large headers.
- UI and data: **Inter**, 400/500/600. Body 14px/1.5, table 13.5–14px, secondary 12.5–13px.
- IDs, durations, amounts, timestamps: Inter with `font-variant-numeric: tabular-nums`; optional system monospace only for raw event references.
- Page H1: 30px/36 (mobile 25px/32), widget title 15–16px/22, KPI number 30–36px/1.1; caption 12px/18.
- Limit to 4 intentional font weights; distinguish layout through hierarchy, not random sizes.

## 3. Layout grid
Desktop rail 240–256px, top bar 68–72px, content area padded 30–34px. Target content max-width 1440px; 12-col grid, 16–20px gutters. Metric cards ideally four across ≥1280px, two across 760–1279, one across small devices. Cards 14–16px radius, border 1px. Sticky action bar for lists. Buttons height 40–42px; icon buttons 40px. Dense tables with ~56–64px rows. Main column center-of-attention with a right compact “next actions” rail when useful.

Mobile: rail transforms into accessible top/bottom navigation or Drawer; table turns into labelled cards; data follows **urgency→title→owner→deadline→action**; never hide acknowledge/escalate in a dot menu. Reduce hero height and hide nonessential purely decorative charts. Allow Kanban interior horizontal scrolling with visible affordance.

## 4. Spacing and radius
Spacing scale 4,8,12,16,20,24,32,40,48,64px. Input 10px radius, button 10px, card 16px, hero 18px, badge pill 999px. Shadows at most `0 8px 24px rgba(20,43,53,.05)`; heavy drop shadows signal menus/dialogs only.

## 5. Status components
`Overdue`: coral dot + “Overdue by 2m”; `At risk`: amber icon + “43s remaining”; `Acknowledged`: teal check + full label; `Unavailable`: gray circle + “Offline”; `Synced`: green check + last sync; `Failed`: coral + “Retry available”. **Never communicate risk using color only**. Countdowns show absolute due time in tooltip/text; timer switches to “Overdue” on expiration and reconciles with server state.

## 6. Components library
`AppShell`, `SidebarNav`, `WorkspaceSwitcher`, `TopBar`, `GlobalSearch`, `SectionHeading`, `MetricCard`, `HealthBanner`, `StatusChip`, `OwnerAvatar`, `DurationBadge`, `DataTable`, `FilterBuilder`, `LeadActionRow`, `ActivityTimeline`, `ConversationComposer`, `IntegrationHealthCard`, `EscalationLadder`, `AuditDetailDrawer`, `EmptyState`, `AccessDeniedState`, `ErrorBanner`, `Skeleton`.

Use shadcn/ui primitives for Button, Dialog, Select, Form, Tabs, Sheet, Tooltip, DropdownMenu. Use one icon set (Lucide), 18/20px regular strokes; no emoji as product UI icons. Keep subtle animated count changes <200ms, no shimmering charts.

## 7. Essential component states
- Button: default, hover, focus visible, pressed, disabled, loading, success/error feedback.
- Field: empty, filled, invalid with text, help, required, readonly, hidden by permission.
- Table: loading skeleton, empty-with-call-to-action, empty-after-filter, error+retry, pagination, unauthorized.
- Message: queued/sending/sent/delivered/failed, retry, opted-out disabled.
- Calendar: disconnected/available/loading/busy/conflict/booking/persisted/error.
- Health cards: connected, not configured, degraded, disconnected; show time and last error.

## 8. Accessibility
Target WCAG 2.2 AA. Text contrast ≥4.5:1 normal, ≥3:1 large text; do not rely only on color. Visible focus ring; focus return after dialogs; keyboard alternatives for Kanban drag; tab/ESC semantics; at least 24×24 CSS px pointers where WCAG exception does not apply, prefer 40×40 targets. Live incoming alerts should use polite live regions and user-controlled notification volume. Reduced motion honors `prefers-reduced-motion`. Label every form field and every icon-only button.

## 9. Quality bar / implementation
`../assets/tokens.css` is portable reference for the real `src/app/globals.css`. Screenshot prototype is a **reference**, not code to paste as React components. Port the layout into the typed shared component library. **No inline business-specific colors**, no ad hoc gradients, and no duplicated navigation code.
