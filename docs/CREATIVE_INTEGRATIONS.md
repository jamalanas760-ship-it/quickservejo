# QuickServe Creative Integrations

QuickServe uses a provider-adapter architecture so the AI menu model remains provider-neutral.

## Figma

Register a Figma OAuth app and configure:

`https://your-domain.com/integrations/figma/callback`

QuickServe requests file-content and metadata read scopes. Figma's REST API is excellent for reading/syncing existing files, but it is not a general-purpose endpoint for creating arbitrary editable design nodes. For true menu generation, the repository includes `integrations/figma-plugin`, which turns QuickServe's structured menu JSON into native editable Figma layers. This avoids flattening the menu into an image.

Figma OAuth documentation: https://developers.figma.com/docs/rest-api/oauth-apps/

## Canva

Create a Canva Connect integration and configure the same style of callback:

`https://your-domain.com/integrations/canva/callback`

Enable the minimum required scopes for design content, assets and brand templates. Canva's Autofill API can create or update designs from brand templates using text and image fields. The Autofill APIs require Canva Enterprise membership for the integration/user flow (with limited development trial access for paid plans).

Canva OAuth: https://www.canva.dev/docs/connect/authentication/
Canva Autofill: https://www.canva.dev/docs/connect/api-reference/autofills/create-design-autofill-job/

Set `CANVA_BRAND_TEMPLATE_ID` to the production menu template used by QuickServe.

## Adobe

Use Adobe Express Embed SDK v4 for the in-app editor. Adobe currently requires business approval for new Embed SDK integrations, so the integration should be enabled only after Adobe approves the QuickServe project.

Configure:

`ADOBE_EXPRESS_CLIENT_ID`
`ADOBE_EXPRESS_APP_NAME`

The Express SDK is loaded client-side from Adobe's v4 SDK. For server-side Firefly/Express APIs, keep the Adobe client secret on the server and use OAuth 2.0.

Adobe Express Embed SDK: https://developer.adobe.com/express/embed-sdk/docs/v4/
Adobe credentials: https://developer.adobe.com/express/embed-sdk/docs/guides/quickstart/
Adobe Express API auth: https://developer.adobe.com/firefly-services/docs/express-api/getting-started/

## Security model

Do not put client secrets in the browser or source control. OAuth token exchange belongs on the backend. User access and refresh tokens should ultimately be encrypted at rest and stored separately from the UI session. Use the smallest provider scopes possible.

## Production workflow

1. AI Menu Studio creates a provider-neutral editable menu model.
2. Reference images are analyzed by the AI art director.
3. QuickServe generates multiple creative directions.
4. Figma uses the importer/plugin path for arbitrary editable layouts and REST for reading/syncing existing files.
5. Canva uses Brand Templates + Autofill for production-ready Canva designs.
6. Adobe Express provides the embedded professional editing surface and Adobe APIs for image workflows.
7. QuickServe remains the source of truth for restaurant content; external tools are creative destinations, not the database.
