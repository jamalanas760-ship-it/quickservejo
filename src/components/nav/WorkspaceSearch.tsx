import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ArrowUpRight, Clock3, FileSearch, LoaderCircle, Search, Trash2 } from "lucide-react";
import { Command, CommandInput, CommandList, CommandGroup, CommandItem } from "@/components/ui/command";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { cleanSearchTerm, normalizeSearchHistory, rememberSearch, searchHistoryKey, searchPattern, type SearchDestination } from "@/lib/workspace-search";

type Hit = { id: string; title: string; subtitle: string; to: string };
type Props = { restaurantId: string | null; userId?: string; items: SearchDestination[]; ar: boolean };

export function WorkspaceSearch({ restaurantId, userId, items, ar }: Props) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const [debounced, setDebounced] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const key = userId && restaurantId ? searchHistoryKey(userId, restaurantId) : null;
  useEffect(() => {
    try { setHistory(key ? normalizeSearchHistory(JSON.parse(localStorage.getItem(key) ?? "[]")) : []); }
    catch { setHistory([]); }
  }, [key, open]);
  useEffect(() => {
    const launch = () => setOpen(true);
    const shortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault(); setOpen(true);
      }
    };
    window.addEventListener("quickserve:open-search", launch);
    window.addEventListener("keydown", shortcut);
    return () => { window.removeEventListener("quickserve:open-search", launch); window.removeEventListener("keydown", shortcut); };
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(cleanSearchTerm(term)), 250);
    return () => clearTimeout(timer);
  }, [term]);
  const orderDestination = items.find(item => item.en === "Orders" || item.en === "Kitchen")?.to;
  const teamDestination = items.find(item => item.en === "Team")?.to;
  const tableDestination = items.find(item => item.en === "Tables" || item.en === "Floor")?.to;
  const menuDestination = items.find(item => item.en === "Menu")?.to;
  const result = useQuery({
    queryKey: ["workspace-search", restaurantId, userId, debounced, ar, orderDestination, teamDestination, tableDestination, menuDestination],
    enabled: open && Boolean(restaurantId && userId) && debounced.length >= 2,
    staleTime: 15_000,
    queryFn: async ({ signal }) => {
      if (!restaurantId) return { groups: [], failed: false };
      const pattern = searchPattern(debounced);
      const groups: { label: string; hits: Hit[] }[] = [];
      let failed = false;
      await Promise.all([
        (async () => {
          if (!orderDestination) return;
          const response = await supabase.from("orders").select("id, order_number, status").eq("restaurant_id", restaurantId).ilike("order_number", pattern).limit(8).abortSignal(signal);
          failed ||= Boolean(response.error);
          groups.push({ label: ar ? "الطلبات" : "Orders", hits: (response.data ?? []).map(row => ({ id: row.id, title: `#${row.order_number}`, subtitle: ar ? "طلب" : "Order", to: orderDestination })) });
        })(),
        (async () => {
          if (!teamDestination) return;
          const response = await supabase.from("staff").select("id, name, role").eq("restaurant_id", restaurantId).ilike("name", pattern).limit(8).abortSignal(signal);
          failed ||= Boolean(response.error);
          groups.push({ label: ar ? "الفريق" : "Team", hits: (response.data ?? []).map(row => ({ id: row.id, title: row.name, subtitle: ar ? "عضو الفريق" : "Team member", to: teamDestination })) });
        })(),
        (async () => {
          if (!tableDestination) return;
          const response = await supabase.from("restaurant_tables").select("id, table_name, table_number").eq("restaurant_id", restaurantId).or(`table_name.ilike.${pattern},table_number.ilike.${pattern}`).limit(8).abortSignal(signal);
          failed ||= Boolean(response.error);
          groups.push({ label: ar ? "الطاولات" : "Tables", hits: (response.data ?? []).map(row => ({ id: row.id, title: row.table_name || `${ar ? "طاولة" : "Table"} ${row.table_number}`, subtitle: row.table_number, to: tableDestination })) });
        })(),
        (async () => {
          if (!menuDestination) return;
          const response = await supabase.from("menu_items").select("id, name_en, name_ar").eq("restaurant_id", restaurantId).or(`name_en.ilike.${pattern},name_ar.ilike.${pattern}`).limit(8).abortSignal(signal);
          failed ||= Boolean(response.error);
          groups.push({ label: ar ? "القائمة" : "Menu", hits: (response.data ?? []).map(row => ({ id: row.id, title: ar ? row.name_ar || row.name_en : row.name_en || row.name_ar, subtitle: ar ? "عنصر القائمة" : "Menu item", to: menuDestination })) });
        })(),
      ]);
      return { groups: groups.filter(group => group.hits.length), failed };
    },
  });
  const needle = cleanSearchTerm(term).toLocaleLowerCase();
  const pages = items.filter(item => `${item.en} ${item.ar}`.toLocaleLowerCase().includes(needle));
  const currentResults = debounced === cleanSearchTerm(term) && debounced.length >= 2;
  const groups = currentResults ? result.data?.groups ?? [] : [];
  const busy = needle.length >= 2 && (!currentResults || result.isFetching);
  function persist(next: string[]) {
    setHistory(next);
    try { if (key) localStorage.setItem(key, JSON.stringify(next)); } catch { /* Session-only history remains available. */ }
  }
  function close(value: boolean) {
    setOpen(value);
    if (!value) { setTerm(""); setDebounced(""); }
  }
  async function go(to: string) {
    if (needle) persist(rememberSearch(history, term));
    close(false);
    await navigate({ to: to as never });
  }
  return <Dialog open={open} onOpenChange={close}>
    <DialogContent className="qs-workspace-search max-w-2xl gap-0 overflow-hidden p-0" aria-describedby="workspace-search-description">
      <DialogTitle className="px-5 pt-5 text-base font-bold">{ar ? "البحث في مساحة العمل" : "Search workspace"}</DialogTitle>
      <DialogDescription id="workspace-search-description" className="sr-only">{ar ? "البحث في الصفحات والطلبات والفريق والطاولات والقائمة" : "Search pages, orders, team, tables and menu"}</DialogDescription>
      <Command shouldFilter={false} dir={ar ? "rtl" : "ltr"}>
        <CommandInput value={term} onValueChange={setTerm} placeholder={ar ? "ابحث في كل شيء…" : "Search anything…"} aria-label={ar ? "البحث" : "Search"} maxLength={100} className="h-14 pe-9 text-base" />
        <CommandList className="max-h-[min(60dvh,520px)] p-2" aria-busy={busy}>
          {!needle && history.length > 0 && <CommandGroup heading={<span className="flex items-center justify-between">{ar ? "عمليات البحث الأخيرة" : "Recent searches"}<Button size="icon" variant="ghost" className="size-11" aria-label={ar ? "مسح سجل البحث" : "Clear search history"} onClick={() => persist([])}><Trash2 className="size-4" /></Button></span>}>
            {history.map(entry => <CommandItem key={entry} value={`history-${entry}`} onSelect={() => setTerm(entry)} className="min-h-11"><Clock3 /><span className="truncate">{entry}</span></CommandItem>)}
          </CommandGroup>}
          {pages.length > 0 && <CommandGroup heading={ar ? "الصفحات والأدوات" : "Pages & tools"}>{pages.map(item => <CommandItem key={item.to} value={`page-${item.to}`} onSelect={() => void go(item.to)} className="min-h-12"><Search /><span className="flex-1">{ar ? item.ar : item.en}</span><ArrowUpRight className="text-muted-foreground" /></CommandItem>)}</CommandGroup>}
          {groups.map(group => <CommandGroup key={group.label} heading={group.label}>{group.hits.map(hit => <CommandItem key={hit.id} value={hit.id} onSelect={() => void go(hit.to)} className="min-h-14"><FileSearch /><span className="min-w-0 flex-1"><strong className="block truncate font-semibold">{hit.title}</strong><small className="text-muted-foreground">{hit.subtitle}</small></span><ArrowUpRight /></CommandItem>)}</CommandGroup>)}
          <div role="status" aria-live="polite" className="px-3 py-3 text-sm text-muted-foreground">
            {busy ? <span className="flex items-center gap-2"><LoaderCircle className="size-4 animate-spin" />{ar ? "جارٍ البحث…" : "Searching…"}</span> : currentResults && (result.isError || result.data?.failed) ? <span>{ar ? "تعذر تحميل بعض النتائج." : "Some results could not be loaded."} <Button variant="ghost" size="sm" onClick={() => void result.refetch()}>{ar ? "إعادة المحاولة" : "Retry"}</Button></span> : needle && !pages.length && !groups.length ? (ar ? "لا توجد نتائج مطابقة" : "No matching results") : null}
          </div>
        </CommandList>
      </Command>
    </DialogContent>
  </Dialog>;
}