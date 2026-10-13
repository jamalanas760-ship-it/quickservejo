import { Link } from "@tanstack/react-router";
import { ArrowLeft, House } from "lucide-react";
import type { HomeDateSelection } from "@/lib/home-period";
export function BackHomeButton({ ar, selection }: { ar: boolean; selection?: HomeDateSelection }) {
  return (
    <div className="p2-home-row">
      <Link to="/dashboard" search={selection ?? {}} className="p2-home-button">
        <ArrowLeft size={16} aria-hidden="true" />
        <House size={16} aria-hidden="true" />
        {ar ? "العودة للرئيسية" : "Back to Home"}
      </Link>
    </div>
  );
}
