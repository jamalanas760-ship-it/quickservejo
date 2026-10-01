import { useEffect, useRef, useState } from "react";
import { Camera, Check, Loader2, RotateCcw } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { useAccess } from "@/hooks/useSession";
import { supabase } from "@/integrations/supabase/client";
import { AVATAR_PRESETS, avatarPresetUrl } from "@/lib/avatar-presets";
import { humanError } from "@/lib/errors";
import { useI18n } from "@/lib/i18n";
import { uploadProfileImage } from "@/lib/storage";

export function ProfileAvatarEditor({ restaurantId }: { restaurantId: string | null }) {
  const { lang } = useI18n();
  const access = useAccess();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const membership = restaurantId
    ? access.membershipFor(restaurantId)
    : ((access.data ?? []).find((row) => row.restaurant_id) ?? null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(membership?.avatar_url ?? null);
  const [preset, setPreset] = useState<string | null>(membership?.avatar_preset ?? null);
  const [busy, setBusy] = useState(false);
  const [savingPreset, setSavingPreset] = useState<string | null>(null);
  const [roleFilter, setRoleFilter] = useState<"all" | (typeof AVATAR_PRESETS)[number]["role"]>(
    "all",
  );
  const [page, setPage] = useState(0);
  const ar = lang === "ar";
  const filtered = AVATAR_PRESETS.filter(
    (item) => roleFilter === "all" || item.role === roleFilter,
  );
  const visible = filtered.slice(page * 6, page * 6 + 6);

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
      queryClient.invalidateQueries({ queryKey: ["workspace", "members"] }),
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

        // The tenant membership is QuickServe's authoritative avatar source. Auth metadata
        // is convenience-only, so a secondary metadata sync issue never turns a successful
        // self-service avatar update into a false permission failure.
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
    <div className="ps-avatar-editor">
      <h2>{ar ? "الصورة الشخصية" : "Profile photo"}</h2>
      <p>
        {ar
          ? "ارفع صورتك أو اختر صورة احترافية. تظهر في حسابك وشريط التطبيق والفريق."
          : "Upload your photo or choose a professional avatar. This will appear in your account, app header, home page, and team identity."}
      </p>
      <div className="ps-avatar-intro">
        <span>
          {preview ? (
            <img src={preview} alt={ar ? "صورتك الشخصية" : "Your profile photo"} />
          ) : (
            <Camera className="size-7 text-muted-foreground" />
          )}
        </span>
        <div>
          <button
            className="ps-button"
            type="button"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            <Camera />
            {ar ? "رفع صورة" : "Upload photo"}
          </button>
          <button
            className="ps-button border-transparent"
            type="button"
            disabled={busy || !(avatarUrl || preset)}
            onClick={() => void persist(null, null)}
          >
            <RotateCcw />
            {ar ? "إزالة" : "Remove"}
          </button>
        </div>
      </div>
      <div className="ps-avatar-picker">
        <div className="ps-avatar-toolbar">
          <h3>{ar ? "اختر شخصية" : "Choose an avatar"}</h3>
          <div className="ps-avatar-filters" aria-label={ar ? "فلاتر الصور" : "Avatar filters"}>
            {(
              [
                ["all", "All", "الكل"],
                ["owner", "Owner", "المالك"],
                ["manager", "Manager", "المدير"],
                ["chef", "Chef", "الطاهي"],
              ] as const
            ).map(([key, en, arabic]) => (
              <button
                key={key}
                type="button"
                className="ps-chip"
                aria-pressed={roleFilter === key}
                onClick={() => {
                  setRoleFilter(key);
                  setPage(0);
                }}
              >
                {ar ? arabic : en}
              </button>
            ))}
          </div>
        </div>
        <div className="ps-avatar-grid">
          {visible.map((item) => (
            <button
              key={item.id}
              type="button"
              className="ps-avatar-choice"
              disabled={busy}
              onClick={() => void persist(null, item.id)}
              aria-pressed={preset === item.id && !avatarUrl}
              aria-label={`${ar ? "اختيار" : "Choose"} ${item.label}`}
              title={item.label}
            >
              <img src={item.url} alt={item.label} width="320" height="320" loading="lazy" />
              {preset === item.id && !avatarUrl ? (
                <span>
                  <Check />
                </span>
              ) : null}
              {savingPreset === item.id ? (
                <span>
                  <Loader2 className="animate-spin" />
                </span>
              ) : null}
            </button>
          ))}
        </div>
        <div className="ps-avatar-footer">
          <span role="status">
            {busy
              ? ar
                ? "جارٍ الحفظ…"
                : "Saving…"
              : ar
                ? "يُحفظ الاختيار مباشرة."
                : "Your selection saves immediately."}
          </span>
          {filtered.length > 6 ? (
            <div className="flex gap-2">
              <button
                type="button"
                className="ps-chip"
                disabled={page === 0 || busy}
                onClick={() => setPage((n) => n - 1)}
              >
                {ar ? "السابق" : "Previous"}
              </button>
              <button
                type="button"
                className="ps-chip"
                disabled={(page + 1) * 6 >= filtered.length || busy}
                onClick={() => setPage((n) => n + 1)}
              >
                {ar ? "المزيد" : "More avatars"}
              </button>
            </div>
          ) : null}
        </div>
      </div>
      <input
        ref={inputRef}
        aria-label={ar ? "رفع صورة شخصية" : "Upload profile image"}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(event) => void upload(event.target.files?.[0])}
      />
    </div>
  );
}
