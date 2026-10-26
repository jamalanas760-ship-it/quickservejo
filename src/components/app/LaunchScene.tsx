import { useEffect, useRef } from "react";

/** Decorative enhancement only: startup never waits for WebGL or animation code. */
export function LaunchScene() {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } })
      .connection;
    let cancelled = false;
    let starting = false;
    let release = () => {};
    const disable = () =>
      media.matches ||
      connection?.saveData ||
      document.documentElement.dataset.qsNavigationMotion === "reduced";
    const stop = () => {
      release();
      release = () => {};
      element.dataset.ready = "false";
    };
    const start = async () => {
      if (disable() || cancelled || starting) return;
      starting = true;
      try {
        const [THREE, { gsap }] = await Promise.all([import("three"), import("gsap")]);
        if (cancelled || disable()) return;
        const renderer = new THREE.WebGLRenderer({
          alpha: true,
          antialias: true,
          powerPreference: "low-power",
        });
        const geometries: import("three").BufferGeometry[] = [];
        const materials: import("three").Material[] = [];
        let cleanupListeners = () => {};
        release = () => {
          cleanupListeners();
          renderer.setAnimationLoop(null);
          geometries.forEach((geometry) => geometry.dispose());
          materials.forEach((material) => material.dispose());
          renderer.dispose();
          renderer.forceContextLoss();
          renderer.domElement.remove();
        };
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(33, 1, 0.1, 30);
        camera.position.set(0, 2.6, 7.8);
        camera.lookAt(0, 0.65, 0);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
        renderer.setClearColor(0x000000, 0);
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.4;
        element.appendChild(renderer.domElement);
        const silver = new THREE.MeshStandardMaterial({
          color: 0xf5e5d3,
          metalness: 0.7,
          roughness: 0.24,
        });
        const orange = new THREE.MeshStandardMaterial({
          color: 0xff6b18,
          metalness: 0.35,
          roughness: 0.28,
          emissive: 0xff4d00,
          emissiveIntensity: 0.25,
        });
        materials.push(silver, orange);
        const mesh = (
          geometry: import("three").BufferGeometry,
          material: import("three").Material = silver,
        ) => {
          geometries.push(geometry);
          return new THREE.Mesh(geometry, material);
        };
        scene.add(new THREE.HemisphereLight(0xffffff, 0x554036, 3));
        const key = new THREE.DirectionalLight(0xfff7ec, 5);
        key.position.set(-3, 5, 4);
        scene.add(key);
        const rim = new THREE.DirectionalLight(0xff843d, 4);
        rim.position.set(3, 2, -2);
        scene.add(rim);
        const cloche = new THREE.Group();
        scene.add(cloche);
        cloche.rotation.y = -0.35;
        const plate = mesh(new THREE.CylinderGeometry(1.5, 1.35, 0.12, 64));
        plate.position.y = 0.02;
        cloche.add(plate);
        const ring = mesh(new THREE.TorusGeometry(1.39, 0.035, 10, 64), orange);
        ring.rotation.x = Math.PI / 2;
        ring.position.y = 0.1;
        cloche.add(ring);
        const lid = new THREE.Group();
        cloche.add(lid);
        const profile = [new THREE.Vector2(0, 1.12)];
        for (let i = 1; i <= 24; i++) {
          const angle = ((i / 24) * Math.PI) / 2;
          profile.push(new THREE.Vector2(Math.sin(angle) * 1.27, Math.cos(angle) * 1.08 + 0.04));
        }
        const dome = mesh(new THREE.LatheGeometry(profile.reverse(), 64));
        lid.add(dome);
        const lip = mesh(new THREE.TorusGeometry(1.27, 0.055, 10, 64));
        lip.rotation.x = Math.PI / 2;
        lip.position.y = 0.06;
        lid.add(lip);
        const handle = mesh(new THREE.TorusGeometry(0.14, 0.055, 12, 32), orange);
        handle.position.y = 1.24;
        lid.add(handle);
        const steam: import("three").Mesh[] = [];
        for (let i = 0; i < 3; i++) {
          const material = new THREE.MeshBasicMaterial({
            color: 0xffac6a,
            transparent: true,
            opacity: 0,
          });
          materials.push(material);
          const curve = new THREE.CatmullRomCurve3([
            new THREE.Vector3(0, 0, 0),
            new THREE.Vector3(-0.1, 0.2, 0),
            new THREE.Vector3(0.1, 0.42, 0),
            new THREE.Vector3(0, 0.68, 0),
          ]);
          const wisp = mesh(new THREE.TubeGeometry(curve, 16, 0.018, 6, false), material);
          wisp.position.set((i - 1) * 0.38, 0.25, 0.1);
          cloche.add(wisp);
          steam.push(wisp);
        }
        const timeline = gsap.timeline({ repeat: -1, repeatDelay: 0.35 });
        timeline
          .to(lid.position, { y: 1.05, duration: 1.1, ease: "power3.inOut" }, 0.3)
          .to(lid.rotation, { z: -0.14, y: 0.18, duration: 1.1, ease: "power3.inOut" }, 0.3)
          .to(lid.position, { y: 0, duration: 0.95, ease: "power3.inOut" }, 2.6)
          .to(lid.rotation, { z: 0, y: 0, duration: 0.95, ease: "power3.inOut" }, 2.6);
        steam.forEach((wisp, i) => {
          timeline
            .to(wisp.material, { opacity: 0.7, duration: 0.4 }, 0.95 + i * 0.15)
            .to(wisp.position, { y: 0.95, duration: 1.5, ease: "sine.out" }, 0.95 + i * 0.15)
            .to(wisp.material, { opacity: 0, duration: 0.5 }, 2 + i * 0.15)
            .set(wisp.position, { y: 0.25 }, 3.5);
        });
        const resize = () => {
          const { width, height } = element.getBoundingClientRect();
          renderer.setSize(Math.max(width, 1), Math.max(height, 1));
          camera.aspect = width / Math.max(height, 1);
          camera.updateProjectionMatrix();
        };
        const observer = new ResizeObserver(resize);
        observer.observe(element);
        resize();
        let lastFrame = 0;
        const render = (time: number) => {
          if (time - lastFrame < 1000 / 30) return;
          lastFrame = time;
          try {
            renderer.render(scene, camera);
            element.dataset.ready = "true";
          } catch {
            stop();
          }
        };
        const visibility = () => {
          timeline.paused(document.hidden);
          renderer.setAnimationLoop(document.hidden ? null : render);
        };
        const contextLost = (event: Event) => {
          event.preventDefault();
          stop();
        };
        renderer.domElement.addEventListener("webglcontextlost", contextLost);
        document.addEventListener("visibilitychange", visibility);
        cleanupListeners = () => {
          timeline.kill();
          observer.disconnect();
          document.removeEventListener("visibilitychange", visibility);
          renderer.domElement.removeEventListener("webglcontextlost", contextLost);
        };
        visibility();
      } catch {
        stop(); // The immediately available artwork remains visible without WebGL.
      } finally {
        starting = false;
      }
    };
    const update = () => {
      if (disable()) stop();
      else if (!element.querySelector("canvas")) void start();
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
  return <div ref={host} className="qs-launch-scene" aria-hidden="true" />;
}
