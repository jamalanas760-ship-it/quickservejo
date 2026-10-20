import { useEffect, useState } from "react";
import { LaunchScreenView } from "./SplashScreen";

/** A stalled route always exposes recovery instead of an endless launch screen. */
export function WorkspacePending() {
  const [lang, setLang] = useState<"en" | "ar">("en");
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    setLang(document.documentElement.lang.startsWith("ar") ? "ar" : "en");
    const timer = window.setTimeout(() => setSlow(true), 8000);
    return () => window.clearTimeout(timer);
  }, []);
  if (!slow) return <LaunchScreenView lang={lang} />;
  return (
    <section className="qs-workspace-recovery" role="alert">
      <h1>
        {lang === "ar" ? "تعذر تجهيز مساحة العمل" : "Workspace is taking longer than expected"}
      </h1>
      <p>
        {lang === "ar"
          ? "تحقق من الاتصال ثم أعد المحاولة. لم يتم تغيير بياناتك."
          : "Check your connection, then retry. Your data has not been changed."}
      </p>
      <div>
        <button type="button" onClick={() => window.location.reload()}>
          {lang === "ar" ? "إعادة المحاولة" : "Retry"}
        </button>
        <a href="/auth">{lang === "ar" ? "تسجيل الدخول" : "Sign in"}</a>
      </div>
    </section>
  );
}
