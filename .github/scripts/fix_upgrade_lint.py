from pathlib import Path

path = Path("src/components/dashboard/HomeMetricDetail.tsx")
text = path.read_text(encoding="utf-8")

text = text.replace('import { useMemo } from "react";\n', '')
text = text.replace(
    '  const daily = useMemo(() => Array.from({ length: 7 }, (_, index) => {',
    '  const daily = Array.from({ length: 7 }, (_, index) => {'
)
text = text.replace(
    '  }), [allOrders, ar]);\n  const hourly = useMemo(() => Array.from({ length: 24 }, (_, hour) => ({ hour: `${String(hour).padStart(2, "0")}:00`, sales: todayOrders.filter((order) => new Date(order.created_at).getHours() === hour).reduce((sum, order) => sum + Number(order.total ?? 0), 0), orders: todayOrders.filter((order) => new Date(order.created_at).getHours() === hour).length })).filter((row) => row.sales > 0 || row.orders > 0), [todayOrders]);',
    '  });\n  const hourly = Array.from({ length: 24 }, (_, hour) => ({ hour: `${String(hour).padStart(2, "0")}:00`, sales: todayOrders.filter((order) => new Date(order.created_at).getHours() === hour).reduce((sum, order) => sum + Number(order.total ?? 0), 0), orders: todayOrders.filter((order) => new Date(order.created_at).getHours() === hour).length })).filter((row) => row.sales > 0 || row.orders > 0);'
)

if "useMemo" in text:
    raise RuntimeError("useMemo still present in HomeMetricDetail.tsx")

path.write_text(text, encoding="utf-8")
print("HomeMetricDetail lint fix applied.")
