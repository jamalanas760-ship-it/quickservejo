import { ViewportDock } from "./ViewportDock";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  BarChart3,
  Banknote,
  BellRing,
  Boxes,
  BriefcaseBusiness,
  Building2,
  CalendarClock,
  ChefHat,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  Clock3,
  Home,
  HeartHandshake,
  Megaphone,
  MonitorSmartphone,
  MoreHorizontal,
  Plus,
  LayoutGrid,
  PlugZap,
  Search,
  Settings,
  Store,
  Table2,
  User,
  UserRoundCog,
  Users,
  UtensilsCrossed,
  Workflow,
} from "lucide-react";

import { BrandLogo } from "@/components/brand/BrandLogo";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useOperationalCounters } from "@/hooks/useOperationalCounters";
import { useAccess } from "@/hooks/useSession";
import { useI18n } from "@/lib/i18n";
import { membershipHasCapability, type Capability } from "@/lib/permissions";
import { readAppearance } from "@/lib/restaurant-appearance";
import { cn } from "@/lib/utils";

type NavGroup = "overview" | "service" | "operations" | "growth" | "admin";
type Item = { to: string; icon: typeof Home; en: string; ar: string; exact?: boolean; capability?: Capability; badge?: "tasks" | "shifts" | "orders" | "unread" | "workforceUnread"; group?: NavGroup };
type IOSQuickAction={key:string;to?:string;icon:typeof Home;en:string;ar:string;search?:Record<string,unknown>;command?:"more"};

const FRONTLINE_ITEMS: Record<string, Item> = {
  kitchen: { to: "/kitchen", icon: ChefHat, en: "Kitchen", ar: "المطبخ" },
  waiter: { to: "/waiter", icon: UtensilsCrossed, en: "Floor", ar: "الصالة" },
  host: { to: "/host", icon: UtensilsCrossed, en: "Host", ar: "الاستقبال" },
  cashier: { to: "/cashier", icon: Banknote, en: "Cashier", ar: "الكاشير" },
};

