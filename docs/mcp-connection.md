# Connecting AI clients to QuickServe

The deployed Supabase project currently returns `OAuth server is disabled`.
Application changes alone cannot enable the hosted authentication service.
A project owner must configure Authentication → OAuth Server for project
`gtcmyaksmyiarokloyje`:

1. Enable OAuth Server.
2. Enable dynamic client registration.
3. Set Site URL to the published QuickServe origin (HTTPS).
4. Set Authorization Path to `/.lovable/oauth/consent`.
5. Add the published site's consent URL to allowed sign-in redirects, preserving existing entries.

The signing keys already support ES256; do not rotate keys or disable authentication
to work around this error. Never put a service-role key or management token in an AI client.

In QuickServe, open Integrations → MCP & AI → Check OAuth setup.
“OAuth discovery ready” verifies public metadata and signing keys, not a completed
connection in any AI client. Copy the published site's `/mcp` URL.
Sign in and explicitly approve each client. Existing tenant permissions still apply.

- **ChatGPT:** add a custom MCP app in developer mode with OAuth. Account/workspace access policies apply.
- **Claude:** add a custom connector; choose **Register automatically** for OAuth.
- **Gemini:** custom apps currently require an eligible US personal account, age 18+, English, and activity enabled. Use Gemini CLI's Streamable HTTP MCP + OAuth support if consumer custom apps are unavailable.
- **Grok:** Connectors → New Connector → Custom; add the MCP URL and complete authorization.

After changing server settings, restart the failed authorization from the AI client
to obtain a fresh request. Test listing restaurants first, then read-only tools.
Reservation creation changes live data and requires appropriate restaurant permissions.

Primary references:
- https://supabase.com/docs/guides/auth/oauth-server/getting-started
- https://developers.openai.com/api/docs/guides/custom-mcp-server
- https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp
- https://support.google.com/gemini/answer/17209137
- https://geminicli.com/docs/tools/mcp-server/
- https://docs.x.ai/grok/connectors
