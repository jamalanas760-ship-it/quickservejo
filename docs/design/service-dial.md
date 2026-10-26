> Superseded by [The Chrome Service Bell](chrome-service.md).

# The Service Dial

The latest supplied clip shows the Anime.js homepage: a charcoal background, segmented
luminous arcs, counter-rotating inner rings, staggered ticks, a moving dotted curve and a
morphing scan-line field. The Service Dial uses that animation language for an original
restaurant graphic: the lines form a serving dome and plate, framed by cutlery and steam.
It does not copy the reference's branding or homepage layout.

Implementation uses pinned Anime.js 4.5.0 with native SVG/CSS. The loader does not import
Three.js, GSAP, images or video. Other application features may still use Three.js.
The previous loader shader module and unused GSAP package were removed. Old photographic
assets remain for history but are not loaded by the current screen.

The SVG is complete at server render and is the reduced-motion/data-saver/import-failure
fallback. An Anime.js timeline coordinates arc rotation, tick staggering, scan-line SVG
attribute animation, steam drawing and cutlery. The dot stream follows a deterministic
cubic service path. A bounded 30fps requestAnimationFrame loop seeks the paused timeline
by elapsed time, pauses while hidden, and stops after the one-shot sequence. Cleanup
reverts timeline changes and restores manually advanced dots; no global engine settings
are changed. All animation targets are scoped to the mounted component.

The 3.5-second launch minimum, 3.9-second safety dismissal and four-second stalled-view
recovery remain unchanged. No animation completion is a readiness requirement. There
are no fake percentages or operational-data claims in the graphic.

Validation: TypeScript, production build, lint and application contract tests. Chromium
checks independently moving rings/dots, the serving phase on desktop/mobile/landscape,
static reduced motion, stopping motion when the preference changes during playback,
no WebGL canvas, four-second recovery and zero page errors. Screenshots were visually
reviewed, including the scan-line gradient's user-space coordinate handling.

## Light presentation

The launch uses a warm ivory radial background, deep green branding, copper dish strokes and teal accents. The two decorative corner labels are removed. Motion, reduced-motion fallback and the 3.5–3.9 second launch timing are unchanged.
