import { useEffect, useRef, useState } from "react";
import * as T from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { createFurnitureCatalog, type FurnitureMaterial } from "./floor-3d-models";
import {
  normalizeFloorElement,
  moveFloorElement,
  type FloorElement,
} from "@/lib/floor-plan-elements";
import { floorPointToLayout, moveTableInFloor, type FloorTableLayout } from "@/lib/floor-3d-layout";

export type Floor3DTable = {
  id: string;
  number: string;
  shape: "round" | "square" | "rectangle";
  material: FurnitureMaterial;
  capacity: number;
  status: string;
  layout: FloorTableLayout;
};
type Selection = { kind: "table" | "element" | "zone" | "entrance"; id: string } | null;
type Props = {
  tables: Floor3DTable[];
  elements: FloorElement[];
  zones: { id: string; x: number; y: number; width: number; height: number; color: string }[];
  entrances: { id: string; x: number; y: number; rotation: number; label: string }[];
  size: { width: number; height: number };
  zoom: number;
  grid: boolean;
  editable: boolean;
  busy: boolean;
  selected: Selection;
  ar: boolean;
  backgroundUrl: string | null;
  onSelect: (selection: Selection) => void;
  onTablePreview: (id: string, layout: FloorTableLayout) => void;
  onTableCommit: (id: string, layout: FloorTableLayout) => void;
  onElementPreview: (element: FloorElement) => void;
  onElementCommit: (next: FloorElement, previous: FloorElement) => void;
  onFallback: () => void;
};
const statusColors: Record<string, string> = {
  free: "#10b981",
  active: "#e85d2a",
  reserved: "#3b82f6",
  cleaning: "#8b5cf6",
  out_of_service: "#64748b",
};

