import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Gift, HeartHandshake, Search, Sparkles, UsersRound, WalletCards } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { AppHeader } from "@/components/nav/AppHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useAccess } from "@/hooks/useSession";
import { useWorkspaceScope } from "@/hooks/useWorkspace";
import { humanError } from "@/lib/errors";
import { formatDateTime, formatMoney, formatNumber } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { membershipHasCapability } from "@/lib/permissions";

export const Route = createFileRoute("/_authenticated/guests")({
  head: () => ({
    meta: [
      { title: "Guests & Loyalty — QuickServe" },
      { name: "description", content: "Restaurant guest CRM, loyalty points, repeat visits and gift cards." },
    ],
  }),
  component: GuestsPage,
});

type Guest = {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  marketing_opt_in: boolean;
  visits: number;
  lifetime_spend: number;
  last_visit_at: string | null;
  created_at: string;
};

type Loyalty = { guest_id: string; points: number; tier: string };
type GiftCard = { id: string; code: string; initial_value: number; balance: number; status: string; expires_at: string | null; guest_id: string | null; created_at: string };
type Settings = { enable_loyalty: boolean; collect_guest_details: boolean; loyalty_points_per_currency: number; loyalty_redeem_value: number };

function GuestsPage() {
  const { lang } = useI18n();
  const ar = lang === "ar";
  const scope = useWorkspaceScope();
  const access = useAccess();
  const rid = scope.restaurantId;
  const membership = rid ? access.membershipFor(rid) : null;
  const canView = Boolean(membership && (
    membershipHasCapability(membership.role, membership.permission_overrides, "view_analytics")
    || membershipHasCapability(membership.role, membership.permission_overrides, "manage_restaurant")
  ));
  const canManage = Boolean(membership && membershipHasCapability(membership.role, membership.permission_overrides, "manage_restaurant"));
  const canGift = Boolean(membership && (
    membershipHasCapability(membership.role, membership.permission_overrides, "manage_payments")
    || membershipHasCapability(membership.role, membership.permission_overrides, "manage_restaurant")
  ));
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [giftOpen, setGiftOpen] = useState(false);
  const [giftValue, setGiftValue] = useState("");
  const [giftGuest, setGiftGuest] = useState<string>("");

  const query = useQuery({
    queryKey: ["crm", rid],
    enabled: Boolean(rid && canView),
    queryFn: async () => {
      const [guestsRes, loyaltyRes, settingsRes, giftRes] = await Promise.all([
        supabase.from("crm_guests" as any).select("id,name,phone,email,marketing_opt_in,visits,lifetime_spend,last_visit_at,created_at").eq("restaurant_id", rid!).order("last_visit_at", { ascending: false, nullsFirst: false }).limit(2000),
        supabase.from("crm_loyalty_accounts" as any).select("guest_id,points,tier").eq("restaurant_id", rid!).limit(2000),
        supabase.from("restaurant_settings").select("enable_loyalty,collect_guest_details,loyalty_points_per_currency,loyalty_redeem_value").eq("restaurant_id", rid!).maybeSingle(),
        canGift ? supabase.from("crm_gift_cards" as any).select("id,code,initial_value,balance,status,expires_at,guest_id,created_at").eq("restaurant_id", rid!).order("created_at", { ascending: false }).limit(500) : Promise.resolve({ data: [], error: null }),
      ]);
      for (const result of [guestsRes, loyaltyRes, settingsRes, giftRes]) if (result.error) throw result.error;
      return {
        guests: (guestsRes.data ?? []) as unknown as Guest[],
        loyalty: (loyaltyRes.data ?? []) as unknown as Loyalty[],
        settings: (settingsRes.data ?? { enable_loyalty: false, collect_guest_details: false, loyalty_points_per_currency: 10, loyalty_redeem_value: 0.01 }) as unknown as Settings,
        giftCards: (giftRes.data ?? []) as unknown as GiftCard[],
      };
    },
  });

  const settingsMutation = useMutation({
    mutationFn: async (patch: Partial<Settings>) => {
      const { error } = await supabase.from("restaurant_settings").update(patch as any).eq("restaurant_id", rid!);
      if (error) throw error;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["crm", rid] });
      toast.success(ar ? "تم تحديث إعدادات الضيوف" : "Guest settings updated");
    },
    onError: (error) => toast.error(humanError(error, lang)),
  });

  const giftMutation = useMutation({
    mutationFn: async () => {
      const value = Number(giftValue);
      if (!(value > 0)) throw new Error(ar ? "أدخل قيمة صحيحة" : "Enter a valid gift-card value");
      const { data, error } = await (supabase as any).rpc("issue_gift_card", {
        _restaurant_id: rid,
        _value: value,
        _guest_id: giftGuest || null,
        _expires_at: null,
      });
      if (error) throw error;
      return String(data);
    },
    onSuccess: async (code) => {
      await qc.invalidateQueries({ queryKey: ["crm", rid] });
      setGiftOpen(false);
      setGiftValue("");
      setGiftGuest("");
      toast.success((ar ? "تم إصدار بطاقة الهدية: " : "Gift card issued: ") + code);
    },
    onError: (error) => toast.error(humanError(error, lang)),
  });

  if (scope.isPending || access.isPending) return <div className="min-h-dvh bg-background"><AppHeader /><main className="qs-page"><Skeleton className="h-[520px] rounded-3xl" /></main></div>;
  if (!rid || !membership || !canView) return <div className="min-h-dvh bg-background"><AppHeader /><main className="qs-page"><section className="qs-card p-8 text-center"><UsersRound className="mx-auto size-10 text-muted-foreground" /><h1 className="mt-4 text-xl font-bold">{ar ? "الضيوف غير متاحين" : "Guests are not available"}</h1><p className="mt-2 text-sm text-muted-foreground">{ar ? "هذا الحساب لا يملك صلاحية عرض بيانات الضيوف." : "This account does not have access to guest analytics."}</p></section></main></div>;

  const data = query.data;
  const guests = data?.guests ?? [];
  const loyalty = new Map((data?.loyalty ?? []).map((row) => [row.guest_id, row]));
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return guests;
    return guests.filter((guest) => [guest.name, guest.phone, guest.email].some((value) => value?.toLowerCase().includes(q)));
  }, [guests, search]);

  const repeat = guests.filter((guest) => guest.visits >= 2).length;
  const lifetime = guests.reduce((sum, guest) => sum + Number(guest.lifetime_spend), 0);
  const points = (data?.loyalty ?? []).reduce((sum, row) => sum + Number(row.points), 0);
  const activeCards = (data?.giftCards ?? []).filter((card) => card.status === "active").length;

  return <div className="min-h-dvh bg-background">
    <AppHeader title={ar ? "الضيوف والولاء" : "Guests & Loyalty"} />
    <main className="qs-page space-y-5">
      <section className="overflow-hidden rounded-[28px] border border-border bg-card shadow-sm">
        <div className="grid gap-6 p-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end sm:p-8">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-orange-500/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[.16em] text-[#ff5a0a]"><HeartHandshake className="size-3.5" />CRM</div>
            <h1 className="mt-4 font-display text-3xl font-bold tracking-[-.04em] sm:text-4xl">{ar ? "اعرف ضيوفك، وليس طلباتهم فقط" : "Know your guests, not only their orders"}</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{ar ? "زيارات، إنفاق، نقاط ولاء وبطاقات هدايا في ملف ضيف واحد." : "Visits, spend, loyalty points and gift cards in one guest workspace."}</p>
          </div>
          {canGift ? <Button onClick={() => setGiftOpen(true)}><Gift className="size-4" />{ar ? "إصدار بطاقة هدية" : "Issue gift card"}</Button> : null}
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric icon={UsersRound} label={ar ? "الضيوف" : "Guests"} value={formatNumber(guests.length, lang)} />
        <Metric icon={HeartHandshake} label={ar ? "ضيوف متكررون" : "Repeat guests"} value={formatNumber(repeat, lang)} />
        <Metric icon={WalletCards} label={ar ? "إنفاق مدى الحياة" : "Lifetime spend"} value={formatMoney(lifetime, scope.currency, lang)} />
        <Metric icon={Sparkles} label={ar ? "نقاط قائمة" : "Outstanding points"} value={formatNumber(points, lang)} hint={activeCards ? (ar ? activeCards + " بطاقات هدايا فعالة" : activeCards + " active gift cards") : undefined} />
      </section>

      {canManage && data ? <section className="rounded-2xl border border-border bg-card p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div><h2 className="font-bold">{ar ? "برنامج الضيوف" : "Guest program"}</h2><p className="mt-1 text-xs text-muted-foreground">{ar ? "اجمع بيانات الضيوف باختيارهم وفعّل نقاط الولاء على الطلبات المدفوعة." : "Collect guest details voluntarily and award loyalty points on paid orders."}</p></div>
          <div className="grid gap-3 sm:grid-cols-2 xl:min-w-[520px]">
            <label className="flex items-center justify-between gap-4 rounded-xl border border-border p-3"><span><strong className="block text-xs">{ar ? "جمع بيانات الضيف" : "Guest details"}</strong><span className="text-[10px] text-muted-foreground">{ar ? "الاسم والهاتف والبريد عند الطلب" : "Name, phone and email at checkout"}</span></span><Switch checked={data.settings.collect_guest_details} disabled={settingsMutation.isPending} onCheckedChange={(checked) => settingsMutation.mutate({ collect_guest_details: checked })} /></label>
            <label className="flex items-center justify-between gap-4 rounded-xl border border-border p-3"><span><strong className="block text-xs">{ar ? "برنامج الولاء" : "Loyalty program"}</strong><span className="text-[10px] text-muted-foreground">{ar ? "نقاط تلقائية بعد الدفع" : "Automatic points after payment"}</span></span><Switch checked={data.settings.enable_loyalty} disabled={settingsMutation.isPending} onCheckedChange={(checked) => settingsMutation.mutate({ enable_loyalty: checked })} /></label>
          </div>
        </div>
      </section> : null}

      <section className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
          <div><h2 className="font-display text-lg font-bold">{ar ? "دليل الضيوف" : "Guest directory"}</h2><p className="mt-1 text-xs text-muted-foreground">{ar ? "مرتب حسب آخر زيارة." : "Sorted by most recent visit."}</p></div>
          <div className="relative sm:w-[280px]"><Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} className="ps-9" placeholder={ar ? "بحث بالاسم أو الهاتف" : "Search name, phone or email"} /></div>
        </div>
        {query.isPending ? <div className="p-5"><Skeleton className="h-72 rounded-2xl" /></div> : query.isError ? <p className="p-6 text-sm text-destructive">{humanError(query.error, lang)}</p> : filtered.length === 0 ? <div className="grid min-h-[260px] place-items-center p-8 text-center"><div><UsersRound className="mx-auto size-9 text-muted-foreground" /><h3 className="mt-3 font-bold">{ar ? "لا يوجد ضيوف بعد" : "No guests yet"}</h3><p className="mt-1 text-xs text-muted-foreground">{ar ? "عندما يشارك الضيف بياناته في الطلب سيظهر هنا." : "Guests appear here after they voluntarily share contact details at checkout."}</p></div></div> : <div className="divide-y divide-border">{filtered.map((guest) => {
          const account = loyalty.get(guest.id);
          return <article key={guest.id} className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1.2fr)_auto_auto_auto] sm:items-center">
            <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><strong className="truncate">{guest.name || guest.phone || guest.email || (ar ? "ضيف" : "Guest")}</strong>{guest.visits >= 2 ? <Badge variant="secondary">{ar ? "متكرر" : "Repeat"}</Badge> : null}</div><p className="mt-1 truncate text-xs text-muted-foreground">{[guest.phone, guest.email].filter(Boolean).join(" · ") || "—"}</p></div>
            <div className="text-xs"><span className="text-muted-foreground">{ar ? "زيارات" : "Visits"}</span><strong className="ms-2">{formatNumber(guest.visits, lang)}</strong></div>
            <div className="text-xs"><span className="text-muted-foreground">{ar ? "إنفاق" : "Spend"}</span><strong className="ms-2">{formatMoney(Number(guest.lifetime_spend), scope.currency, lang)}</strong></div>
            <div className="text-end"><strong className="block text-sm">{formatNumber(account?.points ?? 0, lang)} {ar ? "نقطة" : "pts"}</strong><span className="text-[10px] text-muted-foreground">{guest.last_visit_at ? formatDateTime(guest.last_visit_at, lang) : (ar ? "لا توجد زيارة مدفوعة" : "No paid visit yet")}</span></div>
          </article>;
        })}</div>}
      </section>
    </main>

    <Dialog open={giftOpen} onOpenChange={setGiftOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{ar ? "إصدار بطاقة هدية" : "Issue gift card"}</DialogTitle><DialogDescription>{ar ? "ينشئ QuickServe رمزاً آمناً مع رصيد أولي." : "QuickServe creates a secure code with the starting balance."}</DialogDescription></DialogHeader>
        <div className="space-y-4">
          <label className="block space-y-2 text-sm"><span>{ar ? "القيمة" : "Value"} ({scope.currency})</span><Input type="number" min="0.01" step="0.01" value={giftValue} onChange={(event) => setGiftValue(event.target.value)} /></label>
          <label className="block space-y-2 text-sm"><span>{ar ? "ربط بضيف (اختياري)" : "Link to guest (optional)"}</span><select value={giftGuest} onChange={(event) => setGiftGuest(event.target.value)} className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm"><option value="">{ar ? "بدون ضيف" : "No guest"}</option>{guests.map((guest) => <option key={guest.id} value={guest.id}>{guest.name || guest.phone || guest.email || guest.id.slice(0, 8)}</option>)}</select></label>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => setGiftOpen(false)}>{ar ? "إلغاء" : "Cancel"}</Button><Button disabled={giftMutation.isPending || !(Number(giftValue) > 0)} onClick={() => giftMutation.mutate()}><Gift className="size-4" />{ar ? "إصدار" : "Issue"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </div>;
}

function Metric({ icon: Icon, label, value, hint }: { icon: typeof UsersRound; label: string; value: string; hint?: string | undefined }) {
  return <article className="qs-stat min-h-[112px] p-4"><div className="flex items-center gap-2 text-muted-foreground"><span className="grid size-9 place-items-center rounded-xl bg-orange-500/10 text-[#ff5a0a]"><Icon className="size-4" /></span><p className="text-[11px] font-semibold">{label}</p></div><strong className="mt-3 block font-display text-2xl tracking-[-.04em]">{value}</strong>{hint ? <p className="mt-1 text-[10px] text-muted-foreground">{hint}</p> : null}</article>;
}
