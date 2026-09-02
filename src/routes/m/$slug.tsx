import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, FileText, ShoppingBag } from "lucide-react";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

const searchSchema = z.object({ t: z.string().optional() });

export const Route = createFileRoute("/m/$slug")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Digital Menu — QuickServe" },
      { name: "description", content: "View the restaurant's original PDF menu and continue to QuickServe ordering." },
    ],
  }),
  component: PublicPdfMenuPage,
});

function PublicPdfMenuPage() {
  const { slug } = Route.useParams();
  const { t: tableToken } = Route.useSearch();
  const query = useQuery({
    queryKey: ["public-pdf-menu", slug],
    queryFn: async () => {
      const { data, error } = await (supabase.from("restaurants") as any)
        .select("id,name,logo_url,menu_pdf_url,menu_pdf_name")
        .eq("slug", slug)
        .single();
      if (error) throw error;
      return data as { id: string; name: string; logo_url: string | null; menu_pdf_url: string | null; menu_pdf_name: string | null };
    },
    retry: false,
  });

  if (query.isPending) return <div className="min-h-screen bg-muted/20 p-4"><div className="mx-auto max-w-3xl animate-pulse rounded-3xl bg-muted" style={{ height: "80vh" }} /></div>;
  if (query.isError || !query.data) return <div className="grid min-h-screen place-items-center p-6 text-center"><div><FileText className="mx-auto size-10 text-muted-foreground" /><h1 className="mt-4 text-xl font-semibold">Menu unavailable</h1><p className="mt-2 text-sm text-muted-foreground">This restaurant does not have a published PDF menu.</p></div></div>;

  const restaurant = query.data;
  const orderingUrl = tableToken ? `/r/${slug}?t=${encodeURIComponent(tableToken)}` : `/r/${slug}`;

  return (
    <main className="min-h-screen bg-muted/20 text-foreground">
      <header className="sticky top-0 z-20 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between gap-3 px-4">
          <div className="flex min-w-0 items-center gap-3">
            {restaurant.logo_url ? <img src={restaurant.logo_url} alt="" className="size-9 rounded-lg object-cover" /> : <div className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary"><FileText className="size-4" /></div>}
            <div className="min-w-0"><p className="truncate font-semibold">{restaurant.name}</p><p className="text-xs text-muted-foreground">Digital menu</p></div>
          </div>
          <Button asChild size="sm" className="shrink-0"><Link to={orderingUrl as any}><ShoppingBag className="mr-1.5 size-4" /> Order</Link></Button>
        </div>
      </header>

      <section className="mx-auto max-w-3xl px-3 py-4 sm:px-5 sm:py-6">
        <div className="mb-4 rounded-2xl border bg-background p-4 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><FileText className="size-5" /></div>
            <div className="min-w-0 flex-1"><h1 className="font-semibold">{restaurant.name} menu</h1><p className="mt-1 text-sm text-muted-foreground">This is the original menu supplied by the restaurant. When you're ready, continue to the interactive QuickServe menu to add items to your cart.</p></div>
          </div>
          <Button asChild className="mt-4 w-full sm:w-auto"><Link to={orderingUrl as any}>Continue to ordering <ArrowRight className="ml-2 size-4" /></Link></Button>
        </div>

        <div className="overflow-hidden rounded-2xl border bg-background shadow-sm">
          <iframe title={`${restaurant.name} original PDF menu`} src={restaurant.menu_pdf_url ?? ""} className="h-[calc(100vh-170px)] min-h-[680px] w-full" />
        </div>
        {restaurant.menu_pdf_name ? <p className="px-2 pt-3 text-center text-xs text-muted-foreground">{restaurant.menu_pdf_name}</p> : null}
      </section>
    </main>
  );
}
