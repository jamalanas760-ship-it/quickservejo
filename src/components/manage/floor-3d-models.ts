import { floorSeats } from "@/lib/floor-seating";
import * as T from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import type { FloorElementType } from "@/lib/floor-plan-elements";

export type FurnitureMaterial = "wood" | "marble" | "glass" | "aluminum" | "neutral";

/** Shared, lightweight PBR furniture. All resources belong to one scene. */
export function createFurnitureCatalog() {
  const resources = new Set<T.BufferGeometry | T.Material | T.Texture>();
  const keep = <V extends T.BufferGeometry | T.Material | T.Texture>(resource: V) => {
    resources.add(resource);
    return resource;
  };
  function texture(kind: "wood" | "marble" | "tile") {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 256;
    const c = canvas.getContext("2d")!;
    c.fillStyle = kind === "wood" ? "#a17b54" : kind === "marble" ? "#eeeae1" : "#e8e1d4";
    c.fillRect(0, 0, 256, 256);
    if (kind === "wood") {
      for (let i = 0; i < 110; i++) {
        c.strokeStyle = `rgba(61,35,15,${0.04 + (i % 5) * 0.015})`;
        c.lineWidth = 1 + (i % 3);
        c.beginPath();
        for (let x = 0; x <= 256; x += 8) {
          const y = i * 2.5 + Math.sin(x / 36 + i) * 1.7;
          if (x === 0) c.moveTo(x, y);
          else c.lineTo(x, y);
        }
        c.stroke();
      }
    } else if (kind === "marble") {
      for (let i = 0; i < 8; i++) {
        c.strokeStyle = "rgba(112,110,102,.16)";
        c.lineWidth = 0.5 + (i % 2);
        c.beginPath();
        c.moveTo(i * 40 - 50, 0);
        c.bezierCurveTo(i * 30 + 30, 90, i * 36 - 40, 150, i * 35 + 70, 256);
        c.stroke();
      }
    } else {
      c.strokeStyle = "#cfc6b7";
      c.lineWidth = 2;
      c.strokeRect(1, 1, 254, 254);
      for (let i = 0; i < 150; i++) {
        c.fillStyle = "rgba(115,97,78,.025)";
        c.fillRect((i * 71) % 256, (i * 43) % 256, 2, 2);
      }
    }
    const map = keep(new T.CanvasTexture(canvas));
    map.colorSpace = T.SRGBColorSpace;
    map.wrapS = map.wrapT = T.RepeatWrapping;
    return map;
  }
  const woodMap = texture("wood"),
    marbleMap = texture("marble"),
    tileMap = texture("tile");
  const mat = (color: T.ColorRepresentation, extra: T.MeshStandardMaterialParameters = {}) =>
    keep(new T.MeshStandardMaterial({ color, roughness: 0.65, ...extra }));
  const walnut = mat("#b59978", { map: woodMap, roughness: 0.48 });
  const darkWood = mat("#70543b", { map: woodMap });
  const marble = mat("#ffffff", { map: marbleMap, roughness: 0.25 });
  const glass = mat("#bedbdb", {
    transparent: true,
    opacity: 0.62,
    roughness: 0.15,
    metalness: 0.16,
  });
  const metal = mat("#bbc2c4", { roughness: 0.3, metalness: 0.7 });
  const brass = mat("#af8960", { metalness: 0.6, roughness: 0.4 });
  const olive = mat("#687052", { roughness: 0.95 });
  const cushion = mat("#b9ad91", { roughness: 0.97 });
  const beige = mat("#e0d5c2");
  const cream = mat("#eee7db");
  const white = mat("#f6f5ef", { roughness: 0.25 });
  const black = mat("#283030");
  const leaf = mat("#4b6234", { roughness: 1 });
  const leafLight = mat("#708849", { roughness: 1 });
  const soil = mat("#4c3c29");
  const tops = { wood: walnut, marble, glass, aluminum: metal, neutral: beige };
  const geometries = new Map<string, T.BufferGeometry>();
  const geometry = (key: string, make: () => T.BufferGeometry) => {
    if (!geometries.has(key)) geometries.set(key, keep(make()));
    return geometries.get(key)!;
  };
  function mesh(
    group: T.Group,
    shape: T.BufferGeometry,
    material: T.Material,
    x: number,
    y: number,
    z: number,
  ) {
    const m = new T.Mesh(shape, material);
    m.position.set(x, y, z);
    m.castShadow = m.receiveShadow = true;
    group.add(m);
    return m;
  }
  function box(
    g: T.Group,
    w: number,
    h: number,
    d: number,
    material: T.Material,
    x = 0,
    y = h / 2,
    z = 0,
    radius = 0.025,
  ) {
    return mesh(
      g,
      geometry(
        `b:${w}:${h}:${d}:${radius}`,
        () => new RoundedBoxGeometry(w, h, d, 2, Math.min(radius, w / 3, h / 3, d / 3)),
      ),
      material,
      x,
      y,
      z,
    );
  }
  function cylinder(
    g: T.Group,
    r: number,
    h: number,
    material: T.Material,
    x = 0,
    y = h / 2,
    z = 0,
    rBottom = r,
  ) {
    return mesh(
      g,
      geometry(`c:${r}:${h}:${rBottom}`, () => new T.CylinderGeometry(r, rBottom, h, 24)),
      material,
      x,
      y,
      z,
    );
  }
  function plant(tall = false) {
    const g = new T.Group();
    cylinder(g, 0.17, 0.35, beige, 0, 0.175, 0, 0.13);
    cylinder(g, 0.155, 0.01, soil, 0, 0.35);
    const height = tall ? 1.3 : 0.65;
    cylinder(g, 0.022, height, darkWood, 0, 0.35 + height / 2);
    for (let i = 0; i < (tall ? 14 : 9); i++) {
      const a = i * 2.4,
        y = 0.55 + (i % 5) * (height / 5);
      const l = mesh(
        g,
        geometry("leaf", () => new T.SphereGeometry(1, 8, 6)),
        i % 2 ? leaf : leafLight,
        Math.sin(a) * 0.16,
        y,
        Math.cos(a) * 0.16,
      );
      l.scale.set(0.075, tall ? 0.29 : 0.2, 0.14);
      l.rotation.set(0.6, a, 0.55);
    }
    return g;
  }
  function chair(stool = false) {
    const g = new T.Group(),
      seatY = stool ? 0.72 : 0.43;
    for (const x of [-0.18, 0.18])
      for (const z of [-0.16, 0.16])
        box(g, 0.032, seatY, 0.032, stool ? brass : darkWood, x, seatY / 2, z);
    box(g, 0.46, 0.1, 0.42, stool ? olive : cushion, 0, seatY);
    if (!stool) {
      box(g, 0.46, 0.4, 0.09, cushion, 0, seatY + 0.2, -0.18, 0.05);
      box(g, 0.06, 0.18, 0.34, cushion, -0.23, seatY + 0.06, 0);
      box(g, 0.06, 0.18, 0.34, cushion, 0.23, seatY + 0.06, 0);
    }
    return g;
  }
  function makeTable(
    shape: "round" | "square" | "rectangle",
    material: FurnitureMaterial,
    seats: number,
  ) {
    const g = new T.Group();
    const top = tops[material];
    if (shape === "round") {
      cylinder(g, 0.46, 0.065, top, 0, 0.76);
      cylinder(g, 0.075, 0.68, darkWood, 0, 0.37);
      cylinder(g, 0.21, 0.07, darkWood, 0, 0.045);
    } else {
      const width = shape === "rectangle" ? 1.18 : 0.8;
      box(g, width, 0.065, 0.8, top, 0, 0.76, 0, 0.035);
      for (const x of [-width / 2 + 0.1, width / 2 - 0.1])
        for (const z of [-0.29, 0.29]) box(g, 0.045, 0.72, 0.045, darkWood, x, 0.36, z);
    }
    for (const seat of floorSeats(shape, seats)) {
      const c = chair();
      c.position.set(seat.x, 0, seat.y);
      c.rotation.y = seat.rotation;
      g.add(c);
    }
    // A small vase adds scale and warmth without concealing the table material.
    cylinder(g, 0.045, 0.11, white, 0, 0.84);
    const sprig = plant();
    sprig.scale.setScalar(0.15);
    sprig.position.y = 0.87;
    g.add(sprig);
    return g;
  }
  function wall() {
    const g = new T.Group();
    box(g, 2, 1.8, 0.12, beige);
    box(g, 2, 0.055, 0.15, darkWood, 0, 1.82);
    box(g, 2, 0.08, 0.15, cream, 0, 0.06);
    // Panel joints stay visible at phone scale.
    for (const x of [-0.5, 0, 0.5]) box(g, 0.008, 1.7, 0.005, cream, x, 0.92, 0.064);
    return g;
  }
  function doorway(window = false) {
    const g = new T.Group();
    box(g, 1.08, 1.8, 0.1, window ? black : beige);
    box(g, 0.92, 1.65, 0.115, window ? glass : walnut, 0, 0.86);
    if (window) {
      for (const x of [-0.5, 0, 0.5]) box(g, 0.035, 1.8, 0.14, black, x, 0.9);
      for (const y of [0.05, 1.78]) box(g, 1.08, 0.035, 0.14, black, 0, y);
    } else {
      box(g, 0.92, 0.08, 0.14, darkWood, 0, 1.7);
      box(g, 0.06, 0.16, 0.12, brass, 0.31, 0.87, 0.1);
    }
    return g;
  }
  function counter(bar = false) {
    const g = new T.Group();
    box(g, 2, 0.9, 0.58, walnut, 0, 0.45);
    for (let i = 0; i < 28; i++) box(g, 0.022, 0.84, 0.023, darkWood, -0.95 + i * 0.07, 0.46, 0.3);
    box(g, 2.12, 0.07, 0.7, marble, 0, 0.95);
    box(g, 2.1, 0.06, 0.67, darkWood, 0, 0.07);
    if (bar) {
      for (const x of [-0.65, 0, 0.65]) {
        const c = chair(true);
        c.position.set(x, 0, 0.69);
        g.add(c);
      }
      for (const x of [-0.75, -0.5]) cylinder(g, 0.035, 0.2, glass, x, 1.08, -0.1);
    } else {
      box(g, 0.3, 0.04, 0.23, black, 0.62, 1.01, 0.02);
      const display = box(g, 0.28, 0.22, 0.04, black, 0.62, 1.15, -0.04);
      display.rotation.x = -0.2;
      const p = plant();
      p.scale.setScalar(0.3);
      p.position.set(-0.7, 1, 0);
      g.add(p);
    }
    return g;
  }
  function sofa() {
    const g = new T.Group();
    box(g, 1.75, 0.18, 0.7, darkWood, 0, 0.15);
    box(g, 1.72, 0.2, 0.67, olive, 0, 0.37, 0, 0.09);
    box(g, 1.76, 0.66, 0.18, olive, 0, 0.64, -0.3, 0.08);
    for (const x of [-0.86, 0.86]) box(g, 0.18, 0.57, 0.76, olive, x, 0.42, 0, 0.07);
    for (const x of [-0.52, 0, 0.52]) {
      box(g, 0.48, 0.09, 0.52, olive, x, 0.5, 0.04, 0.04);
      box(g, 0.025, 0.45, 0.025, darkWood, x + 0.24, 0.69, -0.19);
    }
    for (const x of [-0.65, 0.65])
      for (const z of [-0.23, 0.23]) box(g, 0.045, 0.1, 0.045, brass, x, 0.06, z);
    return g;
  }
  function kitchen() {
    const g = new T.Group();
    box(g, 1.8, 0.86, 0.7, metal);
    box(g, 1.86, 0.055, 0.76, metal, 0, 0.89);
    for (const x of [-0.57, 0, 0.57]) {
      box(g, 0.5, 0.65, 0.02, metal, x, 0.45, 0.36);
      box(g, 0.23, 0.018, 0.026, black, x, 0.7, 0.39);
    }
    for (const x of [-0.55, -0.25])
      for (const z of [-0.18, 0.13]) {
        cylinder(g, 0.1, 0.012, black, x, 0.925, z);
        cylinder(g, 0.067, 0.012, metal, x, 0.933, z);
      }
    box(g, 0.4, 0.012, 0.44, black, 0.5, 0.925);
    box(g, 0.31, 0.016, 0.35, metal, 0.5, 0.935);
    cylinder(g, 0.02, 0.27, metal, 0.62, 1.06, -0.23);
    box(g, 0.16, 0.025, 0.025, metal, 0.55, 1.19, -0.23);
    box(g, 0.82, 0.16, 0.46, metal, -0.4, 1.65, -0.1);
    box(g, 0.3, 0.28, 0.23, metal, -0.4, 1.85, -0.15);
    return g;
  }
  function restroom() {
    const g = new T.Group();
    box(g, 0.76, 0.12, 0.7, white, 0.12, 0.4);
    cylinder(g, 0.22, 0.3, white, -0.15, 0.22, 0.09);
    const bowl = cylinder(g, 0.25, 0.1, white, -0.15, 0.43, 0.15, 0.21);
    bowl.scale.z = 1.3;
    const inset = cylinder(g, 0.18, 0.012, cream, -0.15, 0.49, 0.15);
    inset.scale.z = 1.3;
    box(g, 0.42, 0.52, 0.18, white, -0.15, 0.61, -0.2, 0.04);
    box(g, 0.62, 0.68, 0.4, walnut, 0.76, 0.34, -0.1);
    box(g, 0.65, 0.065, 0.43, marble, 0.76, 0.73, -0.1);
    cylinder(g, 0.12, 0.03, cream, 0.76, 0.78, -0.1);
    cylinder(g, 0.016, 0.16, metal, 0.76, 0.84, -0.26);
    return g;
  }
  function makeElement(type: FloorElementType) {
    switch (type) {
      case "chair":
        return chair();
      case "stool":
        return chair(true);
      case "wall":
        return wall();
      case "door":
        return doorway();
      case "window":
        return doorway(true);
      case "tree":
        return plant(true);
      case "plant":
        return plant();
      case "toilet":
        return restroom();
      case "kitchen":
        return kitchen();
      case "bar":
        return counter(true);
      case "counter":
        return counter();
      case "sofa":
        return sofa();
    }
  }
  const templates = new Map<string, T.Group>();
  function batched(key: string, create: () => T.Group) {
    if (!templates.has(key)) {
      const source = create();
      source.updateMatrixWorld(true);
      const batches = new Map<T.Material, T.BufferGeometry[]>();
      source.traverse((object) => {
        if (!(object instanceof T.Mesh) || Array.isArray(object.material)) return;
        const geometries = batches.get(object.material) ?? [];
        geometries.push(
          (object.geometry.index
            ? object.geometry.toNonIndexed()
            : object.geometry.clone()
          ).applyMatrix4(object.matrixWorld),
        );
        batches.set(object.material, geometries);
      });
      const group = new T.Group();
      batches.forEach((geometries, material) => {
        const merged = mergeGeometries(geometries);
        geometries.forEach((geometry) => geometry.dispose());
        if (merged) mesh(group, keep(merged), material, 0, 0, 0);
      });
      templates.set(key, group);
    }
    return templates.get(key)!.clone(true);
  }
  function table(
    shape: "round" | "square" | "rectangle",
    material: FurnitureMaterial,
    seats: number,
  ) {
    return batched(`table:${shape}:${material}:${seats}`, () => makeTable(shape, material, seats));
  }
  function element(type: FloorElementType) {
    return batched(`element:${type}`, () => makeElement(type));
  }
  function fitFootprint(group: T.Group, width: number, depth: number) {
    const bounds = new T.Box3().setFromObject(group),
      size = bounds.getSize(new T.Vector3());
    group.scale.x = width / Math.max(size.x, 0.01);
    group.scale.z = depth / Math.max(size.z, 0.01);
    return group;
  }
  return {
    table,
    chair,
    element,
    fitFootprint,
    box,
    mat,
    tileMap,
    dispose: () => {
      resources.forEach((r) => r.dispose());
      resources.clear();
    },
  };
}
