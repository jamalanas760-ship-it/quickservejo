import { RotateCcw, RotateCw } from "lucide-react";
import { rotateFloorObject } from "@/lib/floor-plan-elements";

export function FloorRotationControl({ value, onChange, disabled, ar }: {
  value: number; onChange: (value: number) => void; disabled: boolean; ar: boolean;
}) {
  return <div className="qs-floor-rotation" role="group" aria-label={ar ? "دوران العنصر" : "Object rotation"}>
    <button type="button" disabled={disabled} onClick={() => onChange(rotateFloorObject(value, -45))} aria-label={ar ? "تدوير لليسار 45 درجة" : "Rotate left 45 degrees"}><RotateCcw aria-hidden="true" /><span>45°</span></button>
    <output aria-live="polite">{value}°</output>
    <button type="button" disabled={disabled} onClick={() => onChange(rotateFloorObject(value, 45))} aria-label={ar ? "تدوير لليمين 45 درجة" : "Rotate right 45 degrees"}><RotateCw aria-hidden="true" /><span>45°</span></button>
  </div>;
}
