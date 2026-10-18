import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Grid2X2, MoreHorizontal, UserRound, ChevronDown } from "lucide-react";
import { ViewportDock } from "@/components/nav/ViewportDock";
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
  const [moreOpen, setMoreOpen] = useState(false);
  const items = workforceDestinations(ar, canManage);
  const more = items.filter((item) => item.id !== "overview" && item.id !== "my_workspace");
  const inMore = more.some((item) => item.id === active);
  const choose = (value: string) => {
    const item = items.find((item) => item.id === value);
    if (item) {
      onChange(item.id as WorkforceDestination);
      setTopOpen(false);
      setMoreOpen(false);
    }
  };
  const sectionLinks = (list: typeof items | typeof more) => (
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
      <ViewportDock dir={ar ? "rtl" : "ltr"}>
        <nav
          className="qs-mobile-bottom-nav wf-mobile-workforce-dock"
          aria-label={ar ? "تنقل القوى العاملة السريع" : "Quick workforce navigation"}
        >
          <div
            className="qs-mobile-bottom-nav-shell wf-mobile-workforce-items"
            style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}
          >
            {items.slice(0, 2).map((item) => {
              const Icon = item.id === "overview" ? Grid2X2 : UserRound;
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-current={active === item.id ? "page" : undefined}
                  onClick={() => choose(item.id)}
                >
                  <Icon aria-hidden="true" />
                  <span>{item.label}</span>
                </button>
              );
            })}
            <Popover open={moreOpen} onOpenChange={setMoreOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="wf-mobile-more"
                  data-active={inMore}
                  aria-label={ar ? "المزيد من أقسام القوى العاملة" : "More workforce sections"}
                >
                  <MoreHorizontal aria-hidden="true" />
                  <span>{ar ? "المزيد" : "More"}</span>
                </button>
              </PopoverTrigger>
              <PopoverContent
                className="wf-section-menu"
                align="end"
                side="top"
                sideOffset={12}
                dir={ar ? "rtl" : "ltr"}
              >
                {sectionLinks(more)}
              </PopoverContent>
            </Popover>
          </div>
        </nav>
      </ViewportDock>
    </>
  );
}
