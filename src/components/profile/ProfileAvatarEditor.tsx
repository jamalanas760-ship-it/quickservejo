import { useEffect, useRef, useState } from "react";
import { Camera, Check, RotateCcw } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useAccess } from "@/hooks/useSession";
import { supabase } from "@/integrations/supabase/client";
import { AVATAR_PRESETS, avatarPresetUrl } from "@/lib/avatar-presets";
import { humanError } from "@/lib/errors";
import { useI18n } from "@/lib/i18n";
import { uploadRestaurantImage } from "@/lib/storage";
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

  useEffect(() => {
    setAvatarUrl(membership?.avatar_url ?? null);
    setPreset(membership?.avatar_preset ?? null);
  }, [membership?.avatar_preset, membership?.avatar_url, membership?.id]);

  const preview = avatarUrl || avatarPresetUrl(preset);

  async function persist(nextUrl: string | null, nextPreset: string | null) {
    setBusy(true);
    try {
      if (restaurantId) {
        const { error } = await (supabase as any).rpc("update_own_avatar", { _avatar_url: nextUrl, _avatar_preset: nextPreset });
        if (error) throw error;
      }
      const authAvatar = nextUrl || avatarPresetUrl(nextPreset);
      const { error: authError } = await supabase.auth.updateUser({ data: { avatar_url: authAvatar, avatar_preset: nextPreset } });
      if (authError) throw authError;
      setAvatarUrl(nextUrl); setPreset(nextPreset);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["staff", "memberships"] }),
        queryClient.invalidateQueries({ queryKey: ["auth", "session"] }),
      ]);
      toast.success(lang === "ar" ? "تم تحديث الصورة الشخصية" : "Profile picture updated");
    } catch (error) {
      toast.error(humanError(error, lang));
    } finally { setBusy(false); }
  }

  async function upload(file: File | undefined) {
    if (!file || !restaurantId) return;
    setBusy(true);
    try {
      const url = await uploadRestaurantImage(restaurantId, "avatar", file);
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
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{lang === "ar" ? "ارفع صورتك أو اختر صورة رمزية احترافية. ستظهر في الحساب وشريط التطبيق وقوائم الفريق." : "Upload your photo or choose a professional avatar. It appears in your account, app header, and team identity."}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" variant="outline" disabled={busy || !restaurantId} onClick={() => inputRef.current?.click()}><Camera className="size-4" />{lang === "ar" ? "رفع صورة" : "Upload Photo"}</Button>
            {(avatarUrl || preset) ? <Button type="button" variant="ghost" disabled={busy} onClick={() => void persist(null, null)}><RotateCcw className="size-4" />{lang === "ar" ? "إزالة" : "Remove"}</Button> : null}
          </div>
          {!restaurantId ? <p className="mt-2 text-[11px] text-muted-foreground">{lang === "ar" ? "اربط الحساب بمطعم لرفع صورة. يمكنك استخدام صورة رمزية الآن." : "Link the account to a restaurant to upload a photo. Preset avatars are available now."}</p> : null}
        </div>
      </div>

      <div className="mt-5">
        <p className="text-xs font-bold text-muted-foreground">{lang === "ar" ? "أو اختر صورة رمزية" : "Or choose an avatar"}</p>
        <div className="mt-2 grid grid-cols-4 gap-2 sm:grid-cols-8">
          {AVATAR_PRESETS.map((item) => <button key={item.id} type="button" disabled={busy} onClick={() => void persist(null, item.id)} aria-label={`${lang === "ar" ? "اختيار" : "Choose"} ${item.label}`} className={cn("relative aspect-square overflow-hidden rounded-2xl border-2 bg-card transition hover:-translate-y-0.5", preset === item.id && !avatarUrl ? "border-[#ff5a0a] ring-2 ring-[#ff5a0a]/15" : "border-transparent")}><img src={item.url} alt="" className="size-full object-cover" />{preset === item.id && !avatarUrl ? <span className="absolute end-1 top-1 grid size-5 place-items-center rounded-full bg-[#ff5a0a] text-white"><Check className="size-3" /></span> : null}</button>)}
        </div>
      </div>
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(event) => void upload(event.target.files?.[0])} />
    </div>
  );
}
