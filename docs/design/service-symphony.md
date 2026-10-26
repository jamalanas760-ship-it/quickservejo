# Service Symphony launch (previous design)

Superseded by Service Orbit. Its artwork is retained but is not loaded by the current screen.

This is a photographic layered animation, not a fully modeled restaurant. The source
is the user's approved third concept. The room, furniture, glass, wood and reflections
are baked photographic detail; camera transforms animate the room as a whole. The plate
and dome are separate alpha assets with independent GSAP movement. Procedural Three.js
overlays add steam, fire shimmer, particles, and a progressively drawn orange service route.

Artwork was created with the built-in image-generation tool from the approved restaurant
reference, then resized/encoded as WebP for delivery. The editing prompts preserved the
restaurant while removing text, foreground plate/dome/steam and the baked trail, and
separately extracted/recreated the plate and the dome on transparent backgrounds.
No image-generation API, video service, external assets, or subscriptions are used at runtime.

`public/loading/service-symphony/` contains:

- `restaurant.webp`: desktop background, 205,402 bytes.
- `restaurant-mobile.webp`: responsive background, 109,682 bytes.
- `dish.webp`: transparent plate/food, 59,100 bytes.
- `dome.webp`: transparent dome, 49,120 bytes.

Artwork transfer is approximately 306 KiB on desktop or 213 KiB on mobile (excluding JS/CSS).
Keep asset URLs versioned if replacing artwork so installed-app image caches do not retain
an older image. Do not copy generated branding into the background: brand and localized
loading status remain live DOM text.

The prior 3.5-second minimum, 3.9-second safety dismissal and four-second stalled-view
recovery are unchanged. Animation is decorative and must not become a readiness gate.
Reduced motion, the app's reduced-motion preference and save-data mode skip the animation
imports; static photographic layers remain. WebGL failure or context loss drops effects
while GSAP layer motion can continue. Hidden tabs pause motion/rendering; teardown removes
listeners and observers and disposes all renderer materials/geometries.

Validation covers the production build, TypeScript, application contracts and Chromium
rendering in desktop/mobile/landscape/reduced-motion layouts. It is not a performance
certification across every device. This change does not alter database/backend behavior.
