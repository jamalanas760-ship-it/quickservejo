import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { PublicSiteShell } from "@/components/public/PublicSiteShell";
import { supabase } from "@/integrations/supabase/client";
import { humanError } from "@/lib/errors";
import { useI18n } from "@/lib/i18n";
import { roleDestination } from "@/lib/post-signin";
import { staffBadgeSignIn } from "@/lib/staff-auth.functions";

export const Route = createFileRoute("/staff/badge/$code")({
  head: () => ({
    meta: [
      { title: "Staff badge sign in — QuickServe" },
      {
        name: "description",
        content: "Scanning a QuickServe staff badge signs the team member into their workspace.",
      },
      { property: "og:title", content: "Staff badge sign in — QuickServe" },
      { property: "og:description", content: "One scan opens the staff workspace." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BadgePage,
});

function BadgePage() {
  const { code } = Route.useParams();
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const signIn = useServerFn(staffBadgeSignIn);
  const started = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void (async () => {
      try {
        const result = await signIn({ data: { code } });
        const { error: otpError } = await supabase.auth.verifyOtp({
          type: "magiclink",
          token_hash: result.tokenHash,
        });
        if (otpError) throw otpError;
        navigate({ to: await roleDestination(), replace: true });
      } catch (err) {
        setError(humanError(err, lang));
      }
    })();
  }, [code, lang, navigate, signIn]);

  return (
    <PublicSiteShell showSignIn={false} contentClassName="grid min-h-[calc(100dvh-130px)] max-w-xl place-items-center">
      <div className="qs-card w-full space-y-4 p-7 text-center sm:p-10">
        <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-orange-500/10 font-display text-xl font-bold text-[#e34d00]">QS</span>
        <h1 className="text-lg font-semibold">
          {error ? t("staffAuth.badgeFailed") : t("staffAuth.badgeSigningIn")}
        </h1>
        {error ? <p className="text-sm text-muted-foreground">{error}</p> : null}
        {error ? (
          <Button asChild variant="outline">
            <Link to="/staff">{t("staffAuth.title")}</Link>
          </Button>
        ) : null}
      </div>
    </PublicSiteShell>
  );
}
