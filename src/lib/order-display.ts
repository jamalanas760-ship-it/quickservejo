export function statusLabel(status: string, ar: boolean) {
  const labels: Record<string, string> = { new: "جديد", accepted: "مقبول", preparing: "قيد التحضير", ready: "جاهز", served: "تم التقديم", paid: "مدفوع", cancelled: "ملغي" };
  return ar ? labels[status] ?? status : status;
}

export function elapsed(createdAt: string, ar: boolean, now: number) {
  const minutes = Math.max(0, Math.floor((now - new Date(createdAt).getTime()) / 60_000));
  return Number.isFinite(minutes) ? `${minutes.toLocaleString(ar ? "ar-JO" : "en-US")} ${ar ? "دقيقة" : "min"}` : "—";
}

