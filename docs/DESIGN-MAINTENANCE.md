# Design maintenance and pending approval

## Maintenance

- Preserve all eight notification tone IDs and saved preferences. Sound synthesis now differs in waveform, envelope, harmony and rhythm, rather than primarily pitch. Existing mute, volume bounds, mobile unlock and interruption recovery remain.
- Delete nine historical theme stylesheets with no remaining imports or repository references. Keep styles.css for tokens/utilities, quickserve-system.css for shell styling and phase-two.css for approved shared controls.
- Remove four exact duplicate rules within the same layer/media context, retaining the later authoritative occurrence. No new screen design is applied.

## Validation

Baseline main: 205/205 contracts passed; no failing contract reproduced. Updated suite: 206/206 passed. TypeScript passed. ESLint: zero errors, 59 pre-existing warnings. Production build passed.

Chromium OfflineAudioContext rendered all eight actual playback paths at full volume. Peak amplitude range 0.079–0.298; all signals non-silent. Maximum pairwise normalized correlation 0.413. This confirms signal differences, not subjective listening quality on every speaker.

Nine unused CSS files removed: 128,737 source bytes. Built CSS: 660,549 → 660,420 bytes (129 bytes smaller). The unused files were already excluded from the bundle; their removal mainly reduces maintenance ambiguity. Combined gzip size of the two changed CSS assets is unchanged.

## Pending design approval

Phase 1, 2 and 3 images are concepts, not implemented screens. Both new menu phases retain illustrated Standard Menu and Clickable PDF Menu selectors. Sample dates, totals, availability labels and food content are illustrative; implementations must use actual data, supported existing controls and accurate computed previews.

The current shift creator generates selected weekdays only within a bounded date range, defaulting to one week. Ongoing weekly recurrence with an end condition, pause and safe future-instance updates is proposed separately and not implemented by this maintenance change. Checks cover assignment overlaps and approved leave, not general employee availability or demand forecasting.

Signed-in production and Lovable deployment remain unverified.
