import { RotateCcw, RotateCw } from "lucide-react";
import { rotateFloorObject } from "@/lib/floor-plan-elements";

export function FloorRotationControl({ value, onChange, disabled, ar }: {
  value: number; onChange: (value: number) => void; disabled: boolean; ar: boolean;
}) {
  const angle = ((value % 360) + 360) % 360;
  return <div className="qs-floor-rotation" role="group" aria-label={ar ? "دوران العنصر" : "Object rotation"}>
    <div className="qs-floor-rotation-step">
      <button type="button" disabled={disabled} onClick={() => onChange(rotateFloorObject(value, -45))} aria-label={ar ? "تدوير لليسار 45 درجة" : "Rotate left 45 degrees"}><RotateCcw aria-hidden="true" /><span>45°</span></button>
      <output aria-live="polite">{Math.round(angle)}°</output>
      <button type="button" disabled={disabled} onClick={() => onChange(rotateFloorObject(value, 45))} aria-label={ar ? "تدوير لليمين 45 درجة" : "Rotate right 45 degrees"}><RotateCw aria-hidden="true" /><span>45°</span></button>
    </div>
    <label className="qs-floor-angle-slider">
      <span>{ar ? "اسحب للدوران بحرية" : "Drag to rotate freely"}</span>
      <input type="range" min="0" max="359" step="1" value={angle} disabled={disabled}
        aria-label={ar ? "زاوية الدوران" : "Rotation angle"}
        aria-valuetext={`${Math.round(angle)}°`}
        onKeyDown={event => event.stopPropagation()}
        onChange={event => onChange(rotateFloorObject(Number(event.target.value), 0))} />
    </label>
  </div>;
}
