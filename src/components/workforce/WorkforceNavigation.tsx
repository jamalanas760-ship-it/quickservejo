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
  const items = workforceDestinations(ar, canManage);
  const more = items.filter((item) => item.id !== "overview" && item.id !== "my_workspace");
  const inMore = more.some((item) => item.id === active);
  const choose = (value: string) => {
    const item = items.find((item) => item.id === value);
    if (item) onChange(item.id as WorkforceDestination);
  };
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
        <label className="wf-mobile-section-select">
          <Grid2X2 aria-hidden="true" />
          <select
            aria-label={ar ? "اختر قسم القوى العاملة" : "Choose workforce section"}
            value={active}
            onChange={(event) => choose(event.target.value)}
          >
            {items.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
          <ChevronDown aria-hidden="true" />
        </label>
      </nav>
      <ViewportDock dir={ar ? "rtl" : "ltr"}>
        <nav
          className="qs-mobile-bottom-nav wf-mobile-workforce-dock"
          aria-label={ar ? "تنقل القوى العاملة السريع" : "Quick workforce navigation"}
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
          <label className="wf-mobile-more" data-active={inMore}>
            <MoreHorizontal aria-hidden="true" />
            <span>{ar ? "المزيد" : "More"}</span>
            <select
              aria-label={ar ? "المزيد من أقسام القوى العاملة" : "More workforce sections"}
              value={inMore ? active : ""}
              onChange={(event) => choose(event.target.value)}
            >
              <option value="" disabled>
                {ar ? "المزيد" : "More"}
              </option>
              {more.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
        </nav>
      </ViewportDock>
    </>
  );
}
