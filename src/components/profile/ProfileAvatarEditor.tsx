import { useEffect, useRef, useState } from "react";
import { Camera, Check, Loader2, RotateCcw } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useAccess } from "@/hooks/useSession";
import { supabase } from "@/integrations/supabase/client";
import { AVATAR_PRESETS, avatarPresetUrl } from "@/lib/avatar-presets";
import { humanError } from "@/lib/errors";
import { useI18n } from "@/lib/i18n";
import { uploadProfileImage } from "@/lib/storage";
import { cn } from "@/lib/utils";

export function ProfileAvatarEditor({ restaurantId }: { restaurantId: string | null }) {
  const { lang } = useI18n();
  const access = useAccess();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const membership = restaurantId ? access.membershipFor(restaurantId) : (access.data ?? []).find((row) => row.restaurant_id) ?? null;
  const [avatarUrl, setAvatarUrl] = useState<string | null>(membership?.avatar_url ?? null);
  const [preset, setPreset] = useState<string | null>(membership?.avatar_preset ?? null);
  const [busy, setBusy] = useState(false);
  const [savingPreset, setSavingPreset] = useState<string | null>(null);

  useEffect(() => {
    setAvatarUrl(membership?.avatar_url ?? null);
    setPreset(membership?.avatar_preset ?? null);
  }, [membership?.avatar_preset, membership?.avatar_url, membership?.id]);

  useEffect(() => {
    if (membership) return;
    void supabase.auth.getUser().then(({ data }) => {
      const metadata = data.user?.user_metadata ?? {};
      setAvatarUrl(typeof metadata.avatar_url === "string" ? metadata.avatar_url : null);
      setPreset(typeof metadata.avatar_preset === "string" ? metadata.avatar_preset : null);
    });
  }, [membership]);

  const preview = avatarUrl || avatarPresetUrl(preset);

  async function refreshIdentity() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["staff", "memberships"] }),
      queryClient.invalidateQueries({ queryKey: ["auth", "session"] }),
      queryClient.invalidateQueries({ queryKey: ["platform"] }),
    ]);
  }

  async function persist(nextUrl: string | null, nextPreset: string | null) {
    const previousUrl = avatarUrl;
    const previousPreset = preset;
    setAvatarUrl(nextUrl);
    setPreset(nextPreset);
    setSavingPreset(nextPreset);
    setBusy(true);
    try {
      if (membership) {
        const { error: rpcError } = await (supabase as any).rpc("update_own_avatar", {
          _avatar_url: nextUrl,
          _avatar_preset: nextPreset,
        });
        if (rpcError) throw rpcError;

        // The membership is QuickServe's authoritative avatar source. Auth metadata is
        // convenience-only, so a transient metadata sync error must not make a successful
        // membership update look like a failed avatar selection.
        const { error: metadataError } = await supabase.auth.updateUser({
          data: { avatar_url: nextUrl, avatar_preset: nextPreset },
        });
        if (metadataError) console.warn("Avatar metadata sync skipped:", metadataError.message);
      } else {
        const { error: authError } = await supabase.auth.updateUser({
          data: { avatar_url: nextUrl, avatar_preset: nextPreset },
        });
        if (authError) throw authError;
      }

      await refreshIdentity();
      toast.success(lang === "ar" ? "تم تحديث الصورة الشخصية" : "Profile picture updated");
      return true;
    } catch (error) {
      setAvatarUrl(previousUrl);
      setPreset(previousPreset);
      toast.error(humanError(error, lang));
      return false;
    } finally {
      setBusy(false);
      setSavingPreset(null);
    }
  }

  async function upload(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) throw error ?? new Error("Authentication required");
      const url = await uploadProfileImage(data.user.id, file);
      await persist(url, null);
    } catch (error) {
      toast.error(humanError(error, lang));
      setBusy(false);
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-muted/20 p-4 sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <span className="grid size-24 shrink-0 place-items-center overflow-hidden rounded-[28px] border border-border bg-card text-2xl font-black shadow-sm">
          {preview ? <img src={preview} alt="" className="size-full object-cover" /> : <Camera className="size-7 text-muted-foreground" />}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-bold">{lang === "ar" ? "الصورة الشخصية" : "Profile picture"}</h3>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">{lang === "ar" ? "ارفع صورتك أو اختر شخصية كرتونية احترافية حسب الدور. الاختيار يُحفظ مباشرة ويظهر في الحساب وشريط التطبيق وقائمة الفريق." : "Upload your photo or choose a professional cartoon role avatar. Your selection is saved immediately and appears across your account, app header, and team identity."}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" variant="outline" disabled={busy} onClick={() => inputRef.current?.click()}><Camera className="size-4" />{lang === "ar" ? "رفع صورة" : "Upload Photo"}</Button>
            {(avatarUrl || preset) ? <Button type="button" variant="ghost" disabled={busy} onClick={() => void persist(null, null)}><RotateCcw className="size-4" />{lang === "ar" ? "إزالة" : "Remove"}</Button> : null}
          </div>
        </div>
      </div>

      <div className="mt-5 border-t border-border pt-5">
        <div className="flex flex-wrap items-end justify-between gap-2"><div><p className="text-sm font-bold">{lang === "ar" ? "اختر شخصية" : "Choose an avatar"}</p><p className="mt-1 text-[11px] text-muted-foreground">{lang === "ar" ? "انقر مرة واحدة للاختيار والحفظ." : "Click once to select and save."}</p></div>{busy ? <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"><Loader2 className="size-3.5 animate-spin" />{lang === "ar" ? "جارٍ الحفظ…" : "Saving…"}</span> : null}</div>
        <div className="mt-4 grid grid-cols-2 gap-3 min-[480px]:grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 2xl:grid-cols-6">
          {AVATAR_PRESETS.map((item) => {
            const selected = preset === item.id && !avatarUrl;
            const saving = savingPreset === item.id;
            return <button
              key={item.id}
              type="button"
              disabled={busy}
              onClick={() => void persist(null, item.id)}
              aria-pressed={selected}
              aria-label={`${lang === "ar" ? "اختيار" : "Choose"} ${item.label}`}
              className={cn(
                "group relative overflow-hidden rounded-2xl border bg-card p-2 text-start transition duration-150 hover:-translate-y-0.5 hover:border-[#ff5a0a]/45 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff5a0a]/35 disabled:cursor-wait",
                selected ? "border-[#ff5a0a] ring-2 ring-[#ff5a0a]/15" : "border-border",
                busy && !saving && "opacity-55",
              )}
            >
              <div className="relative aspect-square overflow-hidden rounded-xl bg-muted"><img src={item.url} alt="" className="size-full object-cover" />{selected ? <span className="absolute end-2 top-2 grid size-6 place-items-center rounded-full bg-[#ff5a0a] text-white shadow"><Check className="size-3.5" /></span> : null}{saving ? <span className="absolute inset-0 grid place-items-center bg-background/60 backdrop-blur-[1px]"><Loader2 className="size-5 animate-spin text-[#ff5a0a]" /></span> : null}</div>
              <span className="mt-2 block truncate px-0.5 text-[11px] font-bold text-foreground">{item.label}</span>
              <span className="mt-0.5 block truncate px-0.5 text-[9px] font-medium text-muted-foreground">{item.role}</span>
            </button>;
          })}
        </div>
      </div>
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(event) => void upload(event.target.files?.[0])} />
    </div>
  );
}
