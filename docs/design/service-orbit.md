# Service Orbit launch (previous design)

Superseded by The Service Dial, which follows the later Anime.js reference.

The supplied reference video uses atmospheric light, a rotating 3D hero, a rapid camera
sweep and a bright-to-dark transition. Service Orbit adapts that motion language to a
restaurant: ingredients and cutlery orbit a glazed porcelain plate, assemble into a place
setting, and a metallic dome lifts to reveal the course. The uploaded video itself and
its branding are not bundled or copied into the application.

The current scene uses modeled Three.js geometry rather than the previous photographic
room layers. It includes studio environment reflections, procedural linen bump texture,
a cloud shader, thin orbital ribbons, particles, steam and GSAP choreography. This is a
stylized 3D restaurant illustration, not photorealistic footage or a full restaurant model.

The 3.5-second minimum, 3.9-second safety dismissal and four-second stalled-view recovery
remain unchanged. The timeline is paused and explicitly advanced from elapsed time, so
GSAP lag smoothing cannot hold the reveal on a delayed frame. Setup/compilation time is
accounted for in the remaining animation budget; no animation completion gates startup.

Rendering is capped at 30 fps and approximately 900,000 drawing-buffer pixels. Mobile
uses a lower-resolution environment, fewer particles and geometry segments. Reduced
motion, the app's motion preference and save-data skip the animation imports; a matching
static SVG composition remains. Hidden tabs stop rendering. Context loss falls back to
the static design; teardown disposes environment targets, textures, geometry and materials.
There are no runtime model downloads, image-generation calls, video services or new packages.

Validation: production build, TypeScript, targeted lint and application contracts; Chromium
checks for the night transition on desktop, mobile and landscape, reduced-motion fallback,
and four-second recovery. The software browser is not a guarantee of frame rate on every
device. Frontend publishing remains separate from source merging.