export function BottomNav() {
  const { lang } = useI18n();
  const navigate=useNavigate();
  const [moreOpen, setMoreOpen] = useState(false);
  const [toolSearch, setToolSearch] = useState("");
  const [iosQuickItem,setIOSQuickItem]=useState<Item|null>(null);
  const [iosQuickAnchor,setIOSQuickAnchor]=useState<{menuLeft:number;menuBottom:number;previewLeft:number;previewBottom:number;previewWidth:number}|null>(null);
  const [pressedNavKey,setPressedNavKey]=useState<string|null>(null);
  const longPressTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const pressOrigin=useRef<{x:number;y:number}|null>(null);
  const suppressNextNavClick=useRef(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const access = useAccess();
  const selectedId = pathname.match(/^\/manage\/([^/]+)/)?.[1];
  const membership = (access.data ?? []).find((row) => row.restaurant_id && row.restaurant && (!selectedId || row.restaurant_id === selectedId))
    ?? (access.data ?? []).find((row) => row.restaurant_id && row.restaurant)
    ?? null;
  const restaurantId = membership?.restaurant_id ?? null;
  const restaurant = membership?.restaurant ?? null;
  const counters = useOperationalCounters(restaurantId);

  useEffect(() => {
    const openTools = () => setMoreOpen(true);
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setMoreOpen(true);
      }
    };
    window.addEventListener("quickserve:open-workspace-tools", openTools);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("quickserve:open-workspace-tools", openTools);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  const role = membership?.role ?? access.roles[0] ?? null;
  const overrides = membership?.permission_overrides ?? null;
  const can = (capability: Capability) => Boolean(role && membershipHasCapability(role, overrides, capability));
  const appearance = readAppearance(restaurant?.menu_theme);
  const useRestaurantLogo = Boolean(restaurant?.logo_url && !appearance.useQuickServeLogo);
  const managerial = role === "restaurant_admin" || role === "operations_manager" || role === "manager";
  const multiLocation = new Set((access.data ?? []).map((row) => row.restaurant_id).filter(Boolean)).size > 1;
  const erpSpecialist = role === "inventory" || role === "procurement" || role === "accountant";
  const homeTo = role === "operations_manager" || role === "manager" ? "/manager" : erpSpecialist ? "/work" : "/dashboard";

  const managementItems: Item[] = restaurantId ? ([
    { to: homeTo, icon: role === "operations_manager" || role === "manager" ? UserRoundCog : Home, en: role === "operations_manager" ? "Operations" : role === "manager" ? "Shift" : "Home", ar: role === "operations_manager" ? "العمليات" : role === "manager" ? "الوردية" : "الرئيسية", exact: true, group: "overview" },
    { to: "/hq", icon: Building2, en: "HQ", ar: "المجموعة", group: "overview" },
    { to: "/work", icon: BriefcaseBusiness, en: "My Work", ar: "عملي", capability: "view_work", badge: "tasks", group: "overview" },
    { to: "/shifts", icon: CalendarClock, en: "Workforce", ar: "القوى العاملة", capability: "view_work", badge: "workforceUnread", group: "operations" },
    { to: "/automations", icon: Workflow, en: "Automation", ar: "الأتمتة", capability: "manage_work", group: "operations" },
    { to: `/manage/${restaurantId}/orders`, icon: ClipboardList, en: "Orders", ar: "الطلبات", capability: "view_orders", badge: "orders", group: "service" },
    { to: `/manage/${restaurantId}`, icon: UtensilsCrossed, en: "Menu", ar: "القائمة", exact: true, capability: "manage_menu", group: "service" },
    { to: `/manage/${restaurantId}/tables`, icon: Table2, en: "Tables", ar: "الطاولات", capability: "manage_tables", group: "service" },
    { to: "/bookings", icon: CalendarClock, en: "Reservations", ar: "الحجوزات", capability: "manage_tables", group: "service" },
    { to: "/waitlist", icon: Clock3, en: "Waitlist", ar: "الانتظار", capability: "manage_tables", group: "service" },
    { to: `/manage/${restaurantId}/operations`, icon: Boxes, en: "ERP", ar: "ERP", capability: "view_erp", group: "operations" },
    { to: `/manage/${restaurantId}/analytics`, icon: BarChart3, en: "Analytics", ar: "التحليلات", capability: "view_analytics", group: "operations" },
    { to: "/daily-close", icon: ClipboardCheck, en: "Daily Close", ar: "إقفال اليوم", capability: "manage_payments", group: "operations" },
    { to: "/guests", icon: HeartHandshake, en: "Guests", ar: "الضيوف", capability: "view_analytics", group: "growth" },
    { to: "/campaigns", icon: Megaphone, en: "Campaigns", ar: "الحملات", capability: "manage_restaurant", group: "growth" },
    { to: "/integrations", icon: PlugZap, en: "Connect", ar: "التكاملات", capability: "manage_restaurant", group: "admin" },
    { to: "/devices", icon: MonitorSmartphone, en: "Devices", ar: "الأجهزة", capability: "manage_restaurant", group: "admin" },
    { to: `/manage/${restaurantId}/staff`, icon: Users, en: "Team", ar: "الفريق", capability: "manage_staff", group: "admin" },
    { to: "/profile", icon: User, en: "Profile", ar: "الحساب", exact: true, group: "admin" },
  ] satisfies Item[]).filter((item) => (item.to !== "/hq" || multiLocation) && (!item.capability || can(item.capability))) : [];

  const frontlineItem = role ? FRONTLINE_ITEMS[role] : undefined;
  const workItem: Item | null = can("view_work") ? { to: "/work", icon: BriefcaseBusiness, en: "My Work", ar: "عملي", badge: "tasks" } : null;
  const shiftItem: Item | null = can("view_work") ? { to: "/shifts", icon: CalendarClock, en: "Workforce", ar: "القوى العاملة", badge: "workforceUnread" } : null;
  const erpItem: Item | null = restaurantId && can("view_erp") ? { to: `/manage/${restaurantId}/operations`, icon: Boxes, en: "ERP", ar: "ERP" } : null;
  const desktopItems: Item[] = managerial
    ? managementItems
    : erpSpecialist
      ? [workItem, shiftItem, erpItem, { to: "/notifications", icon: BellRing, en: "Alerts", ar: "التنبيهات", badge: "unread" }, { to: "/profile", icon: User, en: "Profile", ar: "الحساب" }].filter(Boolean) as Item[]
      : frontlineItem
        ? [frontlineItem, workItem, shiftItem, { to: "/notifications", icon: BellRing, en: "Alerts", ar: "التنبيهات", badge: "unread" }, { to: "/profile", icon: User, en: "Profile", ar: "الحساب" }].filter(Boolean) as Item[]
        : restaurantId
          ? managementItems
          : [
              { to: "/dashboard", icon: Home, en: "Home", ar: "الرئيسية" },
              { to: "/manage", icon: Store, en: "Restaurants", ar: "المطاعم" },
              { to: "/profile", icon: Settings, en: "Settings", ar: "الإعدادات" },
            ];

  const mobilePriority = managerial
    ? [homeTo, `/manage/${restaurantId}/orders`, "/bookings", "/work"]
    : [homeTo, "/work", "/shifts", `/manage/${restaurantId}/operations`, "/profile"];
  const desktopPriority = managerial
    ? [homeTo, `/manage/${restaurantId}/orders`, "/bookings", `/manage/${restaurantId}`, `/manage/${restaurantId}/staff`, `/manage/${restaurantId}/analytics`]
    : [homeTo, "/work", "/shifts", `/manage/${restaurantId}/operations`, "/notifications", "/profile"];
  const sidebarToolKey = (item: Item) => item.en.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const customDesktopPrimary = managerial && appearance.sidebarPinnedTools.length
    ? [
        ...desktopItems.filter((item) => item.to === homeTo).slice(0, 1),
        ...appearance.sidebarPinnedTools.flatMap((key) => desktopItems.find((item) => item.to !== homeTo && sidebarToolKey(item) === key) ?? []),
      ].filter((item, index, list) => list.findIndex((candidate) => candidate.to === item.to) === index).slice(0, 6)
    : [];
  const desktopPrimary = customDesktopPrimary.length > 1
    ? customDesktopPrimary
    : desktopItems.length > 6
      ? desktopPriority
          .flatMap((to) => desktopItems.find((item) => item.to === to) ?? [])
          .filter((item, index, list) => list.findIndex((candidate) => candidate.to === item.to) === index)
          .slice(0, 6)
      : desktopItems;
  const desktopHasMore = desktopItems.some((item) => !desktopPrimary.some((primary) => primary.to === item.to));

  // Mobile mirrors the same user-defined order while keeping ergonomic tap targets.
  // Home is fixed first, then the first three configured tools, followed by More when needed.
  const customMobilePrimary = managerial && appearance.sidebarPinnedTools.length
    ? [
        ...desktopItems.filter((item) => item.to === homeTo).slice(0, 1),
        ...appearance.sidebarPinnedTools
          .flatMap((key) => desktopItems.find((item) => item.to !== homeTo && sidebarToolKey(item) === key) ?? [])
          .slice(0, 3),
      ].filter((item, index, list) => list.findIndex((candidate) => candidate.to === item.to) === index)
    : [];
  const mobilePrimary = customMobilePrimary.length > 1
    ? customMobilePrimary
    : desktopItems.length > 5
      ? mobilePriority.flatMap((to) => desktopItems.find((item) => item.to === to) ?? []).filter((item, index, list) => list.findIndex(candidate => candidate.to === item.to) === index).slice(0, 4)
      : desktopItems;
  const mobileHasMore = desktopItems.some(item => !mobilePrimary.some(primary => primary.to === item.to));
  const mobileMoreActive = moreOpen || desktopItems.some(item => activeFor(item) && !mobilePrimary.some(primary => primary.to === item.to));

  function groupLabel(group: NavGroup) {
    const labels: Record<NavGroup, { en: string; ar: string }> = {
      overview: { en: "Overview", ar: "نظرة عامة" },
      service: { en: "Service", ar: "الخدمة" },
      operations: { en: "Operations", ar: "العمليات" },
      growth: { en: "Guests & Growth", ar: "الضيوف والنمو" },
      admin: { en: "Administration", ar: "الإدارة" },
    };
    return lang === "ar" ? labels[group].ar : labels[group].en;
  }

  function countFor(item: Item) {
    return item.badge ? counters.data[item.badge] : 0;
  }

  function activeFor(item: Item) {
    if (item.exact) return pathname.replace(/\/$/, "") === item.to.replace(/\/$/, "");
    return pathname === item.to || pathname.startsWith(`${item.to}/`);
  }

  function changeMoreOpen(open: boolean) {
    setMoreOpen(open);
    if (!open) setToolSearch("");
  }

  function clearIOSSelection(){
    if(typeof window==="undefined")return;
    try{window.getSelection()?.removeAllRanges();}catch{}
  }

  function isIOSMobile(){
    if(typeof window==="undefined"||typeof navigator==="undefined")return false;
    const isiOS=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1);
    return isiOS&&window.matchMedia("(max-width: 767px) and (pointer: coarse)").matches;
  }

  function fireIOSHaptic(style:"light"|"medium"="light"){
    if(!isIOSMobile())return;
    try{
      const bridge=(window as Window&{webkit?:{messageHandlers?:{quickserveHaptics?:{postMessage:(payload:{style:string})=>void}}}}).webkit?.messageHandlers?.quickserveHaptics;
      bridge?.postMessage({style});
    }catch{}
    try{
      const vibration=navigator as Navigator&{vibrate?:(pattern:number|number[])=>boolean};
      vibration.vibrate?.(style==="medium"?14:8);
    }catch{}
    window.dispatchEvent(new CustomEvent("quickserve:haptic",{detail:{style}}));
  }

  function cancelLongPress(){
    if(longPressTimer.current){
      clearTimeout(longPressTimer.current);
      longPressTimer.current=null;
      setIOSQuickAnchor(null);
    }
    pressOrigin.current=null;
    setPressedNavKey(null);
  }

  function startLongPress(item:Item,target:HTMLElement,clientX:number,clientY:number){
    if(!isIOSMobile())return;
    clearIOSSelection();
    cancelLongPress();
    pressOrigin.current={x:clientX,y:clientY};
    const key=`${item.to}-${item.en}`;
    const rect=target.getBoundingClientRect();
    const menuWidth=Math.min(308,window.innerWidth-24);
    const menuLeft=Math.min(Math.max(rect.left+rect.width/2-menuWidth/2,12),window.innerWidth-menuWidth-12);
    const menuBottom=Math.max(82,window.innerHeight-rect.top+10);
    setIOSQuickAnchor({
      menuLeft,
      menuBottom,
      previewLeft:rect.left,
      previewBottom:Math.max(6,window.innerHeight-rect.bottom),
      previewWidth:rect.width,
    });
    setPressedNavKey(key);
    longPressTimer.current=setTimeout(()=>{
      clearIOSSelection();
      suppressNextNavClick.current=true;
      setIOSQuickItem(item);
      setPressedNavKey(null);
      fireIOSHaptic("medium");
      longPressTimer.current=null;
    },420);
  }

  function moveLongPress(clientX:number,clientY:number){
    const origin=pressOrigin.current;
    if(!origin)return;
    if(Math.hypot(clientX-origin.x,clientY-origin.y)>12)cancelLongPress();
  }

  function closeIOSQuickMenu(){
    setIOSQuickItem(null);
    setIOSQuickAnchor(null);
    setPressedNavKey(null);
    pressOrigin.current=null;
  }

  function consumeLongPressClick(event:{preventDefault:()=>void;stopPropagation:()=>void}){
    if(!suppressNextNavClick.current)return false;
    event.preventDefault();
    event.stopPropagation();
    suppressNextNavClick.current=false;
    return true;
  }

  function quickActionsFor(item:Item):IOSQuickAction[]{
    const availableQuickItems=managementItems.length?managementItems:desktopItems;
    const byName=(name:string)=>availableQuickItems.find(candidate=>candidate.en===name)||desktopItems.find(candidate=>candidate.en===name);
    const actions:IOSQuickAction[]=[];
    const addTool=(key:string,targetName:string,en:string,ar:string)=>{
      const candidate=byName(targetName);
      if(!candidate||actions.some(action=>action.to===candidate.to&&action.en===en))return;
      actions.push({key,to:candidate.to,icon:candidate.icon,en,ar});
    };
    const addBooking=()=>{
      if(!availableQuickItems.some(candidate=>candidate.to==="/bookings"))return;
      actions.push({key:"new-reservation",to:"/bookings",search:{create:true},icon:Plus,en:"New Reservation",ar:"حجز جديد"});
    };
    const addAllTools=()=>actions.push({key:"all-tools",command:"more",icon:LayoutGrid,en:"All Tools",ar:"كل الأدوات"});

    switch(item.en){
      case "Home": addBooking(); addTool("home-orders","Orders","Live Orders","الطلبات المباشرة"); addTool("home-tables","Tables","Floor & Tables","الصالة والطاولات"); addTool("home-analytics","Analytics","Today Analytics","تحليلات اليوم"); break;
      case "Operations": addTool("ops-orders","Orders","Service Orders","طلبات الخدمة"); addTool("ops-shifts","Workforce","Shift Control","إدارة الورديات"); addTool("ops-erp","ERP","Inventory & ERP","المخزون و ERP"); addTool("ops-analytics","Analytics","Operations Analytics","تحليلات العمليات"); break;
      case "Shift": addTool("shift-schedule","Workforce","Shift Schedule","جدول الورديات"); addTool("shift-team","Team","Team Status","حالة الفريق"); addBooking(); addTool("shift-work","My Work","My Tasks","مهامي"); break;
      case "HQ": addTool("hq-analytics","Analytics","Group Analytics","تحليلات المجموعة"); addTool("hq-team","Team","Restaurant Team","فريق المطعم"); addTool("hq-guests","Guests","Guest Intelligence","بيانات الضيوف"); addTool("hq-profile","Profile","Organization Profile","ملف المؤسسة"); break;
      case "My Work": addTool("work-shifts","Workforce","My Shifts","وردياتي"); addTool("work-team","Team","Team","الفريق"); addTool("work-alerts","Alerts","Alerts","التنبيهات"); addTool("work-home","Home","Dashboard","لوحة التحكم"); break;
      case "Orders": addTool("orders-tables","Tables","Open Tables","الطاولات المفتوحة"); addTool("orders-menu","Menu","Menu","القائمة"); addBooking(); addTool("orders-analytics","Analytics","Order Analytics","تحليلات الطلبات"); break;
      case "Menu": addTool("menu-orders","Orders","Live Orders","الطلبات المباشرة"); addTool("menu-tables","Tables","Tables","الطاولات"); addTool("menu-analytics","Analytics","Menu Analytics","تحليلات القائمة"); addTool("menu-home","Home","Dashboard","لوحة التحكم"); break;
      case "Tables": addBooking(); addTool("tables-waitlist","Waitlist","Waitlist","قائمة الانتظار"); addTool("tables-orders","Orders","Table Orders","طلبات الطاولات"); addTool("tables-menu","Menu","Menu","القائمة"); break;
      case "Reservations": addBooking(); addTool("reservations-waitlist","Waitlist","Waitlist","قائمة الانتظار"); addTool("reservations-guests","Guests","Guest Profiles","ملفات الضيوف"); addTool("reservations-tables","Tables","Table Availability","توفر الطاولات"); break;
      case "Waitlist": addBooking(); addTool("wait-reservations","Reservations","Reservation Schedule","جدول الحجوزات"); addTool("wait-tables","Tables","Table Availability","توفر الطاولات"); addTool("wait-guests","Guests","Guest Profiles","ملفات الضيوف"); break;
      case "Workforce": addTool("shifts-team","Team","Team Directory","دليل الفريق"); addTool("shifts-work","My Work","My Work","عملي"); addTool("shifts-close","Daily Close","Daily Close","إقفال اليوم"); addBooking(); break;
      case "Automation": addTool("auto-work","My Work","Workflow Tasks","مهام سير العمل"); addTool("auto-shifts","Workforce","Shift Rules","قواعد الورديات"); addTool("auto-connect","Connect","Integrations","التكاملات"); addTool("auto-home","Home","Dashboard","لوحة التحكم"); break;
      case "ERP": addTool("erp-analytics","Analytics","ERP Analytics","تحليلات ERP"); addTool("erp-orders","Orders","Orders","الطلبات"); addTool("erp-close","Daily Close","Daily Close","إقفال اليوم"); addTool("erp-home","Home","Dashboard","لوحة التحكم"); break;
      case "Analytics": addTool("analytics-orders","Orders","Orders","الطلبات"); addTool("analytics-erp","ERP","ERP","ERP"); addTool("analytics-guests","Guests","Guest Analytics","تحليلات الضيوف"); addTool("analytics-close","Daily Close","Daily Close","إقفال اليوم"); break;
      case "Daily Close": addTool("close-analytics","Analytics","Day Analytics","تحليلات اليوم"); addTool("close-orders","Orders","Orders","الطلبات"); addTool("close-shifts","Workforce","Shift Summary","ملخص الورديات"); addTool("close-home","Home","Dashboard","لوحة التحكم"); break;
      case "Guests": addBooking(); addTool("guests-campaigns","Campaigns","Campaigns","الحملات"); addTool("guests-analytics","Analytics","Guest Analytics","تحليلات الضيوف"); addTool("guests-home","Home","Dashboard","لوحة التحكم"); break;
      case "Campaigns": addTool("campaigns-guests","Guests","Guest Segments","شرائح الضيوف"); addTool("campaigns-analytics","Analytics","Campaign Analytics","تحليلات الحملات"); addTool("campaigns-connect","Connect","Messaging Integrations","تكاملات الرسائل"); addTool("campaigns-home","Home","Dashboard","لوحة التحكم"); break;
      case "Connect": addTool("connect-devices","Devices","Devices","الأجهزة"); addTool("connect-auto","Automation","Automation","الأتمتة"); addTool("connect-profile","Profile","Profile","الحساب"); addTool("connect-home","Home","Dashboard","لوحة التحكم"); break;
      case "Devices": addTool("devices-connect","Connect","Integrations","التكاملات"); addTool("devices-tables","Tables","Tables","الطاولات"); addTool("devices-orders","Orders","Orders","الطلبات"); addTool("devices-home","Home","Dashboard","لوحة التحكم"); break;
      case "Team": addTool("team-shifts","Workforce","Shift Schedule","جدول الورديات"); addTool("team-work","My Work","My Work","عملي"); addTool("team-analytics","Analytics","Labor Analytics","تحليلات الموظفين"); addTool("team-profile","Profile","Profile","الحساب"); break;
      case "Profile": addTool("profile-connect","Connect","Integrations","التكاملات"); addTool("profile-devices","Devices","Devices","الأجهزة"); addTool("profile-work","My Work","My Work","عملي"); addTool("profile-home","Home","Dashboard","لوحة التحكم"); break;
      case "Alerts": addTool("alerts-work","My Work","My Work","عملي"); addTool("alerts-shifts","Workforce","Shifts","الورديات"); addTool("alerts-profile","Profile","Profile","الحساب"); addTool("alerts-home","Home","Dashboard","لوحة التحكم"); break;
      case "Kitchen": addTool("kitchen-orders","Orders","Kitchen Orders","طلبات المطبخ"); addTool("kitchen-menu","Menu","Menu","القائمة"); addTool("kitchen-work","My Work","My Work","عملي"); addTool("kitchen-shifts","Workforce","Shift","الوردية"); break;
      case "Floor": addTool("floor-tables","Tables","Floor Tables","طاولات الصالة"); addTool("floor-orders","Orders","Floor Orders","طلبات الصالة"); addBooking(); addTool("floor-shifts","Workforce","Shift","الوردية"); break;
      case "Host": addBooking(); addTool("host-reservations","Reservations","Reservation Schedule","جدول الحجوزات"); addTool("host-waitlist","Waitlist","Waitlist","قائمة الانتظار"); addTool("host-tables","Tables","Table Availability","توفر الطاولات"); break;
      case "Cashier": addTool("cashier-orders","Orders","Orders","الطلبات"); addTool("cashier-close","Daily Close","Daily Close","إقفال اليوم"); addTool("cashier-analytics","Analytics","Sales Analytics","تحليلات المبيعات"); addTool("cashier-work","My Work","My Work","عملي"); break;
      case "Restaurants": addTool("restaurants-home","Home","Dashboard","لوحة التحكم"); addTool("restaurants-profile","Profile","Profile","الحساب"); break;
      case "Settings": addTool("settings-profile","Profile","Profile","الحساب"); addTool("settings-home","Home","Dashboard","لوحة التحكم"); break;
      case "More": addAllTools(); addTool("more-profile","Profile","Profile","الحساب"); addTool("more-connect","Connect","Integrations","التكاملات"); addTool("more-devices","Devices","Devices","الأجهزة"); break;
      default: addAllTools(); addTool("default-home","Home","Dashboard","لوحة التحكم"); addTool("default-profile","Profile","Profile","الحساب"); break;
    }

    if(item.en!=="More"&&!actions.some(action=>action.to===item.to)){
      actions.unshift({key:"open-"+item.to,to:item.to,icon:item.icon,en:"Open "+item.en,ar:"فتح "+item.ar});
    }
    return actions.slice(0,4);
  }

  async function runIOSQuickAction(action:IOSQuickAction){
    closeIOSQuickMenu();
    fireIOSHaptic("light");
    if(action.command==="more"){ setMoreOpen(true); return; }
    if(!action.to)return;
    await navigate({to:action.to as never,search:(action.search??{}) as never});
  }
  useEffect(()=>{
    if(!iosQuickItem||typeof document==="undefined")return;
    const root=document.documentElement;
    const keepSelectionCleared=()=>clearIOSSelection();
    root.classList.add("qs-ios-context-active");
    clearIOSSelection();
    document.addEventListener("selectionchange",keepSelectionCleared);
    return ()=>{
      document.removeEventListener("selectionchange",keepSelectionCleared);
      root.classList.remove("qs-ios-context-active");
      clearIOSSelection();
    };
  },[iosQuickItem]);

  if (access.isPending || access.isSuperAdmin) return null;

  const normalizedToolSearch = toolSearch.trim().toLocaleLowerCase(lang === "ar" ? "ar" : "en");
  const visibleTools = normalizedToolSearch
    ? desktopItems.filter((item) => `${item.en} ${item.ar}`.toLocaleLowerCase(lang === "ar" ? "ar" : "en").includes(normalizedToolSearch))
    : desktopItems;

  function toolHint(item: Item) {
    const hints: Record<string, { en: string; ar: string }> = {
      Home: { en: "Dashboard & insights", ar: "لوحة التحكم والرؤى" },
      Operations: { en: "Operations workspace", ar: "مساحة العمليات" },
      Shift: { en: "Shift workspace", ar: "مساحة الوردية" },
      "My Work": { en: "Your tasks & activity", ar: "مهامك ونشاطك" },
      Orders: { en: "Manage customer orders", ar: "إدارة طلبات العملاء" },
      Menu: { en: "Items & categories", ar: "العناصر والفئات" },
      Tables: { en: "Table management", ar: "إدارة الطاولات" },
      Reservations: { en: "View and manage reservations", ar: "عرض وإدارة الحجوزات" },
      Waitlist: { en: "Customer queue", ar: "قائمة انتظار العملاء" },
      Workforce: { en: "Scheduling, attendance & labor", ar: "الجدولة والحضور وساعات العمل" },
      Automation: { en: "Rules & workflows", ar: "القواعد وسير العمل" },
      ERP: { en: "Inventory & procurement", ar: "المخزون والمشتريات" },
      Analytics: { en: "Reports & insights", ar: "التقارير والرؤى" },
      "Daily Close": { en: "End of day operations", ar: "عمليات إقفال اليوم" },
      Guests: { en: "Guest CRM & loyalty", ar: "الضيوف والولاء" },
      Campaigns: { en: "Customer campaigns", ar: "حملات العملاء" },
      Connect: { en: "Integrations & channels", ar: "التكاملات والقنوات" },
      Devices: { en: "Hardware & devices", ar: "الأجهزة والمعدات" },
      Team: { en: "People & permissions", ar: "الفريق والصلاحيات" },
      Profile: { en: "Account settings", ar: "إعدادات الحساب" },
    };
    const hint = hints[item.en];
    return hint ? (lang === "ar" ? hint.ar : hint.en) : (lang === "ar" ? "فتح الأداة" : "Open tool");
  }

  const brand = useRestaurantLogo ? (
    <span className="flex min-w-0 items-center gap-2">
      <span className="flex h-10 max-w-[112px] shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border/70 bg-white px-2 shadow-sm"><img src={restaurant!.logo_url!} alt={restaurant?.name ?? "Restaurant"} className="h-7 w-auto max-w-full object-contain" /></span>
      <span className="truncate text-sm font-bold">{restaurant?.name}</span>
    </span>
  ) : (
    <BrandLogo className="size-8" accentClassName="text-[#e85d2a]" textClassName="text-[18px] text-foreground" />
  );

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="qs-tablet-nav-trigger fixed start-4 top-3 z-50 shadow-sm"
        onClick={() => setMoreOpen(true)}
        aria-label={lang === "ar" ? "فتح مساحة العمل" : "Open workspace navigation"}
      >
        <LayoutGrid className="size-5" />
      </Button>
      <aside className="qs-sidebar-shell fixed inset-y-0 start-0 z-50 hidden flex-col lg:flex">
        <div className="flex h-[var(--qs-shell-topbar)] items-center border-b border-border/80 px-4">
          <Link to={homeTo as never} className="min-w-0 text-foreground" aria-label={restaurant?.name || "QuickServe dashboard"}>{brand}</Link>
        </div>

        <nav className="qs-scroll flex-1 overflow-y-auto px-3 py-4" aria-label={lang === "ar" ? "التنقل الرئيسي" : "Primary navigation"}>
          <ul className="space-y-1">
            {desktopPrimary.map((item) => {
              const active = activeFor(item);
              const Icon = item.icon;
              const count = countFor(item);
              return (
                <li key={`${item.to}-${item.en}`}>
                  <Link to={item.to as never} preload="render" data-active={active} className="qs-sidebar-item" aria-current={active ? "page" : undefined}>
                    <Icon className="size-[18px] shrink-0" />
                    <span className="min-w-0 flex-1 truncate">{lang === "ar" ? item.ar : item.en}</span>
                    {count > 0 ? <span className="min-w-6 rounded-full bg-[#e85d2a] px-1.5 py-0.5 text-center text-[10px] font-bold text-white shadow-sm">{count > 99 ? "99+" : count}</span> : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="border-t border-border/80 p-3">
          {desktopHasMore ? (
            <button type="button" className="qs-sidebar-item w-full" onClick={() => setMoreOpen(true)} aria-expanded={moreOpen}>
              <MoreHorizontal className="size-[18px] shrink-0" />
              <span className="min-w-0 flex-1 text-start">{lang === "ar" ? "كل الأدوات" : "All tools"}</span>
              <span className="text-xs text-muted-foreground">{desktopItems.length - desktopPrimary.length}</span>
            </button>
          ) : null}
          {!desktopPrimary.some((item)=>item.to==="/profile")?<Link to="/profile" preload="render" data-active={activeFor({ to: "/profile", icon: Settings, en: "Settings", ar: "الإعدادات", exact: true })} className="qs-sidebar-item mt-1">
            <Settings className="size-[18px] shrink-0" />
            <span className="min-w-0 flex-1 truncate">{lang === "ar" ? "الإعدادات" : "Settings"}</span>
          </Link>:null}
        </div>
      </aside>

      <ViewportDock dir={lang === "ar" ? "rtl" : "ltr"}>
      <nav aria-label={lang === "ar" ? "التنقل الرئيسي" : "Primary navigation"} onContextMenu={event=>{if(isIOSMobile())event.preventDefault();}} className="qs-mobile-bottom-nav safe-bottom fixed inset-x-3 bottom-2 z-50 lg:hidden">
        <div className="qs-mobile-bottom-nav-shell grid overflow-hidden" style={{ gridTemplateColumns: `repeat(${Math.max(1, mobilePrimary.length + (mobileHasMore ? 1 : 0))}, minmax(0,1fr))` }}>
          {mobilePrimary.map((item) => {
            const active = activeFor(item);
            const Icon = item.icon;
            const count = countFor(item);
            return (
              <Link
                key={`${item.to}-${item.en}`}
                to={item.to as never}
                preload="render"
                aria-current={active?"page":undefined}
                aria-label={count > 0 ? `${lang === "ar" ? item.ar : item.en}, ${count} ${lang === "ar" ? "تحديثات" : "updates"}` : undefined}
                data-ios-pressed={pressedNavKey===`${item.to}-${item.en}`||undefined}
                data-ios-context-source={iosQuickItem?.to===item.to&&iosQuickItem?.en===item.en||undefined}
                onTouchStart={event=>{const touch=event.touches[0];startLongPress(item,event.currentTarget,touch?.clientX??0,touch?.clientY??0);}}
                onTouchEnd={cancelLongPress}
                onTouchCancel={cancelLongPress}
                onTouchMove={event=>{const touch=event.touches[0];if(touch)moveLongPress(touch.clientX,touch.clientY);}}
                onContextMenu={event=>{if(isIOSMobile())event.preventDefault();}}
                onClick={event=>{void consumeLongPressClick(event);}}
                className={cn("qs-mobile-nav-item qs-ios-haptic-nav-item relative flex min-h-[62px] min-w-0 flex-col items-center justify-center gap-1 text-[10px] font-semibold transition", active ? "is-active text-[var(--restaurant-selected-nav,#e85d2a)]" : "text-muted-foreground")}
              >
                <span className="qs-mobile-nav-icon relative"><Icon className="size-5" />{count > 0 ? <span aria-hidden="true" className="qs-mobile-nav-badge">{count > 99 ? "99+" : count}</span> : null}</span>
                <span className="qs-mobile-nav-label w-full truncate px-1 text-center">{item.to === "/bookings" && lang === "en" ? "Bookings" : lang === "ar" ? item.ar : item.en}</span>
              </Link>
            );
          })}
          {mobileHasMore ? (()=>{const moreItem:Item={to:"__more__",icon:MoreHorizontal,en:"More",ar:"المزيد"};return (
            <button
              type="button"
              data-ios-pressed={pressedNavKey==="__more__-More"||undefined}
              data-ios-context-source={iosQuickItem?.en==="More"||undefined}
              onTouchStart={event=>{const touch=event.touches[0];startLongPress(moreItem,event.currentTarget,touch?.clientX??0,touch?.clientY??0);}}
              onTouchEnd={cancelLongPress}
              onTouchCancel={cancelLongPress}
              onTouchMove={event=>{const touch=event.touches[0];if(touch)moveLongPress(touch.clientX,touch.clientY);}}
              onContextMenu={event=>{if(isIOSMobile())event.preventDefault();}}
              onClick={event=>{if(consumeLongPressClick(event))return;setMoreOpen(true);}}
              aria-expanded={moreOpen}
              aria-haspopup="dialog"
              className={cn("qs-mobile-nav-item qs-mobile-nav-more qs-ios-haptic-nav-item relative flex min-h-[62px] min-w-0 flex-col items-center justify-center gap-1 text-[10px] font-semibold transition", mobileMoreActive ? "is-active" : "text-muted-foreground")}
            >
              <span className="qs-mobile-nav-icon"><MoreHorizontal className="size-5" /></span>
              <span className="qs-mobile-nav-label w-full truncate px-1 text-center">{lang === "ar" ? "المزيد" : "More"}</span>
            </button>
          )})() : null}
        </div>
      </nav>

      </ViewportDock>

      {iosQuickItem&&iosQuickAnchor?(
        <div className="qs-ios-context-layer lg:hidden" role="presentation">
          <button type="button" className="qs-ios-context-backdrop" aria-label={lang==="ar"?"إغلاق الإجراءات السريعة":"Close quick actions"} onClick={closeIOSQuickMenu}/>
          <div
            className="qs-ios-context-menu"
            role="menu"
            aria-label={lang==="ar"?`إجراءات ${iosQuickItem.ar}`:`${iosQuickItem.en} quick actions`}
            style={{left:iosQuickAnchor.menuLeft,bottom:iosQuickAnchor.menuBottom}}
            onClick={event=>event.stopPropagation()}
            onContextMenu={event=>event.preventDefault()}
          >
            {quickActionsFor(iosQuickItem).map((action,index,all)=>{
              const Icon=action.icon;
              return <button key={action.key} type="button" role="menuitem" className="qs-ios-context-action" onClick={()=>void runIOSQuickAction(action)}>
                <span>{lang==="ar"?action.ar:action.en}</span>
                <Icon className="size-[18px]"/>
                {index<all.length-1?<i aria-hidden="true"/>:null}
              </button>;
            })}
          </div>
          <div
            className={cn("qs-ios-context-source-lift",activeFor(iosQuickItem)&&"is-active")}
            aria-hidden="true"
            style={{left:iosQuickAnchor.previewLeft,bottom:iosQuickAnchor.previewBottom,width:iosQuickAnchor.previewWidth}}
          >
            <span className="qs-mobile-nav-icon">{(()=>{const Icon=iosQuickItem.icon;return <Icon className="size-5"/>;})()}</span>
            <span className="qs-mobile-nav-label">{lang==="ar"?iosQuickItem.ar:iosQuickItem.en}</span>
          </div>
        </div>
      ):null}
      <Dialog open={moreOpen} onOpenChange={changeMoreOpen}>
        <DialogContent
          overlayClassName="qs-workspace-tools-overlay"
          className="qs-workspace-tools-dialog max-h-[min(92dvh,820px)] max-w-[1120px] gap-0 overflow-hidden p-0"
          onOpenAutoFocus={(event) => {
            if (typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches) event.preventDefault();
          }}
        >
          <div className="qs-workspace-tools-layout">
            <aside className="qs-workspace-tools-spotlight" style={(appearance.workspaceToolsImage ?? restaurant?.cover_image_url) ? { backgroundImage: `linear-gradient(180deg,rgba(16,14,12,.18),rgba(16,14,12,.86)),url(${appearance.workspaceToolsImage ?? restaurant?.cover_image_url})` } : undefined}>
              <div className="qs-workspace-tools-spotlight-copy">
                <strong>{lang === "ar" ? "كل ما تحتاجه في مكان واحد" : "Everything you need in one place."}</strong>
                <p>{lang === "ar" ? "أدر الطلبات والقائمة والفريق والتحليلات والمزيد من مساحة عمل واحدة." : "Manage orders, menu, team, analytics and more from a single workspace."}</p>
              </div>
              <div className="qs-workspace-tools-spotlight-brand">
                {(appearance.workspaceToolsIcon ?? restaurant?.logo_url) ? <img src={appearance.workspaceToolsIcon ?? restaurant?.logo_url ?? ""} alt="" /> : <BrandLogo className="size-8" accentClassName="text-[#ff6a1a]" textClassName="text-xl text-white" />}
                <span>{restaurant?.name ?? "QuickServe"}</span>
              </div>
            </aside>
            <div className="min-w-0 bg-card">
              <DialogHeader className="border-b border-border bg-card px-5 py-5 pe-14 text-start sm:px-6">
                <div className="flex items-start gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><LayoutGrid className="size-5" /></span>
                  <div className="min-w-0">
                    <DialogTitle>{lang === "ar" ? "كل أدوات مساحة العمل" : "All workspace tools"}</DialogTitle>
                    <DialogDescription>{lang === "ar" ? "انتقل بسرعة إلى أي أداة متاحة لدورك." : "Find and open any tool available to your role."}</DialogDescription>
                  </div>
                </div>
                <div className="qs-search-field mt-4">
                  <Search />
                  <Input value={toolSearch} inputMode="search" onChange={(event) => setToolSearch(event.target.value)} placeholder={lang === "ar" ? "ابحث عن الطلبات، الفريق، التحليلات…" : "Search orders, team, analytics…"} aria-label={lang === "ar" ? "البحث في الأدوات" : "Search tools"} />
                </div>
              </DialogHeader>
              <div className="qs-scroll qs-workspace-tools-scroll max-h-[calc(92dvh-190px)] overflow-y-auto overscroll-contain p-4 pb-[calc(20px+env(safe-area-inset-bottom))] sm:p-6">
                <div className="qs-workspace-tools-groups space-y-6">
                {(["overview","service","operations","growth","admin"] as NavGroup[]).map(group => {
                  const items = visibleTools.filter(item => item.group === group || (!item.group && group === "overview"));
                  if (items.length === 0) return null;
                  return <section key={group} className="qs-workspace-tools-group">
                    <p className="mb-2.5 px-1 text-[10px] font-black uppercase tracking-[.14em] text-muted-foreground">{groupLabel(group)}</p>
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {items.map(item => {
                        const Icon = item.icon;
                        const active = activeFor(item);
                        const count = countFor(item);
                        return <Link key={`${item.to}-more`} to={item.to as never} onClick={() => changeMoreOpen(false)} className={cn("qs-workspace-tool-card group flex min-h-[70px] items-center gap-3 rounded-xl border px-3 py-2.5 text-sm font-bold transition", active ? "is-active border-primary/40 bg-primary/8 text-foreground" : "border-border/80 bg-card text-foreground hover:border-primary/25 hover:bg-muted/35")}>
                          <span className={cn("grid size-9 shrink-0 place-items-center rounded-[10px] transition", active ? "bg-primary/12 text-primary" : "bg-[#f7f2ea] text-[#8a7661] dark:bg-muted dark:text-muted-foreground group-hover:text-foreground")}><Icon className="size-[17px]" /></span>
                          <span className="min-w-0 flex-1 text-start">
                            <strong className="block truncate text-xs">{lang === "ar" ? item.ar : item.en}</strong>
                            <small className="mt-0.5 block truncate text-[9px] font-medium text-muted-foreground">{toolHint(item)}</small>
                          </span>
                          {count > 0 ? <span className="min-w-5 rounded-full bg-red-500 px-1.5 py-1 text-center text-[8px] font-black text-white">{count > 99 ? "99+" : count}</span> : <ChevronRight className={cn("size-3.5 text-muted-foreground transition group-hover:translate-x-0.5", lang === "ar" && "rotate-180 group-hover:-translate-x-0.5")} />}
                        </Link>;
                      })}
                    </div>
                  </section>;
                })}
                {visibleTools.length === 0 ? <div className="grid min-h-40 place-items-center rounded-xl border border-dashed border-border bg-muted/20 p-6 text-center"><div><Search className="mx-auto size-6 text-muted-foreground"/><p className="mt-3 text-sm font-bold">{lang === "ar" ? "لم نعثر على أداة مطابقة" : "No matching tool"}</p><button type="button" onClick={() => setToolSearch("")} className="mt-2 text-xs font-bold text-primary">{lang === "ar" ? "مسح البحث" : "Clear search"}</button></div></div> : null}
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
