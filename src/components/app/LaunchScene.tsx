import { useEffect, useId, useRef } from "react";
import { atmosphereFragment, atmosphereVertex, sparkFragment } from "./cinematic-shaders";

/** Service Orbit: actual 3D objects, a camera sweep, orbital assembly and atmospheric transition. */
export function LaunchScene() {
  const host = useRef<HTMLDivElement>(null);
  const gradient = useId().replace(/:/g, "");
  useEffect(() => {
    const element = host.current;
    if (!element || element.closest("#qs-boot")) return;
    const mountedAt = performance.now();
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } })
      .connection;
    const disabled = () =>
      media.matches ||
      connection?.saveData ||
      document.documentElement.dataset.qsNavigationMotion === "reduced";
    let cancelled = false,
      starting = false;
    let dispose = () => {};
    const stop = () => {
      const release = dispose;
      dispose = () => {};
      release();
      element.dataset.ready = "false";
    };
    const start = async () => {
      if (cancelled || disabled() || starting || element.querySelector("canvas")) return;
      starting = true;
      try {
        const [THREE, { gsap }, { RoomEnvironment }] = await Promise.all([
          import("three"),
          import("gsap"),
          import("three/addons/environments/RoomEnvironment.js"),
        ]);
        if (cancelled || disabled()) return;
        const compact = window.innerWidth < 640;
        const renderer = new THREE.WebGLRenderer({
          alpha: true,
          antialias: true,
          powerPreference: "low-power",
        });
        const geometries: import("three").BufferGeometry[] = [];
        const materials: import("three").Material[] = [];
        const textures: import("three").Texture[] = [];
        let alive = true,
          cleanup = () => {},
          cleanupEnvironment = () => {};
        dispose = () => {
          alive = false;
          cleanup();
          renderer.setAnimationLoop(null);
          geometries.forEach((g) => g.dispose());
          materials.forEach((m) => m.dispose());
          textures.forEach((t) => t.dispose());
          cleanupEnvironment();
          renderer.dispose();
          renderer.forceContextLoss();
          renderer.domElement.remove();
        };
        renderer.setPixelRatio(Math.min(devicePixelRatio || 1, compact ? 1.25 : 1.5));
        renderer.setClearColor(0, 0);
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.1;
        element.appendChild(renderer.domElement);
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 50);
        const orbit = { x: -2.6, y: 5.5, z: 10.2 };
        const uniformTime = { value: 0 },
          night = { value: 0 },
          flash = { value: 0 },
          aspect = { value: 1 };
        const backgroundGeometry = new THREE.PlaneGeometry(2, 2);
        geometries.push(backgroundGeometry);
        const backgroundMaterial = new THREE.ShaderMaterial({
          vertexShader: atmosphereVertex,
          fragmentShader: atmosphereFragment,
          uniforms: { uTime: uniformTime, uNight: night, uFlash: flash, uAspect: aspect },
          depthTest: false,
          depthWrite: false,
        });
        materials.push(backgroundMaterial);
        const atmosphere = new THREE.Mesh(backgroundGeometry, backgroundMaterial);
        atmosphere.frustumCulled = false;
        atmosphere.renderOrder = -1000;
        scene.add(atmosphere);
        const room = new RoomEnvironment(),
          pmrem = new THREE.PMREMGenerator(renderer);
        cleanupEnvironment = () => {
          room.dispose();
          pmrem.dispose();
        };
        const environment = pmrem.fromScene(room, 0.06, 0.1, 30, { size: compact ? 128 : 256 });
        scene.environment = environment.texture;
        scene.environmentIntensity = 1;
        cleanupEnvironment = () => {
          environment.dispose();
          room.dispose();
          pmrem.dispose();
        };
        scene.add(new THREE.HemisphereLight(0xfff6e5, 0x272f3c, 1.5));
        const key = new THREE.DirectionalLight(0xffead0, 2.7);
        key.position.set(-4, 6, 4);
        scene.add(key);
        const rim = new THREE.DirectionalLight(0xff8c34, 3);
        rim.position.set(3, 2, -4);
        scene.add(rim);
        const material = (params: import("three").MeshStandardMaterialParameters) => {
          const m = new THREE.MeshStandardMaterial(params);
          materials.push(m);
          return m;
        };
        const porcelain = material({ color: 0xfff8eb, roughness: 0.17, metalness: 0.05 });
        const silver = material({ color: 0xd6d5ce, roughness: 0.28, metalness: 0.94 });
        const brass = material({ color: 0xe9a654, roughness: 0.23, metalness: 0.8 });
        const tomato = material({ color: 0xc73e1d, roughness: 0.27 });
        const herb = material({ color: 0x427139, roughness: 0.8 });
        const golden = material({ color: 0xc88d3c, roughness: 0.6 });
        const sear = material({ color: 0x704322, roughness: 0.85 });
        const mesh = (
          geometry: import("three").BufferGeometry,
          surface: import("three").Material,
          parent: import("three").Object3D,
        ) => {
          geometries.push(geometry);
          const m = new THREE.Mesh(geometry, surface);
          parent.add(m);
          return m;
        };
        const world = new THREE.Group();
        world.rotation.y = -0.55;
        world.rotation.z = -0.05;
        world.position.y = 0.2;
        scene.add(world);
        const plate = new THREE.Group();
        world.add(plate);
        const profile = [
          [0, -0.05],
          [1, -0.05],
          [1.2, 0],
          [1.46, 0.14],
          [1.53, 0.2],
          [1.5, 0.23],
          [1.38, 0.2],
          [1.14, 0.075],
          [0.94, 0.06],
          [0, 0.06],
        ];
        mesh(
          new THREE.LatheGeometry(
            profile.map(([x, y]) => new THREE.Vector2(x, y)),
            compact ? 48 : 72,
          ),
          porcelain,
          plate,
        );
        const trim = mesh(new THREE.TorusGeometry(1.47, 0.016, 8, 72), brass, plate);
        trim.rotation.x = Math.PI / 2;
        trim.position.y = 0.22;
        // The centerpiece is modeled geometry, so it changes perspective during the camera orbit.
        const course = new THREE.Group();
        plate.add(course);
        const scallop = mesh(new THREE.SphereGeometry(0.4, 32, 16), golden, course);
        scallop.scale.set(1, 0.55, 1);
        scallop.position.y = 0.27;
        for (let i = 0; i < 5; i++) {
          const stripe = mesh(new THREE.CapsuleGeometry(0.012, 0.43, 3, 6), sear, course);
          stripe.rotation.set(Math.PI / 2, 0, -0.2);
          stripe.position.set((i - 2) * 0.1, 0.46, 0);
          stripe.scale.y = Math.sqrt(Math.max(0.15, 1 - Math.pow((i - 2) * 0.25, 2)));
        }
        const food: import("three").Object3D[] = [];
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * Math.PI * 2;
          const piece = mesh(
            new THREE.SphereGeometry(i % 3 === 0 ? 0.14 : 0.12, 16, 10),
            i % 3 === 0 ? tomato : golden,
            plate,
          );
          if (i % 3 !== 0) piece.scale.set(1.2, 0.7, 0.8);
          const target = new THREE.Vector3(Math.cos(a) * 0.77, 0.19, Math.sin(a) * 0.67);
          piece.position.copy(target);
          food.push(piece);
        }
        for (let i = 0; i < 5; i++) {
          const leaf = mesh(new THREE.SphereGeometry(0.17, 12, 8), herb, plate);
          leaf.scale.set(0.5, 0.09, 1.3);
          leaf.rotation.y = i * 1.4;
          const target = new THREE.Vector3(
            Math.sin(i * 1.8) * 0.32,
            0.52 + i * 0.015,
            Math.cos(i * 1.8) * 0.23,
          );
          leaf.position.copy(target);
          food.push(leaf);
        }
        const fork = new THREE.Group();
        fork.position.set(-1.98, 0.16, 0);
        world.add(fork);
        const fh = mesh(new THREE.CapsuleGeometry(0.05, 0.95, 4, 8), silver, fork);
        fh.rotation.x = Math.PI / 2;
        fh.position.z = 0.3;
        const fn = mesh(new THREE.BoxGeometry(0.3, 0.05, 0.24), silver, fork);
        fn.position.z = -0.44;
        for (let i = 0; i < 4; i++) {
          const tine = mesh(new THREE.BoxGeometry(0.045, 0.045, 0.35), silver, fork);
          tine.position.set((i - 1.5) * 0.08, 0, -0.7);
        }
        const knife = new THREE.Group();
        knife.position.set(1.98, 0.16, 0);
        world.add(knife);
        const kh = mesh(new THREE.CapsuleGeometry(0.06, 0.85, 4, 8), silver, knife);
        kh.rotation.x = Math.PI / 2;
        kh.position.z = 0.31;
        const blade = mesh(new THREE.BoxGeometry(0.16, 0.04, 0.92), silver, knife);
        blade.position.set(-0.04, 0, -0.5);
        const linen = material({ color: 0xd76522, roughness: 0.95 });
        const weave = document.createElement("canvas");
        weave.width = weave.height = 64;
        const painter = weave.getContext("2d");
        if (painter) {
          painter.fillStyle = "#888";
          painter.fillRect(0, 0, 64, 64);
          painter.strokeStyle = "#bbb";
          painter.lineWidth = 1;
          for (let i = 0; i < 64; i += 4) {
            painter.beginPath();
            painter.moveTo(i, 0);
            painter.lineTo(i, 64);
            painter.moveTo(0, i);
            painter.lineTo(64, i);
            painter.stroke();
          }
          const texture = new THREE.CanvasTexture(weave);
          texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
          texture.repeat.set(5, 8);
          textures.push(texture);
          linen.bumpMap = texture;
          linen.bumpScale = 0.025;
        }
        const napkin = mesh(new THREE.BoxGeometry(0.76, 0.055, 1.65), linen, world);
        napkin.position.set(-1.98, 0.07, 0);
        napkin.rotation.y = -0.1;
        const lid = new THREE.Group();
        lid.position.y = 0.18;
        world.add(lid);
        const domeProfile = [new THREE.Vector2(0, 1.1)];
        for (let i = 1; i <= 24; i++) {
          const a = ((i / 24) * Math.PI) / 2;
          domeProfile.push(new THREE.Vector2(Math.sin(a) * 1.2, Math.cos(a) * 1.06 + 0.04));
        }
        mesh(new THREE.LatheGeometry(domeProfile.reverse(), compact ? 48 : 72), silver, lid);
        const lip = mesh(new THREE.TorusGeometry(1.2, 0.045, 10, 64), silver, lid);
        lip.rotation.x = Math.PI / 2;
        lip.position.y = 0.06;
        const knob = mesh(new THREE.TorusGeometry(0.12, 0.04, 10, 24), brass, lid);
        knob.position.y = 1.2;
        const ribbons: import("three").Object3D[] = [];
        for (let k = 0; k < 3; k++) {
          const path = [];
          for (let i = 0; i <= 80; i++) {
            const a = (i / 80) * Math.PI * 2;
            path.push(
              new THREE.Vector3(
                Math.cos(a) * (2.55 + k * 0.25),
                Math.sin(a * 2 + k) * 0.34 + 0.65,
                Math.sin(a) * (1.9 + k * 0.18),
              ),
            );
          }
          const geometry = new THREE.TubeGeometry(
            new THREE.CatmullRomCurve3(path, true),
            100,
            0.012 + k * 0.002,
            5,
            true,
          );
          const surface = new THREE.MeshBasicMaterial({
            color: k === 1 ? 0xffd79c : 0xff9e44,
            transparent: true,
            opacity: 0.45 - k * 0.08,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
          });
          materials.push(surface);
          const ribbon = mesh(geometry, surface, scene);
          ribbon.rotation.z = (k - 1) * 0.3;
          ribbon.rotation.x = (k - 1) * 0.22;
          ribbons.push(ribbon);
        }
        const sparkCount = compact ? 32 : 64,
          positions = new Float32Array(sparkCount * 3);
        const sparkGeometry = new THREE.BufferGeometry();
        sparkGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
        geometries.push(sparkGeometry);
        const sparkMaterial = new THREE.ShaderMaterial({
          vertexShader:
            "void main(){gl_PointSize=4.;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
          fragmentShader: sparkFragment,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        });
        materials.push(sparkMaterial);
        const sparks = new THREE.Points(sparkGeometry, sparkMaterial);
        sparks.frustumCulled = false;
        scene.add(sparks);
        const steam: import("three").Mesh[] = [];
        for (let i = 0; i < 3; i++) {
          const surface = new THREE.MeshBasicMaterial({
            color: 0xffdfb8,
            transparent: true,
            opacity: 0,
            depthWrite: false,
          });
          materials.push(surface);
          const curve = new THREE.CatmullRomCurve3([
            new THREE.Vector3(0, 0, 0),
            new THREE.Vector3(-0.06, 0.2, 0),
            new THREE.Vector3(0.08, 0.45, 0),
            new THREE.Vector3(0, 0.75, 0),
          ]);
          const wisp = mesh(new THREE.TubeGeometry(curve, 16, 0.014, 5, false), surface, world);
          wisp.position.set((i - 1) * 0.25, 0.4, 0.1);
          steam.push(wisp);
        }
        const timeline = gsap.timeline({ paused: true, defaults: { ease: "power3.inOut" } });
        timeline
          .from(plate.scale, { x: 0.65, y: 0.65, z: 0.65, duration: 0.85 }, 0)
          .from(world.position, { y: -0.7, duration: 0.9 }, 0)
          .to(world.rotation, { y: 0.32, z: 0, duration: 3.35, ease: "sine.inOut" }, 0)
          .to(orbit, { x: 2.4, y: 4.6, z: 9.4, duration: 3.35, ease: "sine.inOut" }, 0)
          .from(fork.position, { x: -3.9, y: 1.2, duration: 1.1 }, 0.2)
          .from(fork.rotation, { z: -1.1, duration: 1.1 }, 0.2)
          .from(knife.position, { x: 3.9, y: 1.3, duration: 1.1 }, 0.28)
          .from(knife.rotation, { z: 1.1, duration: 1.1 }, 0.28)
          .from(napkin.scale, { x: 0.1, z: 0.3, duration: 1 }, 0.25)
          .from(lid.position, { y: 2.1, duration: 1.15 }, 0.25)
          .to(lid.position, { y: 1.65, x: 0.25, z: -0.3, duration: 1.1 }, 1.65)
          .to(lid.rotation, { z: -0.18, y: 0.2, duration: 1.1 }, 1.65)
          .to(flash, { value: 0.9, duration: 0.22, ease: "power2.in" }, 1.13)
          .to(night, { value: 1, duration: 0.65 }, 1.28)
          .to(flash, { value: 0, duration: 0.65 }, 1.35);
        food.forEach((piece, i) => {
          const a = (i / food.length) * Math.PI * 2;
          timeline
            .from(
              piece.position,
              {
                x: Math.cos(a) * 2.8,
                y: 1 + Math.sin(i) * 0.4,
                z: Math.sin(a) * 2.3,
                duration: 0.85,
              },
              0.35 + i * 0.025,
            )
            .from(piece.scale, { x: 0.2, y: 0.2, z: 0.2, duration: 0.6 }, 0.35 + i * 0.025);
        });
        steam.forEach((wisp, i) => {
          timeline
            .to(wisp.material, { opacity: 0.55, duration: 0.3 }, 1.95 + i * 0.12)
            .to(wisp.position, { y: 1.1, duration: 1.1, ease: "sine.out" }, 1.95 + i * 0.12)
            .to(wisp.material, { opacity: 0, duration: 0.35 }, 2.8 + i * 0.1);
        });
        let observer: ResizeObserver | undefined,
          lastFrame = 0,
          width = 1,
          height = 1;
        let animationStartedAt: number | null = null;
        let animationBudget = 3.3;
        let hiddenAt: number | null = null;
        const paint = () => {
          if (!alive) return;
          if (animationStartedAt !== null) {
            const progress = Math.min(
              1,
              (performance.now() - animationStartedAt) / (animationBudget * 1000),
            );
            timeline.time(progress * timeline.duration(), false);
          }
          const t = timeline.time();
          uniformTime.value = t;
          const dark = night.value > 0.55 ? "true" : "false";
          if (element.dataset.night !== dark) element.dataset.night = dark;
          const fit = Math.max(1, 1.2 / (width / height));
          camera.position.set(orbit.x * fit, orbit.y * fit, orbit.z * fit);
          camera.lookAt(0, 0.65, 0);
          ribbons.forEach((r, i) => {
            r.rotation.y = t * (0.18 + i * 0.07);
            r.position.y = Math.sin(t * 0.8 + i) * 0.08;
          });
          for (let i = 0; i < sparkCount; i++) {
            const a = (i / sparkCount) * Math.PI * 2 + t * 0.2;
            positions[i * 3] = Math.cos(a) * (2.65 + (i % 5) * 0.13);
            positions[i * 3 + 1] = 0.6 + Math.sin(a * 2 + i) * 0.65;
            positions[i * 3 + 2] = Math.sin(a) * 2.3;
          }
          (sparkGeometry.attributes.position as import("three").BufferAttribute).needsUpdate = true;
          try {
            renderer.render(scene, camera);
            element.dataset.ready = "true";
          } catch {
            stop();
          }
        };
        const render = (stamp: number) => {
          if (stamp - lastFrame < 1000 / 30) return;
          lastFrame = stamp;
          paint();
        };
        const resize = () => {
          if (!alive) return;
          const box = element.getBoundingClientRect();
          width = box.width;
          height = box.height;
          if (!width || !height) return;
          // Bound shader fill cost on large/high-DPI screens; geometry remains antialiased.
          renderer.setPixelRatio(
            Math.min(
              devicePixelRatio || 1,
              compact ? 1.25 : 1,
              Math.sqrt(900_000 / (width * height)),
            ),
          );
          renderer.setSize(width, height);
          camera.aspect = width / height;
          aspect.value = camera.aspect;
          camera.updateProjectionMatrix();
          paint();
        };
        const visibility = () => {
          if (document.hidden) hiddenAt = performance.now();
          else if (hiddenAt !== null) {
            if (animationStartedAt !== null) animationStartedAt += performance.now() - hiddenAt;
            hiddenAt = null;
          }
          if (alive) renderer.setAnimationLoop(document.hidden ? null : render);
        };
        const lost = (event: Event) => {
          event.preventDefault();
          stop();
        };
        cleanup = () => {
          timeline.kill();
          observer?.disconnect();
          document.removeEventListener("visibilitychange", visibility);
          renderer.domElement.removeEventListener("webglcontextlost", lost);
        };
        observer = new ResizeObserver(resize);
        observer.observe(element);
        document.addEventListener("visibilitychange", visibility);
        renderer.domElement.addEventListener("webglcontextlost", lost);
        resize();
        if (alive) {
          // Shader compilation must not push the reveal past the fixed launch budget.
          animationBudget = Math.max(0.3, (3300 - (performance.now() - mountedAt)) / 1000);
          animationStartedAt = performance.now();
          // Drive the paused GSAP timeline from elapsed time; a delayed frame cannot stall the reveal.
          timeline.pause(0);
          visibility();
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
    <div className="qs-orbit-stage" aria-hidden="true">
      <svg className="qs-orbit-fallback" viewBox="0 0 800 600" focusable="false">
        <defs>
          <radialGradient id={`${gradient}-plate`}>
            <stop stopColor="#d8c9b0" />
            <stop offset=".7" stopColor="#fff8e6" />
            <stop offset="1" stopColor="#9e8c70" />
          </radialGradient>
          <linearGradient id={`${gradient}-metal`}>
            <stop stopColor="#6c716e" />
            <stop offset=".3" stopColor="#fff2ce" />
            <stop offset=".6" stopColor="#a18e70" />
            <stop offset="1" stopColor="#d4ae74" />
          </linearGradient>
        </defs>
        <g fill="none" stroke="#d99f55" opacity=".5">
          <ellipse cx="400" cy="345" rx="290" ry="90" transform="rotate(-16 400 345)" />
          <ellipse cx="400" cy="345" rx="280" ry="110" transform="rotate(18 400 345)" />
        </g>
        <ellipse cx="400" cy="370" rx="152" ry="55" fill={`url(#${gradient}-plate)`} />
        <ellipse cx="400" cy="367" rx="143" ry="49" fill="none" stroke="#d3ab6c" />
        <ellipse cx="400" cy="356" rx="34" ry="16" fill="#d6a455" />
        <path d="M386 350Q383 327 402 340Q418 319 414 341Z" fill="#638353" />
        <g transform="rotate(-8 400 250)">
          <path
            d="M280 274C282 205 327 164 400 164S518 205 520 274Q400 305 280 274Z"
            fill={`url(#${gradient}-metal)`}
          />
          <path
            d="M388 164V155C388 140 412 140 412 155V164"
            fill="none"
            stroke="#e4b966"
            strokeWidth="6"
          />
        </g>
      </svg>
      <div ref={host} className="qs-orbit-world qs-launch-scene" />
    </div>
  );
}
