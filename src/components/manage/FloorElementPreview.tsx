import { useEffect, useState } from "react";
import * as T from "three";
import { createFurnitureCatalog } from "./floor-3d-models";
import type { FloorElementType } from "@/lib/floor-plan-elements";

const cache = new Map<string, string>();

/** Render the floor's actual geometry once, without a WebGL context per card. */
function renderPreview(type: FloorElementType | "round" | "square" | "rectangle") {
  if (cache.has(type)) return cache.get(type)!;
  const catalog = createFurnitureCatalog();
  try {
    const group = ["round", "square", "rectangle"].includes(type)
      ? catalog.table(type as "round" | "square" | "rectangle", "wood", 4)
      : catalog.element(type as FloorElementType);
    group.updateMatrixWorld(true);
    const camera = new T.OrthographicCamera(-2, 2, 2, -2, .01, 100);
    const bounds = new T.Box3().setFromObject(group);
    const center = bounds.getCenter(new T.Vector3());
    camera.position.copy(center).add(new T.Vector3(5, 3.8, 5));
    camera.lookAt(center); camera.updateMatrixWorld();
    const faces: { points: T.Vector3[]; depth: number; color: string }[] = [];
    group.traverse(object => {
      if (!(object instanceof T.Mesh)) return;
      const geometry = object.geometry.index ? object.geometry.toNonIndexed() : object.geometry;
      const positions = geometry.getAttribute("position");
      const material = object.material as T.MeshStandardMaterial;
      for (let i = 0; i < positions.count; i += 3) {
        const world = [0, 1, 2].map(k => new T.Vector3().fromBufferAttribute(positions, i + k).applyMatrix4(object.matrixWorld));
        const normal = new T.Vector3().crossVectors(world[1].clone().sub(world[0]), world[2].clone().sub(world[0])).normalize();
        const midpoint = world[0].clone().add(world[1]).add(world[2]).divideScalar(3);
        if (normal.dot(camera.position.clone().sub(midpoint)) <= 0) continue;
        const shade = .65 + .35 * Math.max(0, normal.dot(new T.Vector3(-.4, 1, .6).normalize()));
        faces.push({ points: world.map(p => p.project(camera)), depth: midpoint.distanceToSquared(camera.position), color: `#${material.color.clone().multiplyScalar(shade).getHexString()}` });
      }
      if (geometry !== object.geometry) geometry.dispose();
    });
    const points = faces.flatMap(face => face.points);
    const left = Math.min(...points.map(p => p.x)), right = Math.max(...points.map(p => p.x));
    const top = Math.max(...points.map(p => p.y)), bottom = Math.min(...points.map(p => p.y));
    const scale = Math.min(260 / (right - left), 170 / (top - bottom));
    const canvas = document.createElement("canvas"); canvas.width = 320; canvas.height = 220;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "rgba(52,40,25,.12)"; context.filter = "blur(7px)";
    context.beginPath(); context.ellipse(160, 195, 85, 10, 0, 0, Math.PI * 2); context.fill(); context.filter = "none";
    faces.sort((a, b) => b.depth - a.depth).forEach(face => {
      context.beginPath();
      face.points.forEach((point, i) => {
        const x = 160 + (point.x - (left + right) / 2) * scale;
        const y = 105 - (point.y - (top + bottom) / 2) * scale;
        if (i) context.lineTo(x, y); else context.moveTo(x, y);
      });
      context.closePath(); context.fillStyle = face.color; context.fill();
    });
    const url = canvas.toDataURL("image/png"); cache.set(type, url); return url;
  } finally { catalog.dispose(); }
}

export function FloorElementPreview({ type }: { type: FloorElementType | "round" | "square" | "rectangle" }) {
  const [source, setSource] = useState(cache.get(type));
  useEffect(() => {
    const timer = window.setTimeout(() => setSource(renderPreview(type)), 0);
    return () => window.clearTimeout(timer);
  }, [type]);
  return <img className="qs-element-3d-preview" src={source} alt="" width={320} height={220} />;
}
