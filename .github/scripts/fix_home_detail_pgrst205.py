from pathlib import Path

path = Path("src/components/dashboard/HomeMetricDetail.tsx")
text = path.read_text(encoding="utf-8")

old = '''    queryKey: ["workspace", "home-metric-detail", restaurantId],
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
      const since = new Date(todayStart); since.setDate(since.getDate() - 6);
      const [{ data: orders, error: orderError }, { data: tables, error: tableError }, { data: events, error: eventError }] = await Promise.all([
        supabase.from("orders").select("id,order_number,status,payment_status,total,table_id,created_at,updated_at").eq("restaurant_id", restaurantId).gte("created_at", since.toISOString()).order("created_at", { ascending: true }),
        supabase.from("restaurant_tables").select("*").eq("restaurant_id", restaurantId).order("table_number", { ascending: true }),
        supabase.from("order_status_events").select("order_id,to_status,created_at").eq("restaurant_id", restaurantId).gte("created_at", todayStart.toISOString()).order("created_at", { ascending: true }),
      ]);
      if (orderError) throw orderError; if (tableError) throw tableError; if (eventError) throw eventError;
      return { orders: (orders ?? []) as unknown as OrderRow[], tables: (tables ?? []) as unknown as TableRow[], events: (events ?? []) as unknown as StatusEvent[], todayStart: todayStart.toISOString() };
    },'''

new = '''    queryKey: ["workspace", "home-metric-detail", restaurantId, metric],
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
      const since = new Date(todayStart); since.setDate(since.getDate() - 6);
      const [{ data: orders, error: orderError }, { data: tables, error: tableError }] = await Promise.all([
        supabase.from("orders").select("id,order_number,status,payment_status,total,table_id,created_at,updated_at").eq("restaurant_id", restaurantId).gte("created_at", since.toISOString()).order("created_at", { ascending: true }),
        supabase.from("restaurant_tables").select("*").eq("restaurant_id", restaurantId).order("table_number", { ascending: true }),
      ]);
      if (orderError) throw orderError;
      if (tableError) throw tableError;

      let events: StatusEvent[] = [];
      let timingEventsAvailable = metric !== "order-time";
      if (metric === "order-time") {
        const eventResult = await supabase.from("order_status_events").select("order_id,to_status,created_at").eq("restaurant_id", restaurantId).gte("created_at", todayStart.toISOString()).order("created_at", { ascending: true });
        if (eventResult.error) {
          if (eventResult.error.code === "PGRST205") {
            timingEventsAvailable = false;
          } else {
            throw eventResult.error;
          }
        } else {
          events = (eventResult.data ?? []) as unknown as StatusEvent[];
          timingEventsAvailable = true;
        }
      }

      return { orders: (orders ?? []) as unknown as OrderRow[], tables: (tables ?? []) as unknown as TableRow[], events, timingEventsAvailable, todayStart: todayStart.toISOString() };
    },'''

if old not in text:
    raise SystemExit("Expected home detail query block was not found")
text = text.replace(old, new, 1)

old_call = '''    {metric === "order-time" ? <OrderTimeDetail ar={ar} lang={lang} durations={durations} average={averageMinutes} /> : null}'''
new_call = '''    {metric === "order-time" ? <OrderTimeDetail ar={ar} lang={lang} durations={durations} average={averageMinutes} timingEventsAvailable={detail.data.timingEventsAvailable} /> : null}'''
if old_call not in text:
    raise SystemExit("Expected order-time render call was not found")
text = text.replace(old_call, new_call, 1)

old_sig = '''function OrderTimeDetail({ ar, lang, durations, average }: { ar:boolean;lang:"ar"|"en";durations:Array<{order:OrderRow;end:StatusEvent;minutes:number}>;average:number|null }) {'''
new_sig = '''function OrderTimeDetail({ ar, lang, durations, average, timingEventsAvailable }: { ar:boolean;lang:"ar"|"en";durations:Array<{order:OrderRow;end:StatusEvent;minutes:number}>;average:number|null;timingEventsAvailable:boolean }) {'''
if old_sig not in text:
    raise SystemExit("Expected OrderTimeDetail signature was not found")
text = text.replace(old_sig, new_sig, 1)

old_empty = '''<h2 className="mt-4 text-lg font-bold">{ar?"لا توجد بيانات توقيت موثوقة بعد":"Not enough reliable timing data yet"}</h2><p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-muted-foreground">{ar?"لن يعرض QuickServe متوسطاً تقديرياً. سيظهر القياس عندما تتوفر للطلبات أحداث Served أو Paid مسجلة فعلياً.":"QuickServe will not invent an estimated average. Timing appears once orders have real Served or Paid status events."}</p>'''
new_empty = '''<h2 className="mt-4 text-lg font-bold">{timingEventsAvailable?(ar?"لا توجد بيانات توقيت موثوقة بعد":"Not enough reliable timing data yet"):(ar?"سجل أوقات الطلب غير مفعّل بعد":"Order timing history is not configured yet")}</h2><p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-muted-foreground">{timingEventsAvailable?(ar?"لن يعرض QuickServe متوسطاً تقديرياً. سيظهر القياس عندما تتوفر للطلبات أحداث Served أو Paid مسجلة فعلياً.":"QuickServe will not invent an estimated average. Timing appears once orders have real Served or Paid status events."):(ar?"صفحات المبيعات والطلبات والطاولات تعمل بشكل مستقل. وسيظهر متوسط وقت الطلب تلقائياً بعد إضافة سجل حالات الطلب إلى قاعدة البيانات.":"Sales, Orders, and Tables details work independently. Average Order Time will appear automatically once order status history is available in the database.")}</p>'''
if old_empty not in text:
    raise SystemExit("Expected timing empty-state content was not found")
text = text.replace(old_empty, new_empty, 1)

path.write_text(text, encoding="utf-8")
print("Home detail PGRST205 fix applied")
