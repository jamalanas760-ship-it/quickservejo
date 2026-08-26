import type { Language } from "@/lib/i18n";

type Msg = { en: string; ar: string };

const FRIENDLY: Array<{ match: RegExp; msg: Msg }> = [
  {
    match: /duplicate key.*restaurants_slug|restaurants_slug_key/i,
    msg: {
      en: "This restaurant link (slug) is already in use. Try another one.",
      ar: "رابط المطعم (slug) مستخدم بالفعل. جرّب رابطاً آخر.",
    },
  },
  {
    match: /duplicate key|23505/i,
    msg: { en: "This record already exists.", ar: "هذا السجل موجود بالفعل." },
  },
  {
    match: /row-level security|permission denied|42501/i,
    msg: {
      en: "You don't have permission to do that.",
      ar: "ليست لديك صلاحية للقيام بذلك.",
    },
  },
  {
    match: /invalid login credentials/i,
    msg: { en: "Wrong email or password.", ar: "البريد الإلكتروني أو كلمة المرور غير صحيحة." },
  },
  {
    match: /email not confirmed/i,
    msg: {
      en: "Your email isn't confirmed yet. Check your inbox.",
      ar: "لم يتم تأكيد بريدك الإلكتروني بعد. تحقق من صندوق الوارد.",
    },
  },
  {
    match: /user already registered|already been registered/i,
    msg: {
      en: "An account with this email already exists. Sign in instead.",
      ar: "يوجد حساب بهذا البريد الإلكتروني. سجّل الدخول بدلاً من ذلك.",
    },
  },
  {
    match: /weak_password|known to be weak|pwned/i,
    msg: {
      en: "That password appears in known breach lists. Please choose a stronger, unique password.",
      ar: "كلمة المرور هذه ظهرت في قوائم كلمات مرور مسربة. اختر كلمة مرور أقوى وفريدة.",
    },
  },
  {
    match: /password should be at least|at least 6 characters/i,
    msg: {
      en: "Password is too short. Use at least 8 characters.",
      ar: "كلمة المرور قصيرة جداً. استخدم 8 أحرف على الأقل.",
    },
  },
  {
    match: /rate limit|too many requests/i,
    msg: {
      en: "Too many attempts. Please wait a moment and try again.",
      ar: "محاولات كثيرة. انتظر قليلاً ثم أعد المحاولة.",
    },
  },
  {
    match: /failed to fetch|network|typeerror: load failed/i,
    msg: {
      en: "Network problem. Check your connection and try again.",
      ar: "مشكلة في الشبكة. تحقق من اتصالك وأعد المحاولة.",
    },
  },
  {
    match: /payload too large|exceeded the maximum allowed size/i,
    msg: {
      en: "That file is too large. Maximum size is 5 MB.",
      ar: "هذا الملف كبير جداً. الحجم الأقصى 5 ميغابايت.",
    },
  },
];

/** Convert any thrown value into a human message. Never surface raw SQL codes. */
export function humanError(error: unknown, lang: Language = "en"): string {
  const raw =
    typeof error === "string"
      ? error
      : error && typeof error === "object"
        ? [
            (error as { message?: string }).message,
            (error as { details?: string }).details,
            (error as { code?: string }).code,
          ]
            .filter(Boolean)
            .join(" ")
        : "";

  for (const entry of FRIENDLY) {
    if (entry.match.test(raw)) return entry.msg[lang];
  }
  if (raw && raw.length < 160 && !/^\d+$/.test(raw)) return raw;
  return lang === "ar" ? "حدث خطأ ما. أعد المحاولة." : "Something went wrong. Please try again.";
}
