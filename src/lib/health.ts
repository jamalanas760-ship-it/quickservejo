export type HealthInput = {
  productCount: number;
  tableCount: number;
  staffCount: number;
  is_active: boolean;
  archived_at?: string | null;
  logo_url?: string | null;
};

export type OnboardingStep = {
  key: "branding" | "menu" | "tables" | "staff" | "live";
  labelEn: string;
  labelAr: string;
  done: boolean;
};

export function onboardingSteps(input: HealthInput): OnboardingStep[] {
  return [
    {
      key: "branding",
      labelEn: "Logo uploaded",
      labelAr: "تم رفع الشعار",
      done: Boolean(input.logo_url),
    },
    {
      key: "menu",
      labelEn: "Menu products added",
      labelAr: "تمت إضافة منتجات القائمة",
      done: input.productCount > 0,
    },
    {
      key: "tables",
      labelEn: "Tables and QR codes created",
      labelAr: "تم إنشاء الطاولات ورموز QR",
      done: input.tableCount > 0,
    },
    {
      key: "staff",
      labelEn: "Staff invited",
      labelAr: "تمت دعوة الموظفين",
      done: input.staffCount > 0,
    },
    {
      key: "live",
      labelEn: "Restaurant is live",
      labelAr: "المطعم نشط",
      done: input.is_active && !input.archived_at,
    },
  ];
}

export type HealthLevel = "healthy" | "warning" | "critical";

export function healthOf(input: HealthInput): {
  level: HealthLevel;
  percent: number;
  missing: OnboardingStep[];
} {
  const steps = onboardingSteps(input);
  const done = steps.filter((s) => s.done).length;
  const percent = Math.round((done / steps.length) * 100);
  const missing = steps.filter((s) => !s.done);
  const level: HealthLevel =
    percent === 100 ? "healthy" : input.productCount === 0 || input.tableCount === 0 ? "critical" : "warning";
  return { level, percent, missing };
}
