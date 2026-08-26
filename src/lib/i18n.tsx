import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type Language = "en" | "ar";

const STORAGE_KEY = "quickserve.language";

type Dict = Record<string, { en: string; ar: string }>;

const dict: Dict = {
  "brand.tagline": {
    en: "QR ordering platform for restaurants",
    ar: "منصة الطلب عبر QR للمطاعم",
  },
  "nav.signIn": { en: "Staff sign in", ar: "دخول الموظفين" },
  "nav.dashboard": { en: "Dashboard", ar: "لوحة التحكم" },
  "nav.signOut": { en: "Sign out", ar: "تسجيل الخروج" },
  "auth.title": { en: "Sign in to QuickServe", ar: "تسجيل الدخول إلى QuickServe" },
  "auth.subtitle": {
    en: "For restaurant staff and platform administrators.",
    ar: "لموظفي المطاعم ومسؤولي المنصة.",
  },
  "auth.email": { en: "Email", ar: "البريد الإلكتروني" },
  "auth.password": { en: "Password", ar: "كلمة المرور" },
  "auth.signIn": { en: "Sign in", ar: "تسجيل الدخول" },
  "auth.signUp": { en: "Create account", ar: "إنشاء حساب" },
  "auth.name": { en: "Full name", ar: "الاسم الكامل" },
  "auth.google": { en: "Continue with Google", ar: "المتابعة باستخدام Google" },
  "auth.haveAccount": { en: "Already have an account?", ar: "لديك حساب بالفعل؟" },
  "auth.noAccount": { en: "Need an account?", ar: "تحتاج إلى حساب؟" },
  "auth.or": { en: "or", ar: "أو" },
  "auth.checkEmail": {
    en: "Check your email to confirm your account.",
    ar: "تحقق من بريدك الإلكتروني لتأكيد الحساب.",
  },
  "dash.welcome": { en: "Welcome back", ar: "مرحباً بعودتك" },
  "dash.workspaces": { en: "Your workspaces", ar: "مساحات العمل الخاصة بك" },
  "dash.noAccess": {
    en: "Your account is not linked to a restaurant yet.",
    ar: "حسابك غير مرتبط بمطعم بعد.",
  },
  "dash.noAccessHelp": {
    en: "Ask your restaurant administrator or the platform owner to add you to a team.",
    ar: "اطلب من مدير المطعم أو مالك المنصة إضافتك إلى الفريق.",
  },
  "dash.open": { en: "Open", ar: "فتح" },
  "common.loading": { en: "Loading…", ar: "جارٍ التحميل…" },
  "common.error": { en: "Something went wrong", ar: "حدث خطأ ما" },
  "common.retry": { en: "Try again", ar: "إعادة المحاولة" },
  "common.language": { en: "العربية", ar: "English" },
};

type I18nValue = {
  lang: Language;
  dir: "ltr" | "rtl";
  setLang: (lang: Language) => void;
  toggleLang: () => void;
  t: (key: keyof typeof dict | string) => string;
  /** Pick the correct localized column value (name_en / name_ar style pairs). */
  pick: (en?: string | null, ar?: string | null) => string;
};

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Language>("en");

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "ar" || stored === "en") setLangState(stored);
  }, []);

  const setLang = useCallback((next: Language) => {
    setLangState(next);
    window.localStorage.setItem(STORAGE_KEY, next);
  }, []);

  const dir = lang === "ar" ? "rtl" : "ltr";

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = dir;
  }, [lang, dir]);

  const value = useMemo<I18nValue>(
    () => ({
      lang,
      dir,
      setLang,
      toggleLang: () => setLang(lang === "ar" ? "en" : "ar"),
      t: (key) => dict[key]?.[lang] ?? String(key),
      pick: (en, ar) => (lang === "ar" ? ar || en || "" : en || ar || ""),
    }),
    [lang, dir, setLang],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside <I18nProvider>");
  return ctx;
}
