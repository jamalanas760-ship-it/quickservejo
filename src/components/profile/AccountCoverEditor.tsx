import { useEffect, useRef, useState } from "react";
import { Camera, Loader2, Minus, Plus, RotateCcw, Trash2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useAccess } from "@/hooks/useSession";
import { supabase } from "@/integrations/supabase/client";
import { humanError } from "@/lib/errors";
import { useI18n } from "@/lib/i18n";
import { uploadProfileCover } from "@/lib/storage";
import { cn } from "@/lib/utils";

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

type CoverState = { url: string | null; x: number; y: number; zoom: number };

export function AccountCoverEditor({ restaurantId }: { restaurantId: string | null }) {
  const { lang } = useI18n();
  const ar = lang === "ar";
  const access = useAccess();
  const queryClient = useQueryClient();
  const membership = restaurantId ? access.membershipFor(restaurantId) : (access.data ?? []).find((row) => row.restaurant_id) ?? null;
  const inputRef = useRef<HTMLInputElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; x: number; y: number } | null>(null);
  const stateRef = useRef<CoverState>({ url: null, x: 50, y: 50, zoom: 100 });
  const [state, setState] = useState<CoverState>({ url: membership?.cover_image_url ?? null, x: Number(membership?.cover_position_x ?? 50), y: Number(membership?.cover_position_y ?? 50), zoom: Number(membership?.cover_zoom ?? 100) });
  const [busy, setBusy] = useState(false);

  function setCover(next: CoverState) {
    stateRef.current = next;
    setState(next);
  }

  useEffect(() => {
    setCover({ url: membership?.cover_image_url ?? null, x: Number(membership?.cover_position_x ?? 50), y: Number(membership?.cover_position_y ?? 50), zoom: Number(membership?.cover_zoom ?? 100) });
  }, [membership?.cover_image_url, membership?.cover_position_x, membership?.cover_position_y, membership?.cover_zoom, membership?.id]);

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["staff", "memberships"] }),
      queryClient.invalidateQueries({ queryKey: ["platform", "staff"] }),
      queryClient.invalidateQueries({ queryKey: ["auth", "session"] }),
    ]);
  }

  async function persist(next = stateRef.current) {
    if (!membership) return false;
    setBusy(true);
    try {
      const { error } = await (supabase as any).rpc("update_own_cover", {
        _staff_id: membership.id,
        _cover_image_url: next.url,
        _position_x: next.x,
        _position_y: next.y,
        _zoom: next.zoom,
      });
      if (error) throw error;
      await refresh();
      toast.success(ar ? "تم حفظ غلاف الحساب" : "Account cover saved");
      return true;
    } catch (error) {
      toast.error(humanError(error, lang));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function upload(file: File | undefined) {
    if (!file || !membership) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) throw error ?? new Error("Authentication required");
      const url = await uploadProfileCover(data.user.id, file);
      const next = { url, x: 50, y: 50, zoom: 100 };
      setCover(next);
      await persist(next);
    } catch (error) {
      toast.error(humanError(error, lang));
      setBusy(false);
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (!state.url || busy) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, x: stateRef.current.x, y: stateRef.current.y };
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    const frame = frameRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !frame) return;
    const rect = frame.getBoundingClientRect();
    const next = {
      ...stateRef.current,
      x: clamp(drag.x - ((event.clientX - drag.startX) / Math.max(1, rect.width)) * 100, 0, 100),
      y: clamp(drag.y - ((event.clientY - drag.startY) / Math.max(1, rect.height)) * 100, 0, 100),
    };
    setCover(next);
  }

  function onPointerUp(event: React.PointerEvent<HTMLDivElement>) {
    if (!dragRef.current || dragRef.current.pointerId !== event.pointerId) return;
    dragRef.current = null;
    void persist();
  }

  function changeZoom(delta: number) {
    const next = { ...stateRef.current, zoom: clamp(stateRef.current.zoom + delta, 100, 220) };
    setCover(next);
    void persist(next);
  }

  function reset() {
    const next = { ...stateRef.current, x: 50, y: 50, zoom: 100 };
    setCover(next);
    void persist(next);
  }

  function remove() {
    const next = { url: null, x: 50, y: 50, zoom: 100 };
    setCover(next);
    void persist(next);
  }

  if (!membership) return null;

  return <section className="qs-card overflow-hidden">
    <div className="border-b border-border px-5 py-4 sm:px-6"><h2 className="text-sm font-bold">{ar ? "غلاف الحساب" : "Account cover"}</h2><p className="mt-1 text-xs text-muted-foreground">{ar ? "هذا الغلاف خاص بحسابك فقط ولا يغيّر هوية المطعم. اسحب الصورة داخل الإطار لاختيار الجزء الظاهر." : "This cover belongs only to your account and does not change restaurant branding. Drag the image inside the frame to choose what is visible."}</p></div>
    <div className="p-4 sm:p-6">
      <div ref={frameRef} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={() => { dragRef.current = null; }} className={cn("relative h-52 touch-none overflow-hidden rounded-[24px] border border-border bg-[radial-gradient(circle_at_20%_0%,rgba(255,90,10,.16),transparent_58%)] sm:h-64", state.url && "cursor-grab active:cursor-grabbing")}>
        {state.url ? <img src={state.url} alt="" draggable={false} className="pointer-events-none absolute inset-0 size-full select-none object-cover transition-transform duration-150" style={{ objectPosition: `${state.x}% ${state.y}%`, transform: `scale(${state.zoom / 100})` }} /> : <div className="absolute inset-0 grid place-items-center text-center"><div><Camera className="mx-auto size-8 text-muted-foreground" /><p className="mt-3 text-sm font-bold">{ar ? "أضف غلافاً لحسابك" : "Add your account cover"}</p><p className="mt-1 text-xs text-muted-foreground">{ar ? "JPG أو PNG أو WebP حتى 5MB" : "JPG, PNG or WebP up to 5MB"}</p></div></div>}
        <div className="absolute inset-x-3 bottom-3 flex items-center justify-between gap-2">
          <Button type="button" size="sm" variant="secondary" className="bg-background/90 backdrop-blur" disabled={busy} onClick={(event) => { event.stopPropagation(); inputRef.current?.click(); }}><Camera className="size-4" />{state.url ? (ar ? "استبدال" : "Replace") : (ar ? "رفع غلاف" : "Upload cover")}</Button>
          {state.url ? <div className="flex items-center gap-1 rounded-xl border border-border bg-background/90 p-1 shadow-sm backdrop-blur" onPointerDown={(event) => event.stopPropagation()}>
            <button type="button" disabled={busy || state.zoom <= 100} onClick={() => changeZoom(-10)} className="grid size-8 place-items-center rounded-lg hover:bg-muted disabled:opacity-40" aria-label={ar ? "تصغير" : "Zoom out"}><Minus className="size-4" /></button>
            <span className="min-w-12 text-center text-[10px] font-bold tabular-nums">{Math.round(state.zoom)}%</span>
            <button type="button" disabled={busy || state.zoom >= 220} onClick={() => changeZoom(10)} className="grid size-8 place-items-center rounded-lg hover:bg-muted disabled:opacity-40" aria-label={ar ? "تكبير" : "Zoom in"}><Plus className="size-4" /></button>
            <button type="button" disabled={busy} onClick={reset} className="grid size-8 place-items-center rounded-lg hover:bg-muted" aria-label={ar ? "إعادة الضبط" : "Reset framing"}><RotateCcw className="size-4" /></button>
            <button type="button" disabled={busy} onClick={remove} className="grid size-8 place-items-center rounded-lg text-destructive hover:bg-destructive/10" aria-label={ar ? "إزالة الغلاف" : "Remove cover"}><Trash2 className="size-4" /></button>
          </div> : null}
        </div>
        {busy ? <div className="pointer-events-none absolute inset-0 grid place-items-center bg-background/25 backdrop-blur-[1px]"><span className="grid size-10 place-items-center rounded-full bg-background shadow"><Loader2 className="size-5 animate-spin text-[#ff5a0a]" /></span></div> : null}
      </div>
      <p className="mt-3 text-[11px] text-muted-foreground">{ar ? "اسحب داخل الصورة لتغيير موضعها. استخدم + و− داخل الصورة للتكبير أو التصغير." : "Drag directly on the image to reposition it. Use the in-image + and − controls to zoom."}</p>
    </div>
    <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(event) => void upload(event.target.files?.[0])} />
  </section>;
}
