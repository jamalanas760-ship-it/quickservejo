import { useState } from "react";
import { Check, ChevronDown, Languages } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LanguageFlag } from "./LanguageFlag";
import "./language-selector.css";

export function LanguageSelector({
  language,
  onChange,
}: {
  language: "en" | "ar";
  onChange: (language: "en" | "ar") => void;
}) {
  const [open, setOpen] = useState(false);
  const ar = language === "ar";
  return (
    <DropdownMenu modal={false} dir={ar ? "rtl" : "ltr"} open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="qs-language-trigger"
          aria-label={ar ? "تغيير اللغة" : "Change language"}
        >
          <LanguageFlag language={language} />
          <span>{ar ? "AR" : "EN"}</span>
          <ChevronDown aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={6}
        collisionPadding={10}
        className="qs-language-menu"
      >
        <DropdownMenuLabel className="qs-language-heading">
          <Languages aria-hidden="true" />
          <span>{ar ? "اللغة" : "Language"}</span>
        </DropdownMenuLabel>
        {(["en", "ar"] as const).map((value) => (
          <DropdownMenuItem
            key={value}
            className="qs-language-option"
            data-selected={language === value}
            onSelect={() => {
              onChange(value);
              setOpen(false);
            }}
          >
            <span className="qs-language-flag">
              <LanguageFlag language={value} />
            </span>
            <span className="qs-language-copy" lang={value}>
              <strong>{value === "en" ? "English" : "العربية"}</strong>
            </span>
            <span
              className="qs-language-check"
              aria-label={
                language === value ? (ar ? "اللغة المختارة" : "Selected language") : undefined
              }
            >
              {language === value ? <Check /> : null}
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
