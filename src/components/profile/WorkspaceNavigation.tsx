import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, GripVertical, Trash2 } from "lucide-react";
import { ActionMenu } from "@/components/app/ActionMenu";
import { Button } from "@/components/ui/button";

type Choice = { key: string; en: string; ar: string };
type Drag = { key: string; pointer: number; startY: number; y: number; target: number };

export function WorkspaceNavigation({
  ar,
  selected,
  choices,
  defaults,
  onChange,
}: {
  ar: boolean;
  selected: string[];
  choices: readonly Choice[];
  defaults: readonly string[];
  onChange: (items: string[]) => void;
}) {
  const [tool, setTool] = useState("");
  const [drag, setDrag] = useState<Drag | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const session = useRef<Drag | null>(null);
  const frame = useRef(0);
  const list = useRef<HTMLOListElement>(null);
  const label = (key: string) => {
    const choice = choices.find((item) => item.key === key);
    return choice ? choice[ar ? "ar" : "en"] : key;
  };
  const reorder = (key: string, target: number) => {
    const from = selected.indexOf(key);
    if (from < 0 || target < 0 || target >= selected.length || from === target) return;
    const next = [...selected];
    next.splice(from, 1);
    next.splice(target, 0, key);
    onChange(next);
    setAnnouncement(
      ar
        ? `${label(key)} في الموضع ${target + 2}`
        : `${label(key)} moved to position ${target + 2}`,
    );
  };
  const stop = () => {
    cancelAnimationFrame(frame.current);
    session.current = null;
    setDrag(null);
  };
  useEffect(() => {
    const cancelDrag = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !session.current) return;
      event.preventDefault();
      event.stopPropagation();
      cancelAnimationFrame(frame.current);
      session.current = null;
      setDrag(null);
    };
    window.addEventListener("keydown", cancelDrag, true);
    return () => {
      cancelAnimationFrame(frame.current);
      window.removeEventListener("keydown", cancelDrag, true);
    };
  }, []);
  const dropTarget = (y: number) => {
    if (!list.current) return -1;
    const rows = Array.from(list.current.children) as HTMLElement[];
    let distance = Infinity,
      target = -1;
    let rowTop = list.current.getBoundingClientRect().top;
    rows.forEach((row, index) => {
      const height = row.offsetHeight;
      const next = Math.abs(y - (rowTop + height / 2));
      rowTop += height;
      if (next < distance) {
        distance = next;
        target = index;
      }
    });
    return target;
  };
  const tick = () => {
    const current = session.current;
    if (!current || !list.current) return;
    const scroller = list.current.closest<HTMLElement>(".ps-advanced-body");
    if (scroller) {
      const bounds = scroller.getBoundingClientRect();
      if (current.y < bounds.top + 28) scroller.scrollTop -= 6;
      else if (current.y > bounds.bottom - 28) scroller.scrollTop += 6;
    }
    current.target = dropTarget(current.y);
    setDrag({ ...current });
    frame.current = requestAnimationFrame(tick);
  };
  return (
    <section className="ps-workspace-navigation">
      <div className="ps-workspace-navigation-heading">
        <div>
          <h2>{ar ? "تخصيص التنقل" : "Customize navigation"}</h2>
          <p className="ps-workspace-help">
            {ar
              ? "اختر حتى 5 أدوات. الرئيسية أولاً؛ الموبايل يعرض أول 3 أدوات."
              : "Choose up to 5 tools. Home stays first; mobile shows the first 3 tools."}
          </p>
        </div>
        <div>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              stop();
              onChange([...defaults]);
            }}
          >
            {ar ? "إعادة ضبط" : "Reset"}
          </Button>
          <p className="ps-workspace-help">
            {selected.length} / 5 {ar ? "أدوات" : "tools"}
          </p>
        </div>
      </div>
      <p className="sr-only" id="workspace-drag-help">
        {ar
          ? "اسحب مقبض الأداة لترتيبها أو استخدم أسهم لوحة المفاتيح."
          : "Drag a tool handle to reorder, or use the Up and Down arrow keys."}
      </p>
      <ol className="ps-workspace-tool-list" ref={list}>
        {selected.map((key, index) => (
          <li
            key={key}
            data-tool={key}
            className={`${drag?.key === key ? "is-dragging" : ""} ${drag && drag.target === index ? "is-drop-target" : ""}`}
            style={
              drag?.key === key ? { transform: `translateY(${drag.y - drag.startY}px)` } : undefined
            }
          >
            <button
              type="button"
              className="ps-workspace-drag-handle"
              aria-label={ar ? `ترتيب ${label(key)}` : `Reorder ${label(key)}`}
              aria-describedby="workspace-drag-help"
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  stop();
                  return;
                }
                if (event.key === "ArrowUp" || event.key === "ArrowDown") {
                  event.preventDefault();
                  reorder(key, index + (event.key === "ArrowUp" ? -1 : 1));
                }
              }}
              onPointerDown={(event) => {
                if (event.button !== 0 || !event.isPrimary) return;
                event.preventDefault();
                event.currentTarget.focus();
                event.currentTarget.setPointerCapture(event.pointerId);
                session.current = {
                  key,
                  pointer: event.pointerId,
                  startY: event.clientY,
                  y: event.clientY,
                  target: index,
                };
                setDrag({ ...session.current });
                frame.current = requestAnimationFrame(tick);
              }}
              onPointerMove={(event) => {
                if (session.current?.pointer === event.pointerId) session.current.y = event.clientY;
              }}
              onPointerUp={(event) => {
                const current = session.current;
                if (!current || current.pointer !== event.pointerId) return;
                reorder(current.key, dropTarget(event.clientY));
                stop();
              }}
              onPointerCancel={stop}
              onLostPointerCapture={() => {
                if (session.current) stop();
              }}
            >
              <span>{index + 2}</span>
              <GripVertical className="size-4" />
            </button>
            <strong>{label(key)}</strong>
            <ActionMenu
              ar={ar}
              label={ar ? `إجراءات ${label(key)}` : `${label(key)} actions`}
              actions={[
                {
                  label: ar ? "تحريك للأعلى" : "Move up",
                  icon: ArrowUp,
                  disabled: index === 0,
                  onSelect: () => reorder(key, index - 1),
                },
                {
                  label: ar ? "تحريك للأسفل" : "Move down",
                  icon: ArrowDown,
                  disabled: index === selected.length - 1,
                  onSelect: () => reorder(key, index + 1),
                },
                {
                  label: ar ? "إزالة" : "Remove",
                  icon: Trash2,
                  destructive: true,
                  separatorBefore: true,
                  onSelect: () => onChange(selected.filter((item) => item !== key)),
                },
              ]}
            />
          </li>
        ))}
      </ol>
      {!selected.length && (
        <p className="ps-workspace-help">
          {ar ? "أضف أدوات لتخصيص ترتيب التنقل." : "Add tools to customize navigation order."}
        </p>
      )}
      <div className="ps-workspace-add-tool">
        <label htmlFor="workspace-sidebar-tool">{ar ? "إضافة أداة" : "Add a tool"}</label>
        <select
          id="workspace-sidebar-tool"
          value={tool}
          disabled={selected.length >= 5}
          onChange={(event) => setTool(event.target.value)}
        >
          <option value="">{ar ? "اختر أداة" : "Choose a tool"}</option>
          {choices
            .filter((item) => !selected.includes(item.key))
            .map((item) => (
              <option key={item.key} value={item.key}>
                {item[ar ? "ar" : "en"]}
              </option>
            ))}
        </select>
        <Button
          type="button"
          variant="outline"
          disabled={!tool || selected.length >= 5}
          onClick={() => {
            if (!tool || selected.includes(tool) || selected.length >= 5) return;
            onChange([...selected, tool]);
            setTool("");
          }}
        >
          {ar ? "إضافة" : "Add"}
        </Button>
      </div>
      <p className="ps-workspace-help">
        {ar ? "الأدوات الأخرى تبقى في All tools." : "Other tools remain in All tools."}
      </p>
      <span className="sr-only" role="status" aria-live="polite">
        {announcement}
      </span>
    </section>
  );
}
