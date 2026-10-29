import { useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ProfileSwitch } from "./NotificationSettings";
import {
  DEFAULT_PASSWORD_POLICY,
  policyConfigurationError,
  type PasswordPolicy,
} from "@/lib/password-policy";
import { useI18n } from "@/lib/i18n";
import { humanError } from "@/lib/errors";
import { toast } from "sonner";
export function SecuritySettings({
  restaurantId,
  canEdit,
  passwordAction,
}: {
  restaurantId: string | null;
  canEdit: boolean;
  passwordAction: ReactNode;
}) {
  const { lang } = useI18n(),
    ar = lang === "ar";
  const query = useQuery({
    queryKey: ["password-policy", restaurantId],
    enabled: !!restaurantId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("workspace_password_policies")
        .select("*")
        .eq("restaurant_id", restaurantId)
        .maybeSingle();
      if (error) throw error;
      return (data ?? DEFAULT_PASSWORD_POLICY) as PasswordPolicy;
    },
  });
  return (
    <section className="ps-card simple-security">
      <h2>{ar ? "الأمان" : "Security"}</h2>
      <p>
        {ar ? "إدارة كلمة المرور وقواعد كلمات المرور." : "Manage your password and password rules."}
      </p>
      <div className="simple-setting-row">
        <div>
          <h3>{ar ? "كلمة المرور" : "Password"}</h3>
          <p>{ar ? "تغيير كلمة مرور تسجيل الدخول." : "Change your sign-in password."}</p>
        </div>
        {passwordAction}
      </div>
      {restaurantId ? (
        query.isPending ? (
          <p role="status">{ar ? "جارٍ تحميل القواعد…" : "Loading password rules…"}</p>
        ) : query.isError ? (
          <div role="alert">
            <p>{ar ? "تعذر تحميل القواعد." : "Could not load password rules."}</p>
            <button className="ps-button" onClick={() => void query.refetch()}>
              {ar ? "إعادة المحاولة" : "Retry"}
            </button>
          </div>
        ) : (
          <PolicyForm
            key={`${restaurantId}:${query.dataUpdatedAt}`}
            policy={query.data ?? DEFAULT_PASSWORD_POLICY}
            restaurantId={restaurantId}
            canEdit={canEdit}
            ar={ar}
          />
        )
      ) : (
        <p>
          {ar ? "اختر مساحة عمل لإدارة القواعد." : "Select a workspace to manage password rules."}
        </p>
      )}
    </section>
  );
}
function PolicyForm({
  policy,
  restaurantId,
  canEdit,
  ar,
}: {
  policy: PasswordPolicy;
  restaurantId: string;
  canEdit: boolean;
  ar: boolean;
}) {
  const [draft, setDraft] = useState(policy),
    [busy, setBusy] = useState(false);
  const qc = useQueryClient();
  const { lang } = useI18n();
  const dirty = JSON.stringify(draft) !== JSON.stringify(policy);
  const error = policyConfigurationError(draft);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!canEdit || busy || error) return;
        setBusy(true);
        try {
          const { data, error } = await (supabase as any)
            .from("workspace_password_policies")
            .upsert({
              restaurant_id: restaurantId,
              block_username: draft.block_username,
              block_sequences: draft.block_sequences,
              min_length: draft.min_length,
              lowercase: draft.lowercase,
              uppercase: draft.uppercase,
              numbers: draft.numbers,
              special: draft.special,
            })
            .select("restaurant_id")
            .single();
          if (error) throw error;
          if (!data) throw new Error("No settings were saved");
          await qc.invalidateQueries({ queryKey: ["password-policy", restaurantId] });
          toast.success(ar ? "تم حفظ قواعد كلمة المرور" : "Password rules saved");
        } catch (error) {
          toast.error(humanError(error, lang));
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="simple-section-heading">
        <h3>{ar ? "قواعد كلمة المرور" : "Password rules"}</h3>
        <span className="simple-admin-badge">{ar ? "للمدير فقط" : "Admin only"}</span>
      </div>
      <p>
        {ar
          ? "تُطبق على تغييرات كلمة المرور من ملف QuickServe الشخصي."
          : "Applies to password changes from the QuickServe profile."}
      </p>
      <fieldset disabled={!canEdit || busy}>
        {(
          [
            [
              "block_username",
              "Block passwords similar to username",
              "منع كلمات المرور المشابهة لاسم المستخدم",
            ],
            [
              "block_sequences",
              "Block sequences like abcd or 1234",
              "منع التسلسلات مثل abcd أو 1234",
            ],
          ] as const
        ).map(([key, en, arabic]) => (
          <div className="simple-setting-row" key={key}>
            <span>{ar ? arabic : en}</span>
            <ProfileSwitch
              label={ar ? arabic : en}
              checked={draft[key]}
              disabled={!canEdit || busy}
              onChange={(v) => setDraft({ ...draft, [key]: v })}
            />
          </div>
        ))}
        <label className="simple-setting-row">
          {ar ? "الحد الأدنى لطول كلمة المرور" : "Minimum password length"}
          <span className="simple-number-control">
            <input
              aria-label={ar ? "الحد الأدنى للطول" : "Minimum password length"}
              type="number"
              min={8}
              max={64}
              step={1}
              required
              value={Number.isNaN(draft.min_length) ? "" : draft.min_length}
              onChange={(e) => setDraft({ ...draft, min_length: e.target.valueAsNumber })}
            />
            <small>{ar ? "حرفاً" : "characters"}</small>
          </span>
        </label>
        <div className="simple-section-heading">
          <h3>{ar ? "الأحرف المطلوبة" : "Required characters"}</h3>
        </div>
        <p>{ar ? "الحد الأدنى لكل نوع." : "Minimum count for each type."}</p>
        <div className="simple-count-grid">
          {(
            [
              ["lowercase", "Lowercase letters", "أحرف صغيرة"],
              ["uppercase", "Uppercase letters", "أحرف كبيرة"],
              ["numbers", "Numbers", "أرقام"],
              ["special", "Special characters", "رموز خاصة"],
            ] as const
          ).map(([key, en, arabic]) => (
            <label className="simple-setting-row" key={key}>
              {ar ? arabic : en}
              <input
                aria-label={ar ? arabic : en}
                type="number"
                min={0}
                max={16}
                step={1}
                required
                value={Number.isNaN(draft[key]) ? "" : draft[key]}
                onChange={(e) => setDraft({ ...draft, [key]: e.target.valueAsNumber })}
              />
            </label>
          ))}
        </div>
      </fieldset>
      {!canEdit ? (
        <p>
          {ar
            ? "يمكن لمدير المطعم فقط تغيير هذه القواعد."
            : "Only your restaurant administrator can change these rules."}
        </p>
      ) : (
        <>
          <p className="simple-policy-note">
            {ar
              ? "استعادة كلمات المرور وأدوات الإدارة تتبع قواعد مزود تسجيل الدخول."
              : "Password recovery and administrator tools follow the sign-in provider’s rules."}
          </p>
          {error ? (
            <p role="alert">{ar ? "تحقق من الطول (8–64) وعدد الأحرف (0–16)." : error}</p>
          ) : null}
          <footer className="simple-save-row">
            <button
              type="button"
              className="ps-button"
              disabled={!dirty || busy}
              onClick={() => setDraft(policy)}
            >
              {ar ? "إلغاء" : "Cancel"}
            </button>
            <button className="ps-button ps-primary" disabled={!dirty || busy || !!error}>
              {busy ? (ar ? "جارٍ الحفظ…" : "Saving…") : ar ? "حفظ التغييرات" : "Save changes"}
            </button>
          </footer>
        </>
      )}
    </form>
  );
}
