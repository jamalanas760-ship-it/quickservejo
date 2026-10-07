import type { ComponentProps } from "react";
import { X } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import { DetailSheet } from "./DetailSheet";

/** A compact task dock on larger screens, a focus-trapped sheet on phones. */
export function TaskPanel(props: ComponentProps<typeof DetailSheet>) {
  const mobile = useIsMobile();
  if (mobile) return <DetailSheet {...props} panelClassName="qs-task-sheet" />;
  if (!props.open) return null;
  return (
    <section
      aria-label={typeof props.title === "string" ? props.title : "Table service"}
      className="mx-4 mb-6 overflow-hidden rounded-2xl border bg-card shadow-sm sm:mx-6"
    >
      <header className="flex items-center justify-between border-b px-5 py-3">
        <div>
          <h2 className="font-semibold">{props.title}</h2>
          {props.description ? (
            <p className="mt-1 text-xs text-muted-foreground">{props.description}</p>
          ) : null}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="size-11"
          aria-label="Close table details"
          onClick={() => props.onOpenChange(false)}
        >
          <X className="size-4" />
        </Button>
      </header>
      <div className="max-h-[45dvh] overflow-y-auto p-4">{props.children}</div>
      {props.footer}
    </section>
  );
}
