import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarCheck2, Clock3, TimerReset, UsersRound, XCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { PublicGuestShell, PublicInfoCard } from "@/components/public/PublicGuestShell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { humanError } from "@/lib/errors";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/waitlist/$token")({
  head: () => ({ meta: [{ title: "Waitlist offer — QuickServe" }] }),
  component: WaitlistOfferPage,
});

type WaitlistData = {
  restaurant: {
    name: string;
    slug: string;
    logo_url: string | null;
    timezone: string;
    currency: string;
  };
  waitlist: {
    customer_name: string;
    guest_count: number;
    desired_date: string;
    preferred_time: string | null;
    status: string;
    estimated_wait_minutes: number | null;
    offer_booking_at: string | null;
    offer_expires_at: string | null;
    offer_active: boolean;
    converted_booking_id: string | null;
    offer_accepted_at: string | null;
    offer_declined_at: string | null;
  };
  booking: {
    public_token: string;
    confirmation_code: string;
    booking_at: string;
    status: string;
  } | null;
};

type ResponseResult = {
  result: "accepted" | "declined" | "expired" | "unavailable";
  booking_public_token?: string;
  confirmation_code?: string;
  booking_at?: string;
};

function WaitlistOfferPage() {
  const { token } = Route.useParams();
  const { lang } = useI18n();
  const ar = lang === "ar";
  const qc = useQueryClient();
  const [now, setNow] = useState(() => Date.now());

  const query = useQuery<WaitlistData | null>({
    queryKey: ["public-waitlist-status", token],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_public_waitlist_status", { _token: token });
      if (error) throw error;
      return data as WaitlistData | null;
    },
    refetchInterval: 15_000,
  });

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(id);
  }, []);

  const respond = useMutation({
    mutationFn: async (response: "accept" | "decline") => {
      const { data, error } = await (supabase as any).rpc("respond_public_waitlist_offer", {
        _token: token,
        _response: response,
      });
      if (error) throw error;
      return data as ResponseResult;
    },
    onSuccess: async (result) => {
      await qc.invalidateQueries({ queryKey: ["public-waitlist-status", token] });
      if (result.result === "accepted") toast.success(ar ? "تم تأكيد الطاولة وحجزها لك" : "Your table has been confirmed");
      else if (result.result === "declined") toast.success(ar ? "تم رفض العرض وإعادتك لقائمة الانتظار" : "Offer declined and you are back on the waitlist");
      else if (result.result === "expired") toast.info(ar ? "انتهت مهلة العرض" : "This table offer has expired");
      else toast.info(ar ? "الطاولة لم تعد متاحة وتمت إعادتك لقائمة الانتظار" : "That table is no longer available; you are back on the waitlist");
    },
    onError: (error) => toast.error(humanError(error, lang)),
  });

  if (query.isPending) {
    return <main className="min-h-dvh bg-[#f6f7f9] p-4 sm:p-8"><Skeleton className="mx-auto h-[560px] max-w-2xl rounded-[24px]" /></main>;
  }
  if (query.isError || !query.data) {
    return <PublicGuestShell title={ar ? "طلب الانتظار غير موجود" : "Waitlist request not found"} description={ar ? "قد يكون الرابط غير صالح أو انتهت صلاحيته." : "This link may be invalid or no longer available."}><div /></PublicGuestShell>;
  }

  const { restaurant, waitlist, booking } = query.data;
  const offerAt = waitlist.offer_booking_at ? new Date(waitlist.offer_booking_at) : null;
  const expiry = waitlist.offer_expires_at ? new Date(waitlist.offer_expires_at).getTime() : null;
  const remainingMs = expiry ? Math.max(0, expiry - now) : 0;
  const remainingMinutes = Math.floor(remainingMs / 60_000);
  const remainingSeconds = Math.floor((remainingMs % 60_000) / 1_000);
  const active = Boolean(waitlist.offer_active && remainingMs > 0);
  const converted = waitlist.status === "converted" && booking?.public_token;

  const status = useMemo(() => {
    if (converted) return { label: ar ? "تم تأكيد الحجز" : "Reservation confirmed", tone: "green" as const };
    if (active) return { label: ar ? "عرض طاولة متاح الآن" : "Table offer available now", tone: "orange" as const };
    if (waitlist.status === "waiting") return { label: ar ? "على قائمة الانتظار" : "On the waitlist", tone: "blue" as const };
    return { label: ar ? "تم إغلاق الطلب" : "Request closed", tone: "red" as const };
  }, [active, ar, converted, waitlist.status]);

  return (
    <PublicGuestShell
      logoUrl={restaurant.logo_url}
      brandName={restaurant.name}
      eyebrow={ar ? "QuickServe · قائمة الانتظار" : "QuickServe · Waitlist"}
      title={active ? (ar ? "طاولتك جاهزة تقريباً" : "A table is ready for you") : converted ? (ar ? "تم حجز طاولتك" : "Your table is booked") : (ar ? "حالة قائمة الانتظار" : "Waitlist status")}
      description={active ? (ar ? "راجع الموعد المقترح ثم أكّد أو ارفض قبل انتهاء المهلة." : "Review the proposed time and accept or decline before the hold expires.") : (ar ? "يمكنك متابعة حالة طلبك من هذه الصفحة." : "You can follow your request status from this page.")}
      status={status}
      footer={<div className="text-center text-[10px] text-muted-foreground">{ar ? "يتم تحديث الحالة تلقائياً." : "Status updates automatically."}</div>}
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <PublicInfoCard icon={UsersRound} label={ar ? "عدد الضيوف" : "Guests"} value={String(waitlist.guest_count)} />
          <PublicInfoCard icon={CalendarCheck2} label={ar ? "التاريخ المطلوب" : "Requested date"} value={waitlist.desired_date} tone="blue" />
        </div>

        {active && offerAt ? (
          <section className="rounded-[18px] border border-orange-200 bg-orange-50/70 p-4 dark:border-orange-900/50 dark:bg-orange-950/20 sm:p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-[.14em] text-[#d94e07]">{ar ? "موعد الطاولة المقترح" : "Proposed table time"}</p>
                <strong className="mt-1 block font-display text-xl">
                  {new Intl.DateTimeFormat(ar ? "ar-JO" : "en-US", {
                    dateStyle: "medium",
                    timeStyle: "short",
                    timeZone: restaurant.timezone,
                  }).format(offerAt)}
                </strong>
              </div>
              <div className="rounded-2xl bg-card px-4 py-3 text-center shadow-sm">
                <p className="text-[9px] font-bold uppercase tracking-[.1em] text-muted-foreground">{ar ? "تنتهي المهلة خلال" : "Hold expires in"}</p>
                <strong className="mt-1 block font-mono text-xl tabular-nums text-[#e34d00]">{String(remainingMinutes).padStart(2, "0")}:{String(remainingSeconds).padStart(2, "0")}</strong>
              </div>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <Button className="h-11" disabled={respond.isPending} onClick={() => respond.mutate("accept")}>
                <CalendarCheck2 className="size-4" />{ar ? "تأكيد الطاولة" : "Accept table"}
              </Button>
              <Button className="h-11" variant="outline" disabled={respond.isPending} onClick={() => respond.mutate("decline")}>
                <XCircle className="size-4" />{ar ? "رفض العرض" : "Decline offer"}
              </Button>
            </div>
          </section>
        ) : converted && booking ? (
          <section className="rounded-[18px] border border-emerald-200 bg-emerald-50/70 p-5 dark:border-emerald-900/50 dark:bg-emerald-950/20">
            <p className="text-sm font-bold text-emerald-800 dark:text-emerald-200">{ar ? "تم تحويل طلب الانتظار إلى حجز مؤكد." : "Your waitlist request is now a confirmed reservation."}</p>
            <p className="mt-1 text-xs text-muted-foreground">{ar ? "رمز الحجز: " : "Confirmation code: "}<strong className="font-mono">{booking.confirmation_code}</strong></p>
            <Button asChild className="mt-4 w-full"><Link to="/booking/$token" params={{ token: booking.public_token }}>{ar ? "إدارة الحجز" : "Manage reservation"}</Link></Button>
          </section>
        ) : (
          <section className="rounded-[18px] border border-border/80 bg-muted/25 p-5 text-center">
            <TimerReset className="mx-auto size-7 text-muted-foreground" />
            <h2 className="mt-3 font-bold">{ar ? "نحتفظ بمكانك في الطابور" : "We’re keeping your place in line"}</h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              {waitlist.estimated_wait_minutes != null
                ? (ar ? `الوقت التقديري الحالي: حوالي ${waitlist.estimated_wait_minutes} دقيقة.` : `Current estimated wait: about ${waitlist.estimated_wait_minutes} minutes.`)
                : (ar ? "سيتواصل المطعم معك عندما تتوفر طاولة مناسبة." : "The restaurant will contact you when a suitable table becomes available.")}
            </p>
          </section>
        )}

        <Button asChild variant="outline" className="w-full"><Link to="/r/$slug" params={{ slug: restaurant.slug }}>{ar ? "عرض القائمة" : "View menu"}</Link></Button>
      </div>
    </PublicGuestShell>
  );
}
