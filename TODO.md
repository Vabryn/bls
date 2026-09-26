# BLS Explorer TODO / Regression Log

## Completed — 16 September 2026

- [x] **Strict script CSP:** removed `unsafe-inline` from `script-src` and allow
  only Cloudflare's required beacon origin; confirmed the deployed page has no
  inline event-handler attributes. Inline styles remain
  for the existing visual system, so `style-src 'unsafe-inline'` is intentionally
  retained until those styles are migrated.
- [x] **Accessible search controls:** location and occupation inputs now expose
  combobox/listbox semantics, expanded state, active descendant, option roles,
  selection state, and keyboard navigation.
- [x] **Keyboard-selectable map regions:** state boundaries, statistical areas,
  and bubble markers expose button semantics, labels, focus styling, and Enter/
  Space activation.
- [x] **Mobile ordering:** map/search now appear first, followed by Summary, then
  the occupation browser; Summary is no longer sticky on small screens.
- [x] **Density clarity:** renamed visible controls to `Density (LQ)`, expanded
  metric names to `Density (Location Quotient)`, and added an explanatory title
  plus accessible description.
- [x] **First-use guidance:** added and regression-tested the helper text; it was
  subsequently removed at the user's request to keep the map area cleaner.
- [x] **Touch target audit:** iPhone-emulated audit found the theme, zoom, map
  style, and search controls below a comfortable touch target. They now expose
  44px hit areas on coarse pointers without changing desktop sizing.
- [x] **Redundancy cleanup:** removed a dead `#mapZoomReset` listener reference;
  the live reset control is `#mapResetBtn` and is wired once.

## Regression results

Command: `npm test`

- Data validation: **PASS** — 2,344 area files / 892,204 occupation records.
- Browser regressions: **11/11 PASS** — storage fallback, stale-response guards,
  failed-load recovery, censored wages, strict CSP/inline-handler check,
  combobox/listbox and keyboard map semantics, mobile ordering, Density copy,
  and responsive light/dark layouts at 320–1440px.
- Live smoke check: **PASS** — HTTP 200, no page or console errors after the
  Cloudflare beacon allowlist was added; 510 keyboard-selectable map regions
  rendered and the mobile order was map → divider → Summary → browser.
- Reusable device audit: **10/10 PASS locally and 10/10 PASS against production**
  (desktop Chromium + iPhone 12 emulation). It covers boot/data integrity,
  theme and all six metrics, both map styles, zoom/wheel/pan/reset, state/area/
  ZIP/place searches, tooltip, keyboard map activation, browse filters and
  sorting, occupation drilldown/region filter/back, deep links, touch target
  sizing, mobile order/overflow, and runtime error collection. Production
  screenshots and JSON output were captured under `/private/tmp/bls-audit-live`.

## Findings retained for future iterations

- The map intentionally exposes roughly 510 focusable regions. That is a large
  keyboard tab sequence; a future “jump to map regions” or grouped navigation
  pattern could make keyboard exploration faster without removing access.
- The first-use helper above the map is intentionally absent per the user's
  request. A short, dismissible onboarding cue could reduce initial confusion
  if the product later permits one.
- Inline style attributes still require `style-src 'unsafe-inline'`; moving the
  remaining dynamic/static styles into classes is the next CSP-hardening step.
- This pass uses Chromium's iPhone 12 device emulation, not physical iOS Safari
  or VoiceOver. Physical-device verification remains a separate release check.

The first post-CSP live smoke check correctly reported a blocked Cloudflare
Insights beacon; the policy was narrowed to `static.cloudflareinsights.com` for
scripts and `cloudflareinsights.com` for its RUM request, then re-tested cleanly.
