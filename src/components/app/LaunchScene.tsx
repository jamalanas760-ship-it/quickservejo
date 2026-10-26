import { useEffect, useRef } from "react";
import { flameFragment, particleFragment, screenVertex, steamFragment } from "./cinematic-shaders";

const ART = "/loading/service-symphony/";

/** A photographic layered scene with independent choreography and procedural WebGL effects. */
export function LaunchScene() {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = host.current;
    if (!element || element.closest("#qs-boot")) return;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } })
      .connection;
    const disabled = () =>
      media.matches ||
      connection?.saveData ||
      document.documentElement.dataset.qsNavigationMotion === "reduced";
    let cancelled = false;
    let starting = false;
    let cleanupMotion = () => {};
    let cleanupFx = () => {};
    const stopFx = () => {
      const dispose = cleanupFx;
      cleanupFx = () => {};
      dispose();
    };
    const stop = () => {
      cleanupMotion();
      cleanupMotion = () => {};
      stopFx();
      element.dataset.motion = "false";
    };
    const start = async () => {
      if (cancelled || disabled() || starting || element.dataset.motion === "true") return;
      starting = true;
      try {
        const { gsap } = await import("gsap");
        if (cancelled || disabled()) return;
        const timeline = gsap.timeline({ defaults: { ease: "power2.inOut" } });
        let updateFxVisibility = (_visible: boolean) => {};
        const visibility = () => {
          timeline.paused(document.hidden);
          updateFxVisibility(!document.hidden);
        };
        const context = gsap.context(() => {
          timeline
            .fromTo(
              ".qs-cine-camera",
              { scale: 1.035, xPercent: -0.35 },
              { scale: 1.07, xPercent: 0.4, duration: 3.5, ease: "sine.inOut" },
              0,
            )
            .fromTo(
              ".qs-cine-dish img",
              { xPercent: -7, yPercent: 14, scale: 0.94, opacity: 0 },
              {
                xPercent: 0,
                yPercent: 0,
                scale: 1,
                opacity: 1,
                duration: 0.85,
                ease: "power3.out",
              },
              0.08,
            )
            .fromTo(
              ".qs-cine-dome img",
              { yPercent: 34, rotation: -6, opacity: 0 },
              { yPercent: 12, rotation: 0, opacity: 1, duration: 0.85 },
              0.25,
            )
            .to(".qs-cine-dome img", { yPercent: -18, rotation: 5, duration: 1.35 }, 1.15)
            .fromTo(
              ".qs-cine-glow",
              { opacity: 0.15 },
              {
                opacity: 0.55,
                duration: 0.7,
                stagger: 0.12,
                repeat: 3,
                yoyo: true,
                ease: "sine.inOut",
              },
              0,
            );
        }, element);
        document.addEventListener("visibilitychange", visibility);
        cleanupMotion = () => {
          context.revert();
          timeline.kill();
          document.removeEventListener("visibilitychange", visibility);
        };
        element.dataset.motion = "true";
        visibility();
        // Lighting is progressive enhancement; the photographic layers also animate without WebGL.
        try {
          const THREE = await import("three");
          if (cancelled || disabled() || element.dataset.motion !== "true") return;
          const mount = element.querySelector<HTMLDivElement>(".qs-cine-effects");
          if (!mount) return;
          const renderer = new THREE.WebGLRenderer({
            alpha: true,
            antialias: true,
            powerPreference: "low-power",
          });
          renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.25));
          renderer.setClearColor(0x000000, 0);
          mount.appendChild(renderer.domElement);
          const scene = new THREE.Scene();
          const camera = new THREE.OrthographicCamera(0, 1, 1, 0, 0.1, 10);
          camera.position.z = 2;
          const geometries: import("three").BufferGeometry[] = [];
          const materials: import("three").Material[] = [];
          let alive = true;
          let observer: ResizeObserver | undefined;
          const contextLost = (event: Event) => {
            event.preventDefault();
            stopFx();
          };
          cleanupFx = () => {
            alive = false;
            observer?.disconnect();
            updateFxVisibility = () => {};
            renderer.setAnimationLoop(null);
            renderer.domElement.removeEventListener("webglcontextlost", contextLost);
            geometries.forEach((g) => g.dispose());
            materials.forEach((m) => m.dispose());
            renderer.dispose();
            renderer.forceContextLoss();
            renderer.domElement.remove();
            mount.dataset.ready = "false";
          };
          const shader = (
            fragment: string,
            uniforms: Record<string, { value: number }>,
            x: number,
            y: number,
            width: number,
            height: number,
          ) => {
            const geometry = new THREE.PlaneGeometry(width, height);
            geometries.push(geometry);
            const material = new THREE.ShaderMaterial({
              vertexShader: screenVertex,
              fragmentShader: fragment,
              uniforms,
              transparent: true,
              depthWrite: false,
              blending: THREE.AdditiveBlending,
            });
            materials.push(material);
            const mesh = new THREE.Mesh(geometry, material);
            mesh.position.set(x, 1 - y, 0);
            scene.add(mesh);
            return material;
          };
          const time = { value: 0 },
            reveal = { value: 0 };
          shader(steamFragment, { uTime: time, uReveal: reveal }, 0.435, 0.405, 0.15, 0.25);
          shader(flameFragment, { uTime: time }, 0.065, 0.155, 0.13, 0.15);
          shader(flameFragment, { uTime: time }, 0.205, 0.363, 0.11, 0.1);
          const points = [
            [0.225, 0.285],
            [0.24, 0.25],
            [0.32, 0.34],
            [0.47, 0.435],
            [0.62, 0.49],
            [0.68, 0.46],
            [0.67, 0.39],
            [0.78, 0.33],
            [0.85, 0.29],
            [0.855, 0.26],
          ];
          const route = new THREE.CatmullRomCurve3(
            points.map(([x, y]) => new THREE.Vector3(x, 1 - y, 0.1)),
          );
          const routeProgress = { value: 0 };
          const tubes: import("three").TubeGeometry[] = [];
          for (const [radius, color, opacity] of [
            [0.007, 0xff6909, 0.22],
            [0.0015, 0xff9c35, 0.65],
            [0.00045, 0xffe9b2, 0.9],
          ]) {
            const geometry = new THREE.TubeGeometry(route, 100, radius, 5, false);
            geometries.push(geometry);
            tubes.push(geometry);
            const material = new THREE.MeshBasicMaterial({
              color,
              opacity,
              transparent: true,
              depthWrite: false,
              blending: THREE.AdditiveBlending,
            });
            materials.push(material);
            scene.add(new THREE.Mesh(geometry, material));
          }
          // The light head and fine particles move in artboard coordinates, independent of camera drift.
          const count = window.innerWidth < 640 ? 20 : 42;
          const positions = new Float32Array(count * 3);
          const geometry = new THREE.BufferGeometry();
          geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
          geometries.push(geometry);
          const particles = new THREE.ShaderMaterial({
            vertexShader:
              "void main(){gl_PointSize=4.;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
            fragmentShader: particleFragment,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
          });
          materials.push(particles);
          scene.add(new THREE.Points(geometry, particles));
          // Start effects at the corresponding point in the shared sequence, even after a slow import.
          let lastFrame = 0;
          const render = (stamp: number) => {
            if (!alive || stamp - lastFrame < 1000 / 30) return;
            lastFrame = stamp;
            const elapsed = timeline.time();
            time.value = elapsed;
            reveal.value = Math.min(1, Math.max(0, (elapsed - 1.15) * 1.5));
            routeProgress.value = Math.min(1, Math.max(0, (elapsed - 0.35) / 2.7));
            tubes.forEach((tube) =>
              tube.setDrawRange(
                0,
                Math.floor(((tube.index?.count ?? 0) * routeProgress.value) / 3) * 3,
              ),
            );
            for (let i = 0; i < count; i++) {
              const travel = (i * 0.071 + elapsed * 0.025) % 1;
              positions[i * 3] = 0.2 + ((i * 37) % 71) / 100 + Math.sin(elapsed * 0.6 + i) * 0.005;
              positions[i * 3 + 1] = 0.32 + travel * 0.37;
              positions[i * 3 + 2] = 0.2;
            }
            (geometry.attributes.position as import("three").BufferAttribute).needsUpdate = true;
            try {
              renderer.render(scene, camera);
              mount.dataset.ready = "true";
            } catch {
              stopFx();
            }
          };
          const resize = () => {
            if (!alive) return;
            const { width, height } = mount.getBoundingClientRect();
            if (width && height) renderer.setSize(width, height);
          };
          observer = new ResizeObserver(resize);
          observer.observe(mount);
          resize();
          renderer.domElement.addEventListener("webglcontextlost", contextLost);
          updateFxVisibility = (visible) => {
            if (alive) renderer.setAnimationLoop(visible ? render : null);
          };
          visibility();
        } catch {
          stopFx();
        }
      } catch {
        stop();
      } finally {
        starting = false;
      }
    };
    const update = () => {
      if (disabled()) stop();
      else void start();
    };
    const preferences = new MutationObserver(update);
    preferences.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-qs-navigation-motion"],
    });
    media.addEventListener("change", update);
    void start();
    return () => {
      cancelled = true;
      preferences.disconnect();
      media.removeEventListener("change", update);
      stop();
    };
  }, []);
  return (
    <div ref={host} className="qs-cine-stage" aria-hidden="true">
      <div className="qs-cine-artboard">
        <div className="qs-cine-camera">
          <picture>
            <source media="(max-width: 640px)" srcSet={`${ART}restaurant-mobile.webp`} />
            <img
              className="qs-cine-background"
              src={`${ART}restaurant.webp`}
              alt=""
              width="1672"
              height="941"
              fetchPriority="high"
            />
          </picture>
          <div className="qs-cine-dish">
            <img src={`${ART}dish.webp`} alt="" width="720" height="321" fetchPriority="high" />
          </div>
          <div className="qs-cine-dome">
            <img src={`${ART}dome.webp`} alt="" width="640" height="427" fetchPriority="high" />
          </div>
          <span className="qs-cine-glow qs-cine-glow-pass" />
          <span className="qs-cine-glow qs-cine-glow-dining" />
          <div className="qs-cine-effects qs-launch-scene" />
        </div>
      </div>
    </div>
  );
}
