import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { getMcpOAuthReadiness } from "@/lib/mcp-readiness.functions";
import { resolveMcpPublicUrl } from "@/lib/mcp-public-url";
import { Link } from "@tanstack/react-router";
import {
  BookOpen,
  CalendarCheck,
  ChartNoAxesCombined,
  ChevronRight,
  Copy,
  Plug,
  ShieldCheck,
  UsersRound,
  UserPlus,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import "./mcp-gps-studio.css";
export function McpConnectionStudio({ ar, restaurantId }: { ar: boolean; restaurantId: string }) {
  const [open, setOpen] = useState(false),
    [guide, setGuide] = useState(false),
    [url, setUrl] = useState("");
  const readiness = useQuery({
    queryKey: ["mcp-oauth-readiness"],
    queryFn: () => getMcpOAuthReadiness(),
    enabled: open,
    staleTime: 15000,
    retry: false,
  });
  const id = useId(),
    trigger = useRef<HTMLButtonElement>(null),
    heading = useRef<HTMLHeadingElement>(null),
    input = useRef<HTMLInputElement>(null);
  const t = (en: string, arabic: string) => (ar ? arabic : en);
  useEffect(() => {
    try {
      setUrl(resolveMcpPublicUrl(import.meta.env.VITE_QUICKSERVE_MCP_URL, window.location.origin));
    } catch {
      setUrl("");
    }
  }, []);
  useEffect(() => {
    if (open) heading.current?.focus({ preventScroll: true });
  }, [open]);
  const close = () => {
    setOpen(false);
    setGuide(false);
    requestAnimationFrame(() => trigger.current?.focus({ preventScroll: true }));
  };
  const tools = [
    {
      title: t("Table availability", "توفر الطاولات"),
      hint: t("Check free tables and times", "تحقق من الطاولات والأوقات المتاحة"),
      icon: CalendarCheck,
      to: "/bookings",
      create: false,
      hash: "",
    },
    {
      title: t("Create reservation", "إنشاء حجز"),
      hint: t("Book a table for guests", "احجز طاولة للضيوف"),
      icon: UserPlus,
      to: "/bookings",
      create: true,
      hash: "",
    },
    {
      title: t("Daily sales", "المبيعات اليومية"),
      hint: t("Get daily sales information", "اعرض معلومات المبيعات اليومية"),
      icon: ChartNoAxesCombined,
      to: "/analytics",
      create: false,
      hash: "",
    },
    {
      title: t("Attendance status", "حالة الحضور"),
      hint: t("Check staff attendance", "تحقق من حضور الفريق"),
      icon: UsersRound,
      to: "/shifts",
      create: false,
      hash: "attendance",
    },
  ];
  return (
    <section className={`qs-mcp-studio ${open ? "is-open" : ""}`} dir={ar ? "rtl" : "ltr"}>
      <button
        ref={trigger}
        type="button"
        className="qs-mcp-entry"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="qs-mcp-entry-icon">
          <Plug aria-hidden="true" />
        </span>
        <span>
          <strong>MCP & AI</strong>
          <small>{t("Connect and use AI tools", "اتصل بأدوات الذكاء الاصطناعي واستخدمها")}</small>
        </span>
        <ChevronRight aria-hidden="true" />
      </button>
      {open && (
        <div
          id={id}
          className="qs-mcp-panel"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.stopPropagation();
              close();
            }
          }}
        >
          <header className="qs-mcp-heading">
            <Plug aria-hidden="true" />
            <div>
              <h2 ref={heading} tabIndex={-1}>
                MCP & AI
              </h2>
              <p>
                {t(
                  "Connect your AI tools to QuickServe",
                  "اربط أدوات الذكاء الاصطناعي بـ QuickServe",
                )}
              </p>
            </div>
            <button
              type="button"
              onClick={close}
              aria-label={t("Close MCP setup", "إغلاق إعداد MCP")}
            >
              <X aria-hidden="true" />
            </button>
          </header>
          <div className="qs-mcp-body">
            <div className="qs-mcp-setup-note">
              <span className="qs-mcp-dashed-dot" />
              <div>
                <strong>
                  {t(
                    readiness.data?.status === "ready"
                      ? "OAuth discovery ready"
                      : readiness.data?.status === "oauth_disabled"
                        ? "OAuth server is disabled"
                        : "Connection setup check",
                    readiness.data?.status === "ready"
                      ? "اكتشاف OAuth جاهز"
                      : readiness.data?.status === "oauth_disabled"
                        ? "خادم OAuth غير مفعل"
                        : "فحص إعداد الاتصال",
                  )}
                </strong>
                <p>
                  {t(
                    readiness.data?.status === "oauth_disabled"
                      ? "AI connection is unavailable. Authentication remains enforced; a separate OAuth provider is required while Supabase OAuth stays disabled."
                      : "This checks public OAuth configuration. Complete authorization in each AI client to connect.",
                    readiness.data?.status === "oauth_disabled"
                      ? "اتصال الذكاء الاصطناعي غير متاح. تبقى حماية المصادقة فعالة؛ يلزم مزود OAuth مستقل مع إبقاء OAuth في Supabase معطلاً."
                      : "يفحص هذا إعدادات OAuth العامة. أكمل التفويض في كل تطبيق للربط.",
                  )}
                </p>
              </div>
            </div>
            <div className="mb-4 space-y-3 rounded-xl border p-4 text-sm">
              <div className="flex flex-wrap gap-3">
                <Button
                  variant="outline"
                  disabled={readiness.isFetching}
                  onClick={() => void readiness.refetch()}
                >
                  {t("Check OAuth setup", "فحص إعداد OAuth")}
                </Button>
              </div>
              {readiness.isFetching && <p role="status">{t("Checking…", "جارٍ الفحص…")}</p>}
              {(readiness.isError || readiness.data?.status === "unavailable") && (
                <p role="alert">
                  {t(
                    "OAuth discovery is unreachable. Check hosting and retry.",
                    "تعذر الوصول لإعدادات OAuth. تحقق من الاستضافة وأعد المحاولة.",
                  )}
                </p>
              )}
              {readiness.data?.status === "registration_required" && (
                <p role="alert">
                  {t(
                    "OAuth client registration is not available. This connection has not been verified.",
                    "تسجيل عميل OAuth غير متاح. لم يتم التحقق من هذا الاتصال.",
                  )}
                </p>
              )}
              {readiness.data?.status === "discovery_invalid" && (
                <p role="alert">
                  {t(
                    "OAuth discovery or signing keys need a project-owner review.",
                    "يجب على مالك المشروع مراجعة إعدادات OAuth ومفاتيح التوقيع.",
                  )}
                </p>
              )}
            </div>
            <div className="qs-mcp-columns">
              <section className="qs-mcp-connection">
                <h3>{t("Server connection", "اتصال الخادم")}</h3>
                <p>
                  {t(
                    "Use this server URL in your AI tool configuration.",
                    "استخدم رابط الخادم في إعدادات تطبيق الذكاء الاصطناعي.",
                  )}
                </p>
                <label className="qs-mcp-url-label">
                  {t("Server URL", "رابط الخادم")}
                  <input
                    ref={input}
                    readOnly
                    dir="ltr"
                    value={url}
                    onFocus={(e) => e.target.select()}
                    aria-label={t("MCP server URL", "رابط خادم MCP")}
                  />
                </label>
                <div className="qs-mcp-connection-actions">
                  <Button
                    type="button"
                    disabled={!url}
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(url);
                        toast.success(t("Server URL copied", "تم نسخ رابط الخادم"));
                      } catch {
                        input.current?.focus();
                        input.current?.select();
                        toast.info(
                          t(
                            "Select and copy the server URL manually.",
                            "حدد رابط الخادم وانسخه يدوياً.",
                          ),
                        );
                      }
                    }}
                  >
                    <Copy aria-hidden="true" />
                    {t("Copy server URL", "نسخ رابط الخادم")}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    aria-expanded={guide}
                    aria-controls={`${id}-guide`}
                    onClick={() => setGuide((value) => !value)}
                  >
                    <BookOpen aria-hidden="true" />
                    {t("Setup guide", "دليل الإعداد")}
                  </Button>
                </div>
                {guide && (
                  <div className="mt-4 space-y-3 text-sm">
                    <p>
                      <strong>ChatGPT:</strong>{" "}
                      {t(
                        "Add a custom MCP app in developer mode using this URL and OAuth. Availability depends on your account and workspace.",
                        "أضف تطبيق MCP مخصصاً في وضع المطور باستخدام هذا الرابط وOAuth. التوفر يعتمد على الحساب ومساحة العمل.",
                      )}
                    </p>
                    <p>
                      <strong>Claude:</strong>{" "}
                      {t(
                        "Add a custom connector only after OAuth readiness is confirmed. Use the registration method supported by the configured provider.",
                        "أضف موصلاً مخصصاً بعد تأكيد جاهزية OAuth. استخدم طريقة التسجيل المدعومة من المزود المهيأ.",
                      )}
                    </p>
                    <p>
                      <strong>Gemini:</strong>{" "}
                      {t(
                        "Custom apps currently require an eligible US personal account. Use Gemini CLI with a Streamable HTTP MCP server and OAuth where custom apps are unavailable.",
                        "التطبيقات المخصصة تتطلب حالياً حساباً شخصياً مؤهلاً في الولايات المتحدة. استخدم Gemini CLI مع خادم MCP عبر Streamable HTTP وOAuth عند عدم توفرها.",
                      )}
                    </p>
                    <p>
                      <strong>Grok:</strong>{" "}
                      {t(
                        "Open Connectors, choose New Connector → Custom, then enter this MCP URL and authorize.",
                        "افتح الموصلات واختر موصلاً جديداً ثم مخصصاً، وأدخل رابط MCP وأكمل التفويض.",
                      )}
                    </p>
                    <p>
                      {t(
                        "Never enter a Supabase service-role key or management token in an AI client.",
                        "لا تدخل مفتاح service-role أو رمز إدارة Supabase في تطبيق الذكاء الاصطناعي.",
                      )}
                    </p>
                  </div>
                )}
                {guide && (
                  <ol id={`${id}-guide`} className="qs-mcp-guide">
                    <li>
                      {t(
                        "Copy the URL from the published QuickServe website.",
                        "انسخ الرابط من موقع QuickServe المنشور.",
                      )}
                    </li>
                    <li>
                      {t(
                        "Add a custom MCP server in your compatible AI client and paste the URL.",
                        "أضف خادم MCP مخصصاً في تطبيق ذكاء اصطناعي متوافق وألصق الرابط.",
                      )}
                    </li>
                    <li>
                      {t(
                        "Complete OAuth sign-in using your QuickServe account.",
                        "أكمل تسجيل الدخول باستخدام حساب QuickServe.",
                      )}
                    </li>
                    <li>
                      {t(
                        "Choose the restaurant you can access, then use the available tools.",
                        "اختر المطعم الذي لديك صلاحية الوصول إليه، ثم استخدم الأدوات المتاحة.",
                      )}
                    </li>
                  </ol>
                )}
              </section>
              <section className="qs-mcp-tools">
                <h3>{t("Available tools", "الأدوات المتاحة")}</h3>
                <p>
                  {t(
                    "Use these tools in your AI conversations, or open their workspace pages.",
                    "استخدم الأدوات في محادثات الذكاء الاصطناعي أو افتح صفحاتها في مساحة العمل.",
                  )}
                </p>
                <div className="qs-mcp-tool-grid">
                  {tools.map((tool) => {
                    const Icon = tool.icon;
                    return (
                      <McpToolLink
                        key={tool.title}
                        destination={tool.to}
                        restaurantId={restaurantId}
                        create={tool.create}
                      >
                        <span className="qs-mcp-tool-icon">
                          <Icon aria-hidden="true" />
                        </span>
                        <ChevronRight aria-hidden="true" />
                        <strong>{tool.title}</strong>
                        <small>{tool.hint}</small>
                      </McpToolLink>
                    );
                  })}
                </div>
              </section>
            </div>
            <p className="qs-mcp-permissions">
              <ShieldCheck aria-hidden="true" />
              {t("Access follows your restaurant permissions.", "يخضع الوصول لصلاحياتك في المطعم.")}
            </p>
          </div>
        </div>
      )}
    </section>
  );
}

function McpToolLink({
  destination,
  restaurantId,
  create,
  children,
}: {
  destination: string;
  restaurantId: string;
  create: boolean;
  children: ReactNode;
}) {
  if (destination === "/analytics")
    return (
      <Link className="qs-mcp-tool" to="/manage/$restaurantId/analytics" params={{ restaurantId }}>
        {children}
      </Link>
    );
  if (destination === "/shifts")
    return (
      <Link className="qs-mcp-tool" to="/shifts" hash="attendance">
        {children}
      </Link>
    );
  return (
    <Link className="qs-mcp-tool" to="/bookings" search={{ create }}>
      {children}
    </Link>
  );
}
