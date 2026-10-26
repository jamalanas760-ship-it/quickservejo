import * as THREE from "three";
import { gsap } from "gsap";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { chromeVertex, chromeFragment, steamVertex, steamFragment } from "./chrome-service-shaders";

/** Bounded, self-contained renderer. All assets are local; no persistent GPU loop. */
export function mountChromeService(host: HTMLDivElement): () => void {
  let renderer: THREE.WebGLRenderer | undefined;
  let composer: EffectComposer | undefined;
  let matcap: THREE.CanvasTexture | undefined;
  let shadowTexture: THREE.CanvasTexture | undefined;
  let bloom: UnrealBloomPass | undefined;
  let economical = false;
  const scene = new THREE.Scene();
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const controller = new AbortController();
  const timeline = gsap.timeline({ paused: true });
  let frame = 0,
    alive = true,
    ready = false,
    lastPaint = 0,
    hiddenAt: number | null = null;
  let began = performance.now();
  const cleanup = () => {
    if (!alive) return;
    alive = false;
    controller.abort();
    cancelAnimationFrame(frame);
    timeline.kill();
    resizeObserver.disconnect();
    document.removeEventListener("visibilitychange", visibility);
    renderer?.domElement.removeEventListener("webglcontextlost", contextLost);
    scene.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        geometries.add(object.geometry);
        (Array.isArray(object.material) ? object.material : [object.material]).forEach((m) =>
          materials.add(m),
        );
      }
    });
    geometries.forEach((g) => g.dispose());
    materials.forEach((m) => m.dispose());
    matcap?.dispose();
    shadowTexture?.dispose();
    composer?.passes.forEach((pass) => pass.dispose());
    composer?.dispose();
    renderer?.dispose();
    renderer?.domElement.remove();
    host.classList.remove("is-rendered");
    host.dataset.motion = "false";
  };
  function contextLost(event: Event) {
    event.preventDefault();
    cleanup();
  }
  function visibility() {
    cancelAnimationFrame(frame);
    if (document.hidden) hiddenAt = performance.now();
    else {
      if (hiddenAt !== null) {
        began += performance.now() - hiddenAt;
        hiddenAt = null;
      }
      if (ready && alive && performance.now() - began < 3400) frame = requestAnimationFrame(paint);
    }
  }
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 80);
  camera.position.set(0, 3.3, 10.8);
  camera.lookAt(0, 0.65, 0);
  const resize = () => {
    if (!renderer) return;
    const width = host.clientWidth,
      height = host.clientHeight;
    if (!width || !height) return;
    // Max ~720k drawing pixels, including bloom targets, irrespective of device DPR.
    const ratio = Math.min(
      devicePixelRatio || 1,
      1.5,
      Math.sqrt((economical ? 240000 : 600000) / (width * height)),
    );
    renderer.setPixelRatio(ratio);
    renderer.setSize(width, height);
    composer?.setPixelRatio(ratio);
    composer?.setSize(width, height);
    camera.aspect = width / height;
    camera.position.z = width < 600 && height > width ? 15.8 : 10.8;
    camera.lookAt(0, 0.65, 0);
    camera.updateProjectionMatrix();
    if (ready) composer?.render();
  };
  const resizeObserver = new ResizeObserver(resize);
  const root = new THREE.Group();
  const lid = new THREE.Group();
  const tray = new THREE.Group();
  const food = new THREE.Group();
  const steamMaterials: THREE.ShaderMaterial[] = [];
  const state = { lift: 0, turn: -0.65, press: 0, tray: 0.78, reveal: 0, steam: 0, arrival: -1.6 };
  let chrome: THREE.ShaderMaterial;
  function paint(stamp: number) {
    if (!alive || !ready || !composer) return;
    if (stamp - lastPaint < 1000 / 30) {
      frame = requestAnimationFrame(paint);
      return;
    }
    lastPaint = stamp;
    const elapsed = Math.min(3400, Math.max(0, performance.now() - began));
    timeline.seek(elapsed / 1000, true);
    root.rotation.y = state.turn;
    root.rotation.z = Math.sin(elapsed * 0.001) * 0.028;
    root.position.y = state.arrival + Math.sin(elapsed * 0.002) * 0.055;
    lid.position.set(0.3 * state.lift, 0.08 + state.lift - state.press, 0);
    lid.rotation.z = -0.16 * state.lift;
    lid.scale.set(1 + state.reveal * 0.12, 1 - state.press * 0.15, 1 + state.reveal * 0.12);
    tray.scale.set(state.tray, 1, state.tray);
    food.scale.setScalar(Math.max(0.001, state.reveal));
    chrome.uniforms.uTime.value = elapsed / 1000;
    steamMaterials.forEach((m) => {
      m.uniforms.uTime.value = elapsed / 1000;
      m.uniforms.uOpacity.value = state.steam;
    });
    try {
      const renderStarted = performance.now();
      composer.render();
      if (!economical && performance.now() - renderStarted > 90) {
        economical = true;
        if (bloom) bloom.enabled = false;
        host.dataset.quality = "economical";
        resize();
      }
      host.classList.add("is-rendered");
      host.dataset.motion = "true";
      host.dataset.phase = elapsed < 1500 ? "bell" : "serving";
    } catch {
      cleanup();
      return;
    }
    if (elapsed < 3400) frame = requestAnimationFrame(paint);
  }
  try {
    renderer = new THREE.WebGLRenderer({
      alpha: false,
      antialias: true,
      powerPreference: "low-power",
    });
    renderer.setClearColor(new THREE.Color(10, 10, 10), 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.domElement.setAttribute("aria-hidden", "true");
    renderer.domElement.addEventListener("webglcontextlost", contextLost);
    host.appendChild(renderer.domElement);
    // Original studio MatCap: broad softbox reflections, black flags and a white strip.
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 512;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("MatCap canvas unavailable");
    ctx.fillStyle = "#151619";
    ctx.fillRect(0, 0, 512, 512);
    const base = ctx.createRadialGradient(245, 200, 35, 260, 255, 360);
    base.addColorStop(0, "#ededed");
    base.addColorStop(0.38, "#444548");
    base.addColorStop(0.65, "#111214");
    base.addColorStop(0.87, "#d9d9d7");
    base.addColorStop(1, "#55565a");
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, 512, 512);
    ctx.filter = "blur(10px)";
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(100, 75, 84, 210);
    ctx.fillRect(280, 80, 145, 74);
    ctx.fillStyle = "#08090c";
    ctx.fillRect(215, 180, 45, 240);
    ctx.filter = "blur(3px)";
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(365, 205, 14, 190);
    ctx.filter = "none";
    matcap = new THREE.CanvasTexture(canvas);
    matcap.colorSpace = THREE.SRGBColorSpace;
    chrome = new THREE.ShaderMaterial({
      uniforms: { uMatcap: { value: matcap }, uTime: { value: 0 } },
      vertexShader: chromeVertex,
      fragmentShader: chromeFragment,
      side: THREE.DoubleSide,
    });
    materials.add(chrome);
    const porcelain = new THREE.MeshStandardMaterial({
      color: 0xf4f0e8,
      roughness: 0.23,
      metalness: 0.06,
    });
    const gold = new THREE.MeshStandardMaterial({
      color: 0xc8822e,
      metalness: 0.6,
      roughness: 0.24,
    });
    const roasted = new THREE.MeshStandardMaterial({ color: 0xa84e22, roughness: 0.48 });
    const green = new THREE.MeshStandardMaterial({
      color: 0x36693b,
      roughness: 0.48,
      side: THREE.DoubleSide,
    });
    [porcelain, gold, roasted, green].forEach((m) => materials.add(m));
    function mesh(
      geometry: THREE.BufferGeometry,
      material: THREE.Material,
      parent: THREE.Object3D,
      x = 0,
      y = 0,
      z = 0,
    ) {
      geometries.add(geometry);
      const object = new THREE.Mesh(geometry, material);
      object.position.set(x, y, z);
      parent.add(object);
      return object;
    }
    scene.add(new THREE.HemisphereLight(0xffffff, 0x74706b, 3));
    const key = new THREE.DirectionalLight(0xffffff, 4);
    key.position.set(-3, 6, 4);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xffe7d0, 2);
    fill.position.set(4, 3, -2);
    scene.add(fill);
    scene.add(root);
    root.add(tray, lid, food);
    const shadowCanvas = document.createElement("canvas");
    shadowCanvas.width = shadowCanvas.height = 128;
    const shadowContext = shadowCanvas.getContext("2d");
    if (shadowContext) {
      const gradient = shadowContext.createRadialGradient(64, 64, 3, 64, 64, 64);
      gradient.addColorStop(0, "rgba(25,22,18,.23)");
      gradient.addColorStop(0.5, "rgba(25,22,18,.10)");
      gradient.addColorStop(1, "rgba(25,22,18,0)");
      shadowContext.fillStyle = gradient;
      shadowContext.fillRect(0, 0, 128, 128);
      shadowTexture = new THREE.CanvasTexture(shadowCanvas);
      const shadowMaterial = new THREE.MeshBasicMaterial({
        map: shadowTexture,
        transparent: true,
        depthWrite: false,
      });
      materials.add(shadowMaterial);
      const shadow = mesh(new THREE.PlaneGeometry(4.5, 3), shadowMaterial, scene, 0, -0.58);
      shadow.rotation.x = -Math.PI / 2;
    }
    mesh(new THREE.CylinderGeometry(1.58, 1.52, 0.105, 80), chrome, tray, 0, -0.045);
    const lip = mesh(new THREE.TorusGeometry(1.52, 0.045, 12, 80), chrome, tray, 0, 0.02);
    lip.rotation.x = Math.PI / 2;
    mesh(new THREE.CylinderGeometry(1.22, 1.14, 0.08, 64), porcelain, tray, 0, 0.055);
    mesh(new THREE.CylinderGeometry(0.16, 0.22, 0.14, 32), chrome, lid, 0, 1.17);
    const knob = mesh(new THREE.SphereGeometry(0.24, 32, 20), chrome, lid, 0, 1.31);
    knob.scale.y = 0.56;
    for (let i = 0; i < 3; i++) {
      const piece = mesh(
        new THREE.SphereGeometry(0.34, 32, 20),
        roasted,
        food,
        (i - 1) * 0.3,
        0.22 + i * 0.05,
        0.05,
      );
      piece.scale.set(1.1, 0.45, 0.7);
      piece.rotation.y = -0.4 + i * 0.3;
    }
    const sauce = mesh(
      new THREE.TorusGeometry(0.65, 0.025, 8, 64, Math.PI * 1.6),
      gold,
      food,
      0,
      0.115,
    );
    sauce.rotation.x = Math.PI / 2;
    for (let i = 0; i < 5; i++) {
      const leaf = mesh(
        new THREE.SphereGeometry(0.18, 16, 10),
        green,
        food,
        -0.25 + i * 0.12,
        0.38 + (i % 2) * 0.04,
        -0.15,
      );
      leaf.scale.set(0.55, 0.11, 1.4);
      leaf.rotation.set(0.3, i * 1.6, -0.3);
    }
    for (let i = 0; i < 3; i++) {
      const material = new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 }, uOpacity: { value: 0 } },
        vertexShader: steamVertex,
        fragmentShader: steamFragment,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      materials.add(material);
      steamMaterials.push(material);
      const ribbon = mesh(
        new THREE.PlaneGeometry(0.65, 1.3),
        material,
        root,
        (i - 1) * 0.32,
        1.05,
        0.15 - i * 0.1,
      );
      ribbon.rotation.y = 0.2 * i;
    }
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.14, 0.25, 0.94);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
    timeline
      .to(state, { arrival: 0, duration: 0.85, ease: "power3.out" }, 0)
      .to(state, { turn: 0.35, duration: 1.35, ease: "power2.inOut" }, 0)
      .to(state, { press: 0.14, duration: 0.16, ease: "power2.in" }, 1.03)
      .to(state, { press: 0, duration: 0.45, ease: "elastic.out(1,.5)" }, 1.19)
      .to(
        state,
        { lift: 1.45, reveal: 1, tray: 1, turn: -0.38, duration: 1.2, ease: "power3.inOut" },
        1.5,
      )
      .to(state, { steam: 0.42, duration: 0.6 }, 2.25)
      .to(state, { turn: -0.1, duration: 0.7, ease: "sine.inOut" }, 2.7);
    resize();
    resizeObserver.observe(host);
    // Fetch is abortable; glTF has an embedded buffer and no external texture dependency.
    void fetch("/loading/chrome-service/cloche.gltf", { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("Cloche unavailable");
        return response.text();
      })
      .then((text) => new GLTFLoader().parseAsync(text, ""))
      .then((gltf) => {
        if (!alive) {
          gltf.scene.traverse((object) => {
            if (object instanceof THREE.Mesh) {
              object.geometry.dispose();
              (Array.isArray(object.material) ? object.material : [object.material]).forEach((m) =>
                m.dispose(),
              );
            }
          });
          return;
        }
        gltf.scene.traverse((object) => {
          if (object instanceof THREE.Mesh) {
            (Array.isArray(object.material) ? object.material : [object.material]).forEach((m) =>
              m.dispose(),
            );
            object.material = chrome;
          }
        });
        lid.add(gltf.scene);
        ready = true;
        began = performance.now();
        document.addEventListener("visibilitychange", visibility);
        visibility();
      })
      .catch(cleanup);
  } catch {
    cleanup();
  }
  return cleanup;
}
