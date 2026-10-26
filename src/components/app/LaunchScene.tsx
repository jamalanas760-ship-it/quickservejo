import { useEffect, useRef } from "react";

/** Procedural table service: no downloaded models, textures, or startup dependency. */
export function LaunchScene() {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = host.current;
    // The server boot artwork stays static; only the active application owns a renderer.
    if (!element || element.closest("#qs-boot")) return;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } })
      .connection;
    let cancelled = false;
    let starting = false;
    let release = () => {};
    const disabled = () =>
      media.matches ||
      connection?.saveData ||
      document.documentElement.dataset.qsNavigationMotion === "reduced";
    const stop = () => {
      const dispose = release;
      release = () => {};
      dispose();
      element.dataset.ready = "false";
    };
    const start = async () => {
      if (disabled() || cancelled || starting) return;
      starting = true;
      try {
        const [THREE, { gsap }, { RoomEnvironment }] = await Promise.all([
          import("three"),
          import("gsap"),
          import("three/addons/environments/RoomEnvironment.js"),
        ]);
        if (cancelled || disabled()) return;
        const compact = window.matchMedia("(max-width: 640px)").matches;
        const renderer = new THREE.WebGLRenderer({
          alpha: true,
          antialias: true,
          powerPreference: "low-power",
        });
        const geometries: import("three").BufferGeometry[] = [];
        const materials: import("three").Material[] = [];
        const textures: import("three").Texture[] = [];
        let cleanupListeners = () => {};
        let cleanupEnvironment = () => {};
        release = () => {
          cleanupListeners();
          renderer.setAnimationLoop(null);
          geometries.forEach((geometry) => geometry.dispose());
          materials.forEach((material) => material.dispose());
          textures.forEach((texture) => texture.dispose());
          cleanupEnvironment();
          renderer.dispose();
          renderer.forceContextLoss();
          renderer.domElement.remove();
        };
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, compact ? 1.25 : 1.5));
        renderer.setClearColor(0x000000, 0);
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.05;
        element.appendChild(renderer.domElement);
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 40);
        camera.position.set(0, 4.4, 7.2);
        camera.lookAt(0, 0.65, 0);
        const room = new RoomEnvironment();
        const pmrem = new THREE.PMREMGenerator(renderer);
        cleanupEnvironment = () => {
          room.dispose();
          pmrem.dispose();
        };
        const environment = pmrem.fromScene(room, 0.06, 0.1, 30, { size: compact ? 128 : 256 });
        scene.environment = environment.texture;
        cleanupEnvironment = () => {
          environment.dispose();
          room.dispose();
          pmrem.dispose();
        };
        scene.environmentIntensity = 0.9;
        scene.add(new THREE.HemisphereLight(0xfff8ef, 0x746455, 1.3));
        const key = new THREE.DirectionalLight(0xfff4e6, 2);
        key.position.set(-3, 6, 4);
        scene.add(key);
        const rim = new THREE.DirectionalLight(0xff9b58, 1.3);
        rim.position.set(4, 3, -3);
        scene.add(rim);
        const material = (parameters: import("three").MeshStandardMaterialParameters) => {
          const value = new THREE.MeshStandardMaterial(parameters);
          materials.push(value);
          return value;
        };
        const silver = material({ color: 0xe4e3df, metalness: 0.94, roughness: 0.35 });
        const porcelain = material({ color: 0xfffbf2, metalness: 0.05, roughness: 0.2 });
        const linen = material({
          color: 0xc84f19,
          metalness: 0,
          roughness: 0.95,
          side: THREE.DoubleSide,
        });
        const brass = material({ color: 0xe9a757, metalness: 0.7, roughness: 0.25 });
        const green = material({ color: 0x527347, roughness: 0.8 });
        const golden = material({ color: 0xd79b42, roughness: 0.65 });
        const mesh = (
          geometry: import("three").BufferGeometry,
          surface: import("three").Material,
          parent: import("three").Object3D,
        ) => {
          geometries.push(geometry);
          const value = new THREE.Mesh(geometry, surface);
          parent.add(value);
          return value;
        };
        const table = new THREE.Group();
        table.rotation.y = -0.12;
        scene.add(table);
        // A tiny generated radial texture gives a soft contact shadow without shadow maps.
        const shadowCanvas = document.createElement("canvas");
        shadowCanvas.width = shadowCanvas.height = 128;
        const painter = shadowCanvas.getContext("2d");
        if (painter) {
          const gradient = painter.createRadialGradient(64, 64, 12, 64, 64, 64);
          gradient.addColorStop(0, "rgba(100,65,35,.3)");
          gradient.addColorStop(0.5, "rgba(100,65,35,.12)");
          gradient.addColorStop(1, "rgba(100,65,35,0)");
          painter.fillStyle = gradient;
          painter.fillRect(0, 0, 128, 128);
          const texture = new THREE.CanvasTexture(shadowCanvas);
          textures.push(texture);
          const surface = new THREE.MeshBasicMaterial({
            map: texture,
            transparent: true,
            depthWrite: false,
          });
          materials.push(surface);
          const shadow = mesh(new THREE.PlaneGeometry(4.4, 4.4), surface, table);
          shadow.rotation.x = -Math.PI / 2;
          shadow.position.y = -0.16;
        }
        const plate = new THREE.Group();
        table.add(plate);
        const plateProfile = [
          [0, -0.03],
          [0.95, -0.03],
          [1.18, 0.01],
          [1.39, 0.1],
          [1.48, 0.15],
          [1.48, 0.18],
          [1.38, 0.18],
          [1.13, 0.07],
          [0.92, 0.045],
          [0, 0.045],
        ];
        mesh(
          new THREE.LatheGeometry(
            plateProfile.map(([x, y]) => new THREE.Vector2(x, y)),
            compact ? 48 : 72,
          ),
          porcelain,
          plate,
        );
        const trim = mesh(new THREE.TorusGeometry(1.43, 0.012, 8, 64), brass, plate);
        trim.rotation.x = Math.PI / 2;
        trim.position.y = 0.185;
        // A small plated centerpiece appears when the dome lifts.
        const food = mesh(new THREE.SphereGeometry(0.36, 24, 12), golden, plate);
        food.scale.set(1.3, 0.6, 1);
        food.position.set(0, 0.18, 0);
        for (let i = 0; i < 3; i++) {
          const leaf = mesh(new THREE.SphereGeometry(0.12, 12, 8), green, plate);
          leaf.scale.set(0.5, 0.12, 1.5);
          leaf.position.set((i - 1) * 0.13, 0.39, -0.01);
          leaf.rotation.y = i * 1.1;
        }
        const napkin = new THREE.Group();
        napkin.position.set(-2.08, -0.04, 0.12);
        napkin.rotation.y = -0.08;
        table.add(napkin);
        const cloth = mesh(new THREE.BoxGeometry(0.85, 0.045, 1.8), linen, napkin);
        const fold = mesh(new THREE.BoxGeometry(0.45, 0.04, 1.8), linen, napkin);
        fold.position.set(-0.18, 0.035, 0);
        fold.rotation.z = -0.07;
        cloth.rotation.z = 0.015;
        const fork = new THREE.Group();
        fork.position.set(-2.08, 0.07, 0.08);
        table.add(fork);
        const handle = mesh(new THREE.CapsuleGeometry(0.052, 0.85, 4, 8), silver, fork);
        handle.rotation.x = Math.PI / 2;
        handle.position.z = 0.34;
        const neck = mesh(new THREE.BoxGeometry(0.09, 0.055, 0.35), silver, fork);
        neck.position.z = -0.26;
        const forkHead = mesh(new THREE.BoxGeometry(0.3, 0.055, 0.23), silver, fork);
        forkHead.position.z = -0.47;
        for (let i = 0; i < 4; i++) {
          const tine = mesh(new THREE.BoxGeometry(0.045, 0.05, 0.36), silver, fork);
          tine.position.set((i - 1.5) * 0.08, 0, -0.72);
        }
        const knife = new THREE.Group();
        knife.position.set(1.96, 0.06, 0.08);
        table.add(knife);
        const knifeHandle = mesh(new THREE.CapsuleGeometry(0.065, 0.75, 4, 8), silver, knife);
        knifeHandle.rotation.x = Math.PI / 2;
        knifeHandle.position.z = 0.35;
        const blade = mesh(new THREE.BoxGeometry(0.16, 0.035, 0.92), silver, knife);
        blade.position.set(-0.04, 0, -0.49);
        const spoon = new THREE.Group();
        spoon.position.set(2.48, 0.065, 0.08);
        table.add(spoon);
        const spoonHandle = mesh(new THREE.CapsuleGeometry(0.042, 0.92, 4, 8), silver, spoon);
        spoonHandle.rotation.x = Math.PI / 2;
        spoonHandle.position.z = 0.3;
        const bowl = mesh(new THREE.SphereGeometry(0.19, 20, 10), silver, spoon);
        bowl.scale.set(0.9, 0.18, 1.35);
        bowl.position.z = -0.5;
        const lid = new THREE.Group();
        table.add(lid);
        const profile = [new THREE.Vector2(0, 1.14)];
        for (let i = 1; i <= 24; i++) {
          const a = ((i / 24) * Math.PI) / 2;
          profile.push(new THREE.Vector2(Math.sin(a) * 1.18, Math.cos(a) * 1.1 + 0.04));
        }
        mesh(new THREE.LatheGeometry(profile.reverse(), compact ? 48 : 72), silver, lid);
        const lip = mesh(new THREE.TorusGeometry(1.18, 0.035, 10, 64), silver, lid);
        lip.rotation.x = Math.PI / 2;
        lip.position.y = 0.06;
        const knob = mesh(new THREE.TorusGeometry(0.11, 0.035, 10, 24), brass, lid);
        knob.position.y = 1.23;
        const steam: import("three").Mesh[] = [];
        for (let i = 0; i < 3; i++) {
          const surface = new THREE.MeshBasicMaterial({
            color: 0xdbb397,
            transparent: true,
            opacity: 0,
            depthWrite: false,
          });
          materials.push(surface);
          const curve = new THREE.CatmullRomCurve3([
            new THREE.Vector3(0, 0, 0),
            new THREE.Vector3(-0.08, 0.2, 0),
            new THREE.Vector3(0.08, 0.42, 0),
            new THREE.Vector3(0, 0.7, 0),
          ]);
          const wisp = mesh(new THREE.TubeGeometry(curve, 16, 0.015, 5, false), surface, table);
          wisp.position.set((i - 1) * 0.3, 0.4, 0.12);
          steam.push(wisp);
        }
        const timeline = gsap.timeline({ defaults: { ease: "power3.out" } });
        timeline
          .from(plate.position, { y: -0.4, z: 0.45, duration: 0.7 }, 0)
          .from(plate.scale, { x: 0.75, y: 0.75, z: 0.75, duration: 0.7 }, 0)
          .from(napkin.scale, { x: 0.08, duration: 0.8 }, 0.1)
          .from(napkin.rotation, { y: -0.45, duration: 0.8 }, 0.1)
          .from(fork.position, { x: -3.7, duration: 0.75 }, 0.15)
          .from(knife.position, { x: 3.5, duration: 0.75 }, 0.22)
          .from(spoon.position, { x: 4.1, duration: 0.75 }, 0.3)
          .from(lid.position, { y: 1.8, duration: 0.75, ease: "power3.inOut" }, 0.45)
          .to(
            lid.position,
            { y: 1.52, x: 0.3, z: -0.35, duration: 1.05, ease: "power3.inOut" },
            1.45,
          )
          .to(lid.rotation, { z: -0.2, y: 0.2, duration: 1.05, ease: "power3.inOut" }, 1.45)
          .to(table.rotation, { y: 0.08, duration: 3.2, ease: "sine.inOut" }, 0);
        steam.forEach((wisp, i) => {
          timeline
            .to(wisp.material, { opacity: 0.55, duration: 0.35 }, 1.85 + i * 0.13)
            .to(wisp.position, { y: 1.1, duration: 1.1, ease: "sine.out" }, 1.85 + i * 0.13)
            .to(wisp.material, { opacity: 0, duration: 0.4 }, 2.65 + i * 0.13);
        });
        let observer: ResizeObserver | undefined;
        const renderFrame = () => {
          try {
            renderer.render(scene, camera);
            element.dataset.ready = "true";
          } catch {
            stop();
          }
        };
        const resize = () => {
          const { width, height } = element.getBoundingClientRect();
          if (!width || !height) return;
          renderer.setSize(width, height);
          camera.aspect = width / height;
          // Keep the entire place setting inside narrow screens and landscape layouts.
          camera.position.set(0, 4.4, 7.2).multiplyScalar(Math.max(1, 1.5 / camera.aspect));
          camera.lookAt(0, 0.65, 0);
          camera.updateProjectionMatrix();
          renderFrame();
        };
        let lastFrame = 0;
        const render = (time: number) => {
          if (time - lastFrame < 1000 / 30) return;
          lastFrame = time;
          renderFrame();
        };
        const visibility = () => {
          timeline.paused(document.hidden);
          renderer.setAnimationLoop(document.hidden ? null : render);
        };
        const contextLost = (event: Event) => {
          event.preventDefault();
          stop();
        };
        cleanupListeners = () => {
          timeline.kill();
          observer?.disconnect();
          document.removeEventListener("visibilitychange", visibility);
          renderer.domElement.removeEventListener("webglcontextlost", contextLost);
        };
        observer = new ResizeObserver(resize);
        observer.observe(element);
        renderer.domElement.addEventListener("webglcontextlost", contextLost);
        document.addEventListener("visibilitychange", visibility);
        resize();
        if (element.dataset.ready === "true") visibility();
      } catch {
        stop();
      } finally {
        starting = false;
      }
    };
    const update = () => {
      if (disabled()) stop();
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
