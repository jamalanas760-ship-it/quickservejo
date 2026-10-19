import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Grid2X2, ChevronDown } from "lucide-react";
import { workforceDestinations, type WorkforceDestination } from "@/lib/workforce-navigation";
export function WorkforceNavigation({
  active,
  onChange,
  canManage,
  ar,
}: {
  active: WorkforceDestination;
  onChange: (value: WorkforceDestination) => void;
  canManage: boolean;
  ar: boolean;
}) {
  const [topOpen, setTopOpen] = useState(false);
  const items = workforceDestinations(ar, canManage);
  const choose = (value: string) => {
    const item = items.find((item) => item.id === value);
    if (item) {
      onChange(item.id as WorkforceDestination);
      setTopOpen(false);
    }
  };
  const sectionLinks = (list: typeof items) => (
    <nav
      aria-label={ar ? "أقسام القوى العاملة" : "Workforce sections"}
      className="wf-section-menu-list"
    >
      {list.map((item) => (
        <button
          type="button"
          key={item.id}
          aria-current={active === item.id ? "page" : undefined}
          onClick={() => choose(item.id)}
        >
          {item.label}
        </button>
      ))}
    </nav>
  );
  return (
    <>
      <nav
        className="wf-tabs wf-minimal-desktop-nav"
        aria-label={ar ? "أقسام القوى العاملة" : "Workforce sections"}
      >
        <div>
          {items
            .filter((item) => item.id !== "payslips" && item.id !== "leave")
            .map((item) => (
              <button
                key={item.id}
                type="button"
                aria-current={
                  active === item.id ||
                  (item.id === "my_workspace" && (active === "payslips" || active === "leave"))
                    ? "page"
                    : undefined
                }
                className={
                  active === item.id ||
                  (item.id === "my_workspace" && (active === "payslips" || active === "leave"))
                    ? "is-selected"
                    : ""
                }
                onClick={() => choose(item.id)}
              >
                {item.label}
              </button>
            ))}
        </div>
      </nav>
      <nav
        className="wf-mobile-section-nav"
        aria-label={ar ? "أقسام القوى العاملة" : "Workforce sections"}
      >
        <Popover open={topOpen} onOpenChange={setTopOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="wf-mobile-section-trigger"
              aria-label={ar ? "اختر قسم القوى العاملة" : "Choose workforce section"}
            >
              <Grid2X2 aria-hidden="true" />
              <span>{items.find((item) => item.id === active)?.label}</span>
              <ChevronDown aria-hidden="true" />
            </button>
          </PopoverTrigger>
          <PopoverContent
            className="wf-section-menu"
            align="start"
            side="bottom"
            dir={ar ? "rtl" : "ltr"}
          >
            {sectionLinks(items)}
          </PopoverContent>
        </Popover>
      </nav>
    </>
  );
}
