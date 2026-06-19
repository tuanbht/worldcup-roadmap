# Requirement: Accessibility fixes — tabs, mode toggle, panel focus (CR-3/4/5)

Source: `requirements/change-request-2026-06-19.md`, the three RECOMMENDED
(MEDIUM) accessibility items. Grouped as one focused a11y unit. Use Testing
Library + jsdom (already the project's test stack); mirror existing patterns
rather than inventing new ones.

---

## CR-3 — `aria-controls` on inactive tabs must not dangle
`src/components/panel/match-detail/MatchDetailTabs.tsx` (~lines 66-96). Inactive
tabpanels are not rendered, so each inactive tab's `aria-controls` points at an
element id that does not exist in the DOM — an ARIA integrity failure (axe
`aria-valid-attr-value` / dangling reference).

### Fix (pick the cleaner of the two the review names)
Either (a) render ALL tabpanels and put `hidden` on the inactive ones (so the
referenced ids always exist, inactive content stays out of the a11y tree and tab
order), or (b) omit `aria-controls` on a tab while its panel is unmounted. Prefer
(a) — it keeps the full roving-tab/`aria-controls` wiring intact and is the WAI-
ARIA Authoring Practices tab pattern.

### Acceptance
1. Every tab's `aria-controls` resolves to a panel element present in the DOM.
2. The active panel is visible; inactive panels are `hidden` (not focusable, not
   read by AT) — or `aria-controls` is absent while unmounted.
3. Existing `MatchDetailTabs` tests stay green; add an assertion that each tab's
   `aria-controls` id exists.

---

## CR-4 — `InteractionModeToggle` tablist needs roving tabindex + arrow keys
`src/components/roadmap/InteractionModeToggle.tsx` (~lines 36-46). The control
exposes a tablist/group role but lacks roving tabindex and arrow-key navigation,
so keyboard users cannot move between the options as the role promises.

### Fix
Mirror the keyboard handling already in `MatchDetailTabs.tsx`: roving tabindex
(active option `tabIndex={0}`, the rest `tabIndex={-1}`), `onKeyDown` handling
ArrowLeft/ArrowRight (and Home/End) to move selection+focus, stable ids, and the
correct role wiring (`role="tablist"`/`radiogroup` with matching option roles).
Keep the existing visual design and the mode-switch behavior unchanged.

### Acceptance
4. Exactly one option is in the tab order (`tabIndex=0`); the others are
   `tabIndex=-1`.
5. ArrowRight/ArrowLeft (wrapping) and Home/End move the active option and move
   focus to it; activating an option still switches the interaction mode.
6. Roles/aria wiring valid; new tests cover the roving-tabindex + arrow-key
   behavior. Existing `InteractionModeToggle` tests stay green.

---

## CR-5 — Match-detail panel must manage focus on open/close
`src/components/panel/MatchDetailPanel.tsx` (~lines 87-92). Opening the panel does
not move focus into it, and closing does not restore focus to the trigger — a
focus-trap/return gap for keyboard and screen-reader users.

### Fix
Add a `ref` to the close button and an effect that focuses it when `matchId`
transitions null→set (panel opens). Capture the previously-focused element when
opening and restore focus to it (the triggering match node) when the panel
closes (`matchId` → null), guarding for the element still being in the DOM. The
existing Escape-to-close stays.

### Acceptance
7. When the panel opens (matchId null→set), focus moves into the panel (the close
   button).
8. When the panel closes (matchId set→null), focus returns to the element that
   was focused when it opened (the trigger), when that element is still present.
9. Escape-to-close still works; `inert`/`aria-hidden` on the closed panel is
   preserved. New tests cover focus-in on open and focus-restore on close.

---

## Constraints (whole requirement)
- Mirror the project's existing components/patterns (esp. `MatchDetailTabs`
  keyboard handling for CR-4); no new a11y library.
- Immutability + explicit handling per the coding-style rules; components stay
  focused (<50-line functions where reasonable).
- All gates green and deterministic: `npm run test`, `npm run typecheck`,
  `npm run build`, `npx prettier --check` on touched files.

## Files likely touched
- `src/components/panel/match-detail/MatchDetailTabs.tsx` (+ test) — CR-3
- `src/components/roadmap/InteractionModeToggle.tsx` (+ test) — CR-4
- `src/components/panel/MatchDetailPanel.tsx` (+ test) — CR-5
