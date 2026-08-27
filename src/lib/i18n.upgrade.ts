/**
 * Strings added by the UI/UX upgrade pass (diner filters, onboarding,
 * reporting ranges, seats, waiter/cashier tools, landing page).
 */
export const upgradeDict: Record<string, { en: string; ar: string }> = {
  // Diner menu
  "diner.searchPlaceholder": { en: "Search the menu…", ar: "ابحث في القائمة…" },
  "diner.filters": { en: "Filters", ar: "عوامل التصفية" },
  "diner.clearFilters": { en: "Clear filters", ar: "إزالة التصفية" },
  "diner.noResults": { en: "No dishes match your search", ar: "لا توجد أطباق تطابق بحثك" },
  "diner.noResultsHelp": {
    en: "Try a different word or clear the filters.",
    ar: "جرّب كلمة أخرى أو أزل عوامل التصفية.",
  },
  "diner.emptyCart": { en: "Your order is empty", ar: "طلبك فارغ" },
  "diner.emptyCartHelp": {
    en: "Tap any dish to add it — we'll send it straight to the kitchen.",
    ar: "اضغط على أي طبق لإضافته — سنرسله مباشرة إلى المطبخ.",
  },
  "diner.browseMenu": { en: "Browse the menu", ar: "استعرض القائمة" },
  "diner.results": { en: "results", ar: "نتيجة" },

  // Guided onboarding
  "onboard.title": { en: "Finish setting up", ar: "أكمل الإعداد" },
  "onboard.subtitle": {
    en: "A few steps left before diners can order.",
    ar: "بقيت خطوات قليلة قبل أن يتمكن الزبائن من الطلب.",
  },
  "onboard.step.branding": { en: "Branding", ar: "الهوية" },
  "onboard.step.menu": { en: "Menu", ar: "القائمة" },
  "onboard.step.tables": { en: "Tables", ar: "الطاولات" },
  "onboard.step.qr": { en: "QR codes", ar: "رموز QR" },
  "onboard.step.live": { en: "Go live", ar: "التشغيل" },
  "onboard.branding.help": { en: "Upload your logo and colours.", ar: "ارفع الشعار والألوان." },
  "onboard.menu.help": { en: "Add categories and dishes.", ar: "أضف الأقسام والأطباق." },
  "onboard.tables.help": { en: "Create your tables.", ar: "أنشئ طاولاتك." },
  "onboard.qr.help": { en: "Print QR codes for each table.", ar: "اطبع رمز QR لكل طاولة." },
  "onboard.live.help": { en: "Activate the restaurant.", ar: "قم بتنشيط المطعم." },
  "onboard.continue": { en: "Continue", ar: "متابعة" },
  "onboard.complete": { en: "Setup complete", ar: "تم الإعداد" },
  "onboard.progress": { en: "complete", ar: "مكتمل" },

  // Reporting ranges
  "range.label": { en: "Date range", ar: "النطاق الزمني" },
  "range.today": { en: "Today", ar: "اليوم" },
  "range.7d": { en: "Last 7 days", ar: "آخر ٧ أيام" },
  "range.30d": { en: "Last 30 days", ar: "آخر ٣٠ يوماً" },
  "range.90d": { en: "Last 90 days", ar: "آخر ٩٠ يوماً" },
  "range.custom": { en: "Custom range", ar: "نطاق مخصص" },
  "range.from": { en: "From", ar: "من" },
  "range.to": { en: "To", ar: "إلى" },
  "range.apply": { en: "Apply", ar: "تطبيق" },

  // Sold out / low stock widget
  "stock.title": { en: "Sold out & unavailable", ar: "غير متوفر ونفد" },
  "stock.empty": { en: "Everything on the menu is available.", ar: "كل ما في القائمة متوفر." },
  "stock.soldOutUntil": { en: "Sold out until", ar: "نفد حتى" },
  "stock.unavailable": { en: "Unavailable", ar: "غير متوفر" },
  "stock.restore": { en: "Mark available", ar: "تعليم كمتوفر" },
  "stock.markSoldOut": { en: "Mark sold out", ar: "تعليم كنافد" },

  // Header quick actions
  "quick.addItem": { en: "Add item", ar: "إضافة طبق" },
  "quick.printQr": { en: "Print QR codes", ar: "طباعة رموز QR" },

  // Super admin
  "sa.revenue.trend": { en: "Revenue trend", ar: "اتجاه الإيرادات" },
  "sa.revenue.trendHelp": {
    en: "Platform-wide sales for the selected range.",
    ar: "المبيعات على مستوى المنصة للنطاق المحدد.",
  },
  "sa.revenue.empty": { en: "No sales in this range yet.", ar: "لا توجد مبيعات في هذا النطاق." },
  "sa.sub.trialEnding": { en: "Trial ending", ar: "التجربة تنتهي" },
  "sa.sub.pastDue": { en: "Past due", ar: "متأخر السداد" },
  "sa.sub.suspended": { en: "Suspended", ar: "موقوف" },
  "sa.audit.actor": { en: "Actor", ar: "المنفّذ" },
  "sa.audit.action": { en: "Action type", ar: "نوع الإجراء" },
  "sa.audit.restaurant": { en: "Restaurant", ar: "المطعم" },
  "sa.audit.reset": { en: "Reset filters", ar: "إعادة التعيين" },

  // Seats
  "seats.title": { en: "Seats", ar: "المقاعد" },
  "seats.used": { en: "Seats used", ar: "المقاعد المستخدمة" },
  "seats.limit": { en: "Seat limit", ar: "حد المقاعد" },
  "seats.unlimited": { en: "Unlimited", ar: "غير محدود" },
  "seats.full": { en: "All seats are in use", ar: "جميع المقاعد مستخدمة" },
  "seats.upgrade": {
    en: "You've used every seat in your plan. Upgrade your plan to add more staff accounts.",
    ar: "لقد استخدمت جميع المقاعد في خطتك. قم بترقية الخطة لإضافة حسابات موظفين إضافية.",
  },
  "seats.editLimit": { en: "Change seat limit", ar: "تعديل حد المقاعد" },
  "seats.limitHelp": {
    en: "Leave empty for unlimited seats (Enterprise).",
    ar: "اتركه فارغاً للمقاعد غير المحدودة (Enterprise).",
  },
  "seats.saved": { en: "Seat limit updated", ar: "تم تحديث حد المقاعد" },

  // Kitchen
  "kitchen.bump": { en: "Bump", ar: "إتمام" },
  "kitchen.undo": { en: "Undo", ar: "تراجع" },
  "kitchen.bumped": { en: "Order bumped", ar: "تم إتمام الطلب" },
  "kitchen.undone": { en: "Bump undone", ar: "تم التراجع" },
  "kitchen.soundOn": { en: "Sound on", ar: "الصوت مفعل" },
  "kitchen.soundOff": { en: "Sound off", ar: "الصوت متوقف" },

  // Waiter table status
  "waiter.title": { en: "Tables", ar: "الطاولات" },
  "waiter.subtitle": {
    en: "Live table status: who is calling and what is cooking.",
    ar: "حالة الطاولات المباشرة: من ينادي وما يتم تحضيره.",
  },
  "waiter.calling": { en: "Calling", ar: "ينادي" },
  "waiter.busy": { en: "Active order", ar: "طلب نشط" },
  "waiter.free": { en: "Free", ar: "متاحة" },
  "waiter.acknowledge": { en: "On my way", ar: "في الطريق" },
  "waiter.resolve": { en: "Resolved", ar: "تم" },
  "waiter.empty": { en: "No tables yet.", ar: "لا توجد طاولات بعد." },

  // Cashier
  "cashier.markPaid": { en: "Mark paid", ar: "تعليم كمدفوع" },
  "cashier.paid": { en: "Marked as paid", ar: "تم التعليم كمدفوع" },
  "cashier.split": { en: "Split bill", ar: "تقسيم الفاتورة" },
  "cashier.splitWays": { en: "Split between", ar: "التقسيم بين" },
  "cashier.people": { en: "people", ar: "أشخاص" },
  "cashier.perPerson": { en: "Per person", ar: "لكل شخص" },

  // Empty states
  "empty.menu.title": { en: "No dishes yet", ar: "لا توجد أطباق بعد" },
  "empty.menu.desc": {
    en: "Add your first category and dish so diners have something to order.",
    ar: "أضف أول قسم وطبق ليتمكن الزبائن من الطلب.",
  },
  "empty.staff.title": { en: "No team members yet", ar: "لا يوجد أعضاء فريق بعد" },
  "empty.staff.desc": {
    en: "Invite your kitchen, waiters and cashiers so they can sign in.",
    ar: "قم بدعوة المطبخ والنُدُل والكاشير ليتمكنوا من تسجيل الدخول.",
  },
  "empty.tables.title": { en: "No tables yet", ar: "لا توجد طاولات بعد" },
  "empty.tables.desc": {
    en: "Create tables to generate a QR code for each one.",
    ar: "أنشئ الطاولات لتوليد رمز QR لكل منها.",
  },

  // Landing page
  "land.how.title": { en: "How QuickServe works", ar: "كيف يعمل QuickServe" },
  "land.how.subtitle": {
    en: "From scan to kitchen in under a minute.",
    ar: "من المسح إلى المطبخ في أقل من دقيقة.",
  },
  "land.how.step1": { en: "Guest scans the table QR", ar: "يمسح الزبون رمز الطاولة" },
  "land.how.step1d": {
    en: "No app, no sign-up — the menu opens instantly in the browser.",
    ar: "بدون تطبيق أو تسجيل — تفتح القائمة فوراً في المتصفح.",
  },
  "land.how.step2": { en: "They build their order", ar: "يبني طلبه" },
  "land.how.step2d": {
    en: "Photos, modifiers, allergen tags and notes in Arabic or English.",
    ar: "صور وإضافات ووسوم الحساسية وملاحظات بالعربية أو الإنجليزية.",
  },
  "land.how.step3": { en: "The kitchen sees it live", ar: "يراه المطبخ مباشرة" },
  "land.how.step3d": {
    en: "Tickets appear with a sound alert, timers and one-tap status updates.",
    ar: "تظهر التذاكر مع تنبيه صوتي ومؤقتات وتحديث الحالة بلمسة واحدة.",
  },
  "land.pricing.title": { en: "Simple seat-based pricing", ar: "أسعار بسيطة حسب المقاعد" },
  "land.pricing.subtitle": {
    en: "Pay for the staff accounts you need. Change plan any time.",
    ar: "ادفع مقابل حسابات الموظفين التي تحتاجها. غيّر الخطة في أي وقت.",
  },
  "land.pricing.seats": { en: "staff seats", ar: "مقاعد موظفين" },
  "land.pricing.unlimitedSeats": { en: "Unlimited staff seats", ar: "مقاعد موظفين غير محدودة" },
  "land.pricing.month": { en: "/ month", ar: "/ شهرياً" },
  "land.pricing.cta": { en: "Talk to sales", ar: "تحدث مع المبيعات" },
  "land.footer.tagline": {
    en: "QR ordering, kitchen display and analytics for restaurants in Jordan and beyond.",
    ar: "الطلب عبر QR وشاشة المطبخ والتحليلات للمطاعم في الأردن وخارجها.",
  },
  "land.footer.product": { en: "Product", ar: "المنتج" },
  "land.footer.company": { en: "Company", ar: "الشركة" },
  "land.footer.legal": { en: "Legal", ar: "قانوني" },
  "land.footer.privacy": { en: "Privacy policy", ar: "سياسة الخصوصية" },
  "land.footer.terms": { en: "Terms of service", ar: "شروط الخدمة" },
  "land.footer.contact": { en: "Contact us", ar: "اتصل بنا" },
  "land.footer.rights": { en: "All rights reserved.", ar: "جميع الحقوق محفوظة." },

  "nav.cashier": { en: "Cashier", ar: "الكاشير" },
  "nav.waiter": { en: "Tables", ar: "الطاولات" },
  "nav.kitchen": { en: "Kitchen", ar: "المطبخ" },

  "common.all": { en: "All", ar: "الكل" },
  "common.clear": { en: "Clear", ar: "مسح" },
};