/** On-demand rendering: no idle animation loop and no remount on foreground. */
export default function FloorPlan3D(props: Props) {
  const host = useRef<HTMLDivElement>(null),
    latest = useRef(props);
  latest.current = props;
  const runtime = useRef<{
    update: () => void;
    rotate: (delta: number) => void;
    reset: () => void;
    beginDrag: (event: PointerEvent, selection: NonNullable<Selection>) => void;
  } | null>(null);
  const labels = useRef(new Map<string, HTMLButtonElement>());
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const container = host.current;
    if (!container) return;
    let renderer: T.WebGLRenderer;
    try {
      renderer = new T.WebGLRenderer({
        antialias: true,
        alpha: false,
        powerPreference: "low-power",
      });
    } catch {
      latest.current.onFallback();
      return;
    }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFSoftShadowMap;
    renderer.outputColorSpace = T.SRGBColorSpace;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.35;
    const canvas = renderer.domElement;
    canvas.className = "qs-floor-3d-render";
    canvas.setAttribute("aria-hidden", "true");
    container.prepend(canvas);
    const scene = new T.Scene(),
      catalog = createFurnitureCatalog();
    const width = props.size.width / 100,
      depth = props.size.height / 100;
    const camera = new T.OrthographicCamera(-8, 8, 6, -6, 0.1, 100);
    let angle = Math.PI / 4;
    camera.position.set(12, 12, 12);
    camera.lookAt(0, 0.3, 0);
    const controls = new OrbitControls(camera, canvas);
    controls.target.set(0, 0.25, 0);
    controls.enableRotate = false;
    controls.enableDamping = false;
    controls.enableZoom = true;
    controls.minZoom = 0.55;
    controls.maxZoom = 3;
    controls.mouseButtons = { LEFT: T.MOUSE.PAN, MIDDLE: T.MOUSE.DOLLY, RIGHT: T.MOUSE.PAN };
    controls.touches = { ONE: T.TOUCH.PAN, TWO: T.TOUCH.DOLLY_PAN };
    controls.update();
    controls.saveState();
    const light = new T.DirectionalLight("#fff6df", 3.2);
    light.position.set(-4, 10, 5);
    light.castShadow = true;
    light.shadow.mapSize.set(
      container.clientWidth < 600 ? 512 : 1024,
      container.clientWidth < 600 ? 512 : 1024,
    );
    light.shadow.camera.left = -16;
    light.shadow.camera.right = 16;
    light.shadow.camera.top = 16;
    light.shadow.camera.bottom = -16;
    light.shadow.normalBias = 0.035;
    light.shadow.bias = -0.0003;
    scene.add(light, new T.HemisphereLight("#ffffff", "#b3a48a", 2.1));
    const slab = new T.Group();
    catalog.box(slab, width, 0.16, depth, catalog.mat("#c5b79f"), 0, -0.09);
    catalog.tileMap.repeat.set(width * 1.3, depth * 1.3);
    catalog.box(
      slab,
      width,
      0.025,
      depth,
      catalog.mat("#ffffff", { map: catalog.tileMap }),
      0,
      0.004,
      0,
      0.005,
    );
    scene.add(slab);
    let floorTexture: T.Texture | null = null,
      disposed = false;
    if (props.backgroundUrl) {
      new T.TextureLoader().load(
        props.backgroundUrl,
        (map) => {
          if (disposed) {
            map.dispose();
            return;
          }
          floorTexture = map;
          map.colorSpace = T.SRGBColorSpace;
          const material = (slab.children[1] as T.Mesh).material as T.MeshStandardMaterial;
          material.map = map;
          material.needsUpdate = true;
          requestRender();
        },
        undefined,
        () => {
          /* Keep the tiled floor if the uploaded image is unavailable. */
        },
      );
    }
    const grid = new T.GridHelper(
      Math.max(width, depth),
      Math.round(Math.max(width, depth) * 2),
      "#bdb3a3",
      "#d3cabe",
    );
    grid.position.y = 0.025;
    scene.add(grid);
    const models = new T.Group();
    scene.add(models);
    const groups = new Map<string, T.Group>();
    let frame = 0,
      contextLost = false,
      lastZoom = NaN;
    const zoneMaterials = new Map<string, T.MeshStandardMaterial>();
    function projectLabels() {
      labels.current.forEach((el, id) => {
        const group = groups.get(`table:${id}`);
        if (!group) {
          el.style.visibility = "hidden";
          return;
        }
        const p = new T.Vector3(group.position.x, 1.1 * group.scale.y, group.position.z).project(
          camera,
        );
        el.style.left = `${(p.x / 2 + 0.5) * container!.clientWidth}px`;
        el.style.top = `${(-p.y / 2 + 0.5) * container!.clientHeight}px`;
        el.style.visibility = Math.abs(p.x) > 1 || Math.abs(p.y) > 1 ? "hidden" : "visible";
      });
    }
    function render() {
      frame = 0;
      if (disposed || contextLost || document.visibilityState !== "visible") return;
      renderer.render(scene, camera);
      projectLabels();
    }
    function requestRender() {
      if (!disposed && !contextLost && !frame && document.visibilityState === "visible")
        frame = requestAnimationFrame(render);
    }
    function fit() {
      const w = container!.clientWidth,
        h = container!.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      const aspect = w / h;
      // Fit the actual orthographic footprint instead of shrinking phone views.
      camera.updateMatrixWorld();
      let extentX = 0,
        extentY = 0;
      for (const x of [-width / 2, width / 2])
        for (const z of [-depth / 2, depth / 2])
          for (const y of [0, 1.9]) {
            const v = new T.Vector3(x, y, z).applyMatrix4(camera.matrixWorldInverse);
            extentX = Math.max(extentX, Math.abs(v.x));
            extentY = Math.max(extentY, Math.abs(v.y));
          }
      const halfHeight = Math.max(extentY, extentX / aspect) * 1.07;
      camera.left = -halfHeight * aspect;
      camera.right = halfHeight * aspect;
      camera.top = halfHeight;
      camera.bottom = -halfHeight;
      camera.updateProjectionMatrix();
      requestRender();
    }
    const selectionMaterial = catalog.mat("#e85d2a", {
      emissive: "#e85d2a",
      emissiveIntensity: 0.4,
    });
    function addModel(
      group: T.Group,
      kind: NonNullable<Selection>["kind"],
      id: string,
      x: number,
      y: number,
      rotation: number,
    ) {
      group.position.set((x / 100 - 0.5) * width, 0.025, (y / 100 - 0.5) * depth);
      group.rotation.y = (-rotation * Math.PI) / 180;
      group.userData = { kind, id };
      if (latest.current.selected?.id === id && latest.current.selected.kind === kind) {
        const bounds = new T.Box3().setFromObject(group),
          box = bounds.getSize(new T.Vector3());
        const outline = new T.Mesh(
          new T.RingGeometry(
            Math.max(box.x, box.z) * 0.5 + 0.08,
            Math.max(box.x, box.z) * 0.5 + 0.11,
            48,
          ),
          selectionMaterial,
        );
        outline.geometry.rotateX(-Math.PI / 2);
        outline.position.set(group.position.x, 0.032, group.position.z);
        outline.userData.selectionRing = true;
        models.add(outline);
      }
      models.add(group);
      groups.set(`${kind}:${id}`, group);
    }
    function zoneMaterial(color: string) {
      if (!zoneMaterials.has(color))
        zoneMaterials.set(color, catalog.mat(color, { transparent: true, opacity: 0.055 }));
      return zoneMaterials.get(color)!;
    }
    function update() {
      // Geometries/materials are shared; only instance groups and selection rings change.
      for (const child of models.children)
        if (child.userData.selectionRing) (child as T.Mesh).geometry.dispose();
      models.clear();
      groups.clear();
      const p = latest.current;
      for (const zone of p.zones) {
        const g = new T.Group();
        const m = catalog.box(
          g,
          Math.max(0.1, (zone.width / 100) * width),
          0.006,
          Math.max(0.1, (zone.height / 100) * depth),
          zoneMaterial(zone.color),
          0,
          0.03,
          0,
          0.004,
        );
        m.castShadow = false;
        addModel(g, "zone", zone.id, zone.x + zone.width / 2, zone.y + zone.height / 2, 0);
      }
      for (const e of p.elements) {
        const g = catalog.fitFootprint(
          catalog.element(e.type),
          (e.width / 100) * width,
          (e.height / 100) * depth,
        );
        addModel(g, "element", e.id, e.x, e.y, e.rotation);
      }
      for (const e of p.entrances) {
        const g = catalog.element("door");
        g.scale.setScalar(0.7);
        addModel(g, "entrance", e.id, e.x, e.y, e.rotation);
      }
      for (const table of p.tables) {
        const g = catalog.table(table.shape, table.material, table.capacity);
        g.scale.setScalar(table.layout.scale * 0.8);
        addModel(
          g,
          "table",
          table.id,
          table.layout.x / 10,
          table.layout.y / 7,
          table.layout.rotation,
        );
      }
      grid.visible = p.grid;
      if (lastZoom !== p.zoom) {
        camera.zoom = p.zoom;
        lastZoom = p.zoom;
        camera.updateProjectionMatrix();
      }
      requestRender();
    }
    const ray = new T.Raycaster(),
      plane = new T.Plane(new T.Vector3(0, 1, 0), 0);
    const point = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      ray.setFromCamera(
        new T.Vector2(
          ((e.clientX - rect.left) / rect.width) * 2 - 1,
          (-(e.clientY - rect.top) / rect.height) * 2 + 1,
        ),
        camera,
      );
      return ray.ray.intersectPlane(plane, new T.Vector3());
    };
    let drag: {
      pointer: number;
      kind: "table" | "element";
      id: string;
      point: T.Vector3;
      table?: Floor3DTable | undefined;
      element?: FloorElement | undefined;
      nextTable?: FloorTableLayout;
      nextElement?: FloorElement;
    } | null = null;
    function down(e: PointerEvent, forced?: NonNullable<Selection>) {
      if (e.button !== 0) return;
      const start = point(e);
      if (!start) return;
      const hits = ray.intersectObjects(models.children, true);
      let hit: T.Object3D | undefined = hits.find((h) => !h.object.userData.selectionRing)?.object;
      while (hit && !hit.userData.kind) hit = hit.parent ?? undefined;
      const p = latest.current;
      const target = forced ?? (hit?.userData as NonNullable<Selection> | undefined);
      if (!target?.kind) {
        p.onSelect(null);
        return;
      }
      const { kind, id } = target;
      p.onSelect({ kind, id });
      if (!p.editable || p.busy || (kind !== "table" && kind !== "element")) return;
      controls.enabled = false;
      e.preventDefault();
      e.stopImmediatePropagation();
      canvas.setPointerCapture(e.pointerId);
      drag = {
        pointer: e.pointerId,
        kind,
        id,
        point: start.clone(),
        table: p.tables.find((t) => t.id === id),
        element: p.elements.find((t) => t.id === id),
      };
    }
    function move(e: PointerEvent) {
      if (!drag || drag.pointer !== e.pointerId) return;
      const current = point(e);
      if (!current) return;
      const from = floorPointToLayout(drag.point.x, drag.point.z, width, depth);
      const to = floorPointToLayout(current.x, current.z, width, depth);
      const dx = to.x - from.x,
        dy = to.y - from.y;
      if (drag.table) {
        drag.nextTable = moveTableInFloor(drag.table.layout, dx, dy, latest.current.grid);
        latest.current.onTablePreview(drag.id, drag.nextTable);
      } else if (drag.element) {
        drag.nextElement = moveFloorElement(drag.element, dx / 10, dy / 7, latest.current.grid);
        latest.current.onElementPreview(drag.nextElement);
      }
    }
    function end(e: PointerEvent) {
      if (!drag || drag.pointer !== e.pointerId) return;
      const d = drag;
      drag = null;
      controls.enabled = true;
      if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
      if (d.table && d.nextTable) {
        if (e.type === "pointercancel") latest.current.onTablePreview(d.id, d.table.layout);
        else latest.current.onTableCommit(d.id, d.nextTable);
      } else if (d.element && d.nextElement) {
        if (e.type === "pointercancel") latest.current.onElementPreview(d.element);
        else latest.current.onElementCommit(d.nextElement, d.element);
      }
    }
    function theme() {
      scene.background = new T.Color(
        document.documentElement.classList.contains("dark") ? "#202826" : "#f1eee7",
      );
      requestRender();
    }
    function visibility() {
      if (document.visibilityState === "hidden") {
        cancelAnimationFrame(frame);
        frame = 0;
      } else {
        renderer.resetState();
        requestRender();
      }
    }
    function lost(event: Event) {
      event.preventDefault();
      contextLost = true;
      cancelAnimationFrame(frame);
      // Preserve all data and immediately display the editable 2D canvas.
      latest.current.onFallback();
    }
    canvas.addEventListener("pointerdown", down, true);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", end);
    canvas.addEventListener("pointercancel", end);
    canvas.addEventListener("webglcontextlost", lost);
    controls.addEventListener("change", requestRender);
    document.addEventListener("visibilitychange", visibility);
    const observer = new ResizeObserver(fit);
    observer.observe(container);
    const themeObserver = new MutationObserver(theme);
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    runtime.current = {
      update,
      beginDrag: down,
      rotate: (delta) => {
        angle += delta;
        camera.position.set(Math.sin(angle) * 17, 12, Math.cos(angle) * 17);
        camera.lookAt(controls.target);
        fit();
      },
      reset: () => {
        controls.reset();
        angle = Math.PI / 4;
        lastZoom = NaN;
        fit();
        update();
      },
    };
    fit();
    theme();
    update();
    setReady(true);
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      runtime.current = null;
      observer.disconnect();
      themeObserver.disconnect();
      document.removeEventListener("visibilitychange", visibility);
      canvas.removeEventListener("pointerdown", down, true);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", end);
      canvas.removeEventListener("pointercancel", end);
      canvas.removeEventListener("webglcontextlost", lost);
      controls.dispose();
      for (const child of models.children)
        if (child.userData.selectionRing) (child as T.Mesh).geometry.dispose();
      grid.geometry.dispose();
      (grid.material as T.Material).dispose();
      floorTexture?.dispose();
      catalog.dispose();
      light.shadow.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    };
  }, [props.size.width, props.size.height, props.backgroundUrl]);
  useEffect(() => {
    runtime.current?.update();
  }, [
    props.tables,
    props.elements,
    props.zones,
    props.entrances,
    props.selected,
    props.zoom,
    props.grid,
  ]);
  function key(event: React.KeyboardEvent) {
    if (
      !props.editable ||
      props.busy ||
      !props.selected ||
      !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)
    )
      return;
    event.preventDefault();
    const dx = event.key === "ArrowLeft" ? -10 : event.key === "ArrowRight" ? 10 : 0;
    const dy = event.key === "ArrowUp" ? -10 : event.key === "ArrowDown" ? 10 : 0;
    const table = props.tables.find((t) => t.id === props.selected?.id);
    if (table) {
      const layout = moveTableInFloor(table.layout, dx, dy, props.grid);
      props.onTablePreview(table.id, layout);
      props.onTableCommit(table.id, layout);
    }
    const element = props.elements.find((e) => e.id === props.selected?.id);
    if (element) {
      const next = moveFloorElement(element, dx / 10, dy / 7, props.grid);
      props.onElementPreview(next);
      props.onElementCommit(next, element);
    }
  }
  function adjustSelected(action: "rotate" | "smaller" | "larger") {
    if (!props.editable || props.busy || !props.selected) return;
    const table = props.tables.find((t) => t.id === props.selected?.id);
    if (table) {
      const next = {
        ...table.layout,
        rotation:
          action === "rotate"
            ? table.layout.rotation >= 180
              ? -180
              : table.layout.rotation + 15
            : table.layout.rotation,
        scale:
          action === "rotate"
            ? table.layout.scale
            : Math.min(
                1.6,
                Math.max(0.65, table.layout.scale + (action === "larger" ? 0.1 : -0.1)),
              ),
      };
      props.onTablePreview(table.id, next);
      props.onTableCommit(table.id, next);
    }
    const element = props.elements.find((e) => e.id === props.selected?.id);
    if (element) {
      const factor = action === "larger" ? 1.1 : 0.9;
      const next = normalizeFloorElement({
        ...element,
        rotation:
          action === "rotate"
            ? element.rotation >= 180
              ? -180
              : element.rotation + 15
            : element.rotation,
        width: action === "rotate" ? element.width : element.width * factor,
        height: action === "rotate" ? element.height : element.height * factor,
      });
      props.onElementPreview(next);
      props.onElementCommit(next, element);
    }
  }
  return (
    <div
      className="qs-floor-3d"
      ref={host}
      onKeyDown={key}
      aria-label={props.ar ? "مخطط مطعم ثلاثي الأبعاد" : "3D restaurant floor plan"}
    >
      {!ready && (
        <div className="qs-floor-3d-loading" role="status">
          {props.ar ? "جارٍ تجهيز المخطط…" : "Preparing your floor plan…"}
        </div>
      )}
      <div className="qs-floor-3d-camera" aria-label={props.ar ? "أدوات العرض" : "View controls"}>
        <button
          type="button"
          onClick={() => runtime.current?.rotate(-Math.PI / 4)}
          aria-label={props.ar ? "تدوير العرض لليسار" : "Rotate view left"}
        >
          ↶
        </button>
        <button
          type="button"
          onClick={() => runtime.current?.rotate(Math.PI / 4)}
          aria-label={props.ar ? "تدوير العرض لليمين" : "Rotate view right"}
        >
          ↷
        </button>
        <button type="button" onClick={() => runtime.current?.reset()}>
          {props.ar ? "ملاءمة" : "Reset view"}
        </button>
      </div>
      {props.tables.map((table) => (
        <button
          key={table.id}
          type="button"
          className={`qs-floor-3d-label${props.selected?.id === table.id ? " is-selected" : ""}`}
          ref={(el) => {
            if (el) labels.current.set(table.id, el);
            else labels.current.delete(table.id);
          }}
          onPointerDown={(event) => {
            if (!props.editable || props.busy) return;
            event.currentTarget.focus();
            runtime.current?.beginDrag(event.nativeEvent, { kind: "table", id: table.id });
          }}
          onClick={() => props.onSelect({ kind: "table", id: table.id })}
          aria-label={`${props.ar ? "طاولة" : "Table"} ${table.number}`}
          aria-pressed={props.selected?.id === table.id}
        >
          <span className="qs-floor-3d-label-inner">
            <i style={{ background: statusColors[table.status] ?? "#64748b" }} />
            {table.number}
          </span>
        </button>
      ))}
      {props.editable &&
        (props.selected?.kind === "table" || props.selected?.kind === "element") && (
          <div className="qs-floor-3d-object-tools">
            <button
              type="button"
              disabled={props.busy}
              onClick={() => adjustSelected("rotate")}
              aria-label={props.ar ? "تدوير العنصر المحدد" : "Rotate selected furniture"}
            >
              ↻
            </button>
            <button
              type="button"
              disabled={props.busy}
              onClick={() => adjustSelected("smaller")}
              aria-label={props.ar ? "تصغير العنصر المحدد" : "Make selected furniture smaller"}
            >
              −
            </button>
            <button
              type="button"
              disabled={props.busy}
              onClick={() => adjustSelected("larger")}
              aria-label={props.ar ? "تكبير العنصر المحدد" : "Make selected furniture larger"}
            >
              +
            </button>
          </div>
        )}
      <p className="qs-floor-3d-hint">
        {props.editable
          ? props.ar
            ? "اسحب العناصر للتحريك · إصبعان للتكبير والتحريك"
            : "Drag furniture to move · Two fingers to zoom and pan"
          : props.ar
            ? "اضغط على طاولة · اسحب لتحريك العرض"
            : "Tap a table · Drag to pan"}
      </p>
    </div>
  );
}
