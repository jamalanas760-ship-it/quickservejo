# The Chrome Service Bell

The current QuickServe launch replaces the Service Dial with an original restaurant scene inspired by the supplied Gionatan Nese reference. It uses GSAP 3.15.0 and the existing Three.js dependency, GLTFLoader, a custom GLSL MatCap reflection shader and direct WebGL rendering. The original cloche glTF mesh and studio MatCap are authored for QuickServe; no reference-site model, texture, shader source or branding is copied.

## Sequence

A floating silver service bell enters and turns, presses gently, then lifts and tilts into a serving cloche above a porcelain plate. The plate expands as the cloche lifts clear, then an original stylized entree and herbs appear, and translucent shader ribbons rise as steam. Editorial typography sits above and below the composition on an ivory white background. The two corner labels stay removed. Existing primary-overlay coordination, 3500ms minimum, 3900ms safety and four-second recovery are unchanged.

## Runtime and fallback

The WebGL module is imported only after checking system reduced motion, app reduced motion and Save Data. Before rendering, during server boot, or if the model or renderer fails, a neutral three-dot loading indicator is shown. Preference changes tear down the renderer. Model fetch is abortable; the local glTF embeds its buffer and needs no external textures. Hidden documents pause the animation. Unmount, preference change and WebGL context loss cancel frames and fetches, dispose model geometry, materials, textures, composer and renderer, and remove listeners.

The GSAP timeline is sampled against elapsed time from the loading screen start, so a delayed model load does not restart the reveal. It is capped at approximately 30fps and 3400ms. It renders directly without full-screen post-processing. The drawing buffer is capped at 420k pixels on mobile and 650k on desktop; three consecutively slow main-thread renders lower the budget to 240k pixels for that launch. This is an adaptive quality limit, not a guarantee of frame rate on every device. No global GSAP ticker settings are changed.

## Verification

TypeScript, targeted ESLint, production build and existing application contracts are checked. Chromium visual checks cover desktop, portrait mobile and landscape; static reduced-motion rendering; live preference changes; missing model; lost WebGL context; and recovery. The shader and model can render differently across GPU implementations; software Chromium can trigger the economical quality path. No paid assets, services or runtime APIs are added. Deployment and real-device performance remain separate from source validation.
