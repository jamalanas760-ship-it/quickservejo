import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { validAuthorizationId, safeOAuthCallback } from "@/lib/mcp-oauth";
import { OAuthConsentCard, OAuthConsentError } from "@/components/integrations/OAuthConsentCard";
export const Route = createFileRoute("/.lovable/oauth/consent")({
  ssr: false,
  staleTime: 0,
  gcTime: 0,
  validateSearch: (s: Record<string, unknown>) => ({
    authorization_id: validAuthorizationId(s["authorization_id"]) ? s["authorization_id"] : "",
  }),
  loaderDeps: ({ search }) => ({ authorizationId: search.authorization_id }),
  beforeLoad: async ({ search }) => {
    if (!search.authorization_id) throw new Error("Invalid authorization request");
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    if (!data.session)
      throw redirect({
        to: "/auth",
        search: {
          redirect: `/.lovable/oauth/consent?authorization_id=${encodeURIComponent(search.authorization_id)}`,
        },
      });
  },
  loader: async ({ deps }) => {
    const { data, error } = await supabase.auth.oauth.getAuthorizationDetails(deps.authorizationId);
    if (error) throw error;
    if (!data) throw new Error("Authorization unavailable");
    if ("redirect_url" in data) throw redirect({ href: safeOAuthCallback(data.redirect_url) });
    return data;
  },
  component: ConsentPage,
  errorComponent: OAuthConsentError,
});

function ConsentPage() {
  const details = Route.useLoaderData();
  const { authorization_id } = Route.useSearch();
  return <OAuthConsentCard details={details} authorizationId={authorization_id} />;
}
