import { useEffect, useRef, useState } from "react";
import { Camera, Check, Loader2, RotateCcw, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { useAccess } from "@/hooks/useSession";
import { supabase } from "@/integrations/supabase/client";
import { AVATAR_PRESETS, avatarPresetUrl, resolveAvatarPresetId, roleAvatarUrl } from "@/lib/avatar-presets";
import { humanError } from "@/lib/errors";
import { useI18n } from "@/lib/i18n";
import { uploadProfileImage } from "@/lib/storage";

type AvatarFilter = "all" | "male" | "female" | "owner" | "manager" | "hr" | "chef" | "service";
const SERVICE_ROLES = new Set(["server", "cashier", "host", "kitchen"]);

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
  const [draftPreset, setDraftPreset] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [savingPreset, setSavingPreset] = useState<string | null>(null);
  const [filter, setFilter] = useState<AvatarFilter>("all");
  const ar = lang === "ar";

  useEffect(() => {
    setAvatarUrl(membership?.avatar_url ?? null);
    setPreset(membership?.avatar_preset ?? null);
    setDraftPreset(null);
  }, [membership?.avatar_preset, membership?.avatar_url, membership?.id]);

  useEffect(() => {
    if (membership) return;
    void supabase.auth.getUser().then(({ data }) => {
      const metadata = data.user?.user_metadata ?? {};
      setAvatarUrl(typeof metadata.avatar_url === "string" ? metadata.avatar_url : null);
      setPreset(typeof metadata.avatar_preset === "string" ? metadata.avatar_preset : null);
      setDraftPreset(null);
    });
  }, [membership]);

  const filtered = AVATAR_PRESETS.filter((item) => {
    if (filter === "all") return true;
    if (filter === "male" || filter === "female") return item.gender === filter;
    if (filter === "service") return SERVICE_ROLES.has(item.role);
    return item.role === filter;
  });

  const selectedId = draftPreset ?? (!avatarUrl ? resolveAvatarPresetId(preset) : null);
  const preview = draftPreset ? avatarPresetUrl(draftPreset) : avatarUrl || avatarPresetUrl(preset) || roleAvatarUrl(membership?.role);
  const draftDirty = Boolean(draftPreset && (draftPreset !== preset || avatarUrl));

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

  async function applyAvatar() {
    if (!draftPreset || !draftDirty) return;
    const applied = await persist(null, draftPreset);
    if (applied) setDraftPreset(null);
  }

  async function upload(file: File | undefined) {
    if (!file) return;
    setDraftPreset(null);
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

  const filters: Array<[AvatarFilter, string, string]> = [
    ["all", "All", "الكل"],
    ["male", "Men", "رجال"],
    ["female", "Women", "نساء"],
    ["owner", "Owner", "المالك"],
    ["manager", "Manager", "المدير"],
    ["hr", "HR", "الموارد البشرية"],
    ["chef", "Chef", "الطاهي"],
    ["service", "Service", "الخدمة"],
  ];

  return (
    <div className="ps-avatar-editor">
      <h2>{ar ? "الصورة الشخصية" : "Profile photo"}</h2>
      <p>
        {ar
          ? "ارفع صورتك أو اختر شخصية كرتونية. لن يتغير حسابك حتى تضغط تطبيق."
          : "Upload your photo or choose a cartoon avatar. Nothing changes until you tap Apply."}
      </p>

      <div className="ps-avatar-intro">
        <span className={draftPreset ? "is-preview" : undefined}>
          {preview ? (
            <img src={preview} alt={ar ? "معاينة الصورة الشخصية" : "Profile picture preview"} />
          ) : (
            <Camera className="size-7 text-muted-foreground" />
          )}
          {draftPreset ? <small className="ps-avatar-preview-badge">{ar ? "معاينة" : "Preview"}</small> : null}
        </span>
        <div>
          <button className="ps-button" type="button" disabled={busy} onClick={() => inputRef.current?.click()}>
            <Camera />
            {ar ? "رفع صورة" : "Upload photo"}
          </button>
          <button
            className="ps-button border-transparent"
            type="button"
            disabled={busy || !(avatarUrl || preset)}
            onClick={() => {
              setDraftPreset(null);
              void persist(null, null);
            }}
          >
            <RotateCcw />
            {ar ? "إزالة" : "Remove"}
          </button>
        </div>
      </div>

      <div className="ps-avatar-picker">
        <div className="ps-avatar-toolbar">
          <div>
            <h3>{ar ? "اختر شخصيتك" : "Choose your avatar"}</h3>
            <small>{AVATAR_PRESETS.length} {ar ? "خياراً" : "options"}</small>
          </div>
          <div className="ps-avatar-filters" aria-label={ar ? "فلاتر الصور" : "Avatar filters"}>
            {filters.map(([key, en, arabic]) => (
              <button
                key={key}
                type="button"
                className="ps-chip"
                aria-pressed={filter === key}
                onClick={() => setFilter(key)}
              >
                {ar ? arabic : en}
              </button>
            ))}
          </div>
        </div>

        <div className="ps-avatar-grid" role="list" aria-label={ar ? "صور الشخصيات" : "Avatar choices"}>
          {filtered.map((item) => {
            const selected = selectedId === item.id;
            return (
              <button
                key={item.id}
                type="button"
                className="ps-avatar-choice"
                disabled={busy}
                onClick={() => setDraftPreset(item.id)}
                aria-pressed={selected}
                aria-label={`${ar ? "اختيار" : "Choose"} ${item.label}`}
                title={item.label}
                role="listitem"
              >
                <img src={item.url} alt="" width="256" height="256" loading="lazy" />
                {selected ? (
                  <span className="ps-avatar-check" aria-hidden="true">
                    {savingPreset === item.id ? <Loader2 className="animate-spin" /> : <Check />}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        <div className="ps-avatar-footer">
          <span role="status">
            {busy
              ? ar
                ? "جارٍ الحفظ…"
                : "Saving…"
              : draftPreset
                ? ar
                  ? "هذه معاينة فقط. اضغط تطبيق للحفظ."
                  : "Preview only. Tap Apply to save it."
                : ar
                  ? "المس أي شخصية لمعاينتها."
                  : "Tap any avatar to preview it."}
          </span>
          {draftPreset ? (
            <div className="ps-avatar-actions">
              <button type="button" className="ps-button border-transparent" disabled={busy} onClick={() => setDraftPreset(null)}>
                <X />
                {ar ? "الاحتفاظ بالحالي" : "Keep current"}
              </button>
              <button type="button" className="ps-button" disabled={busy || !draftDirty} onClick={() => void applyAvatar()}>
                {busy ? <Loader2 className="animate-spin" /> : <Check />}
                {ar ? "تطبيق الشخصية" : "Apply avatar"}
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
