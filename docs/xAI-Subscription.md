# xAI subscription (use Grok without an API key)

Besides the pay-per-token **xAI API** (an API key, billed per token), you can
connect a provider to your **SuperGrok / X Premium subscription** and route
inference through it — no API key, no per-token bill.

This uses the OAuth 2.0 **Device Authorization Grant** against `auth.x.ai`, the
same mechanism xAI's official **Grok CLI** uses. The resulting access token is a
bearer for the normal `https://api.x.ai/v1` OpenAI-compatible API, so everything
downstream (routing, overflow, the OpenAI/Anthropic surfaces) works unchanged.

> ⚠️ **Honest caveats.** There is no official "use my subscription via API"
> product. This reuses xAI's public Grok-CLI OAuth client; it is **unofficial for
> third-party apps, may be subject to xAI's Terms of Service, and can break
> without notice** if xAI changes the client, scopes, or endpoints. It is your
> own paid account and a self-hosted tool — but go in with eyes open. Prefer the
> API key if you need stability or ToS certainty.

## Connect

1. **Providers → Add provider**, type **xAI**.
2. Set **Authentication** to **Subscription (Grok login)** and create it (no API
   key needed).
3. On the new provider's card, click **Connect subscription**. A short **code**
   and a **link** appear.
4. Open the link, sign in to your X / xAI account, and enter the code to
   authorize. The dashboard polls automatically and flips to **Connected**
   (showing your account + token expiry) once approved.

The access token is stored **encrypted** (in the provider's credentials blob)
and **auto-refreshed** ~5 minutes before it expires using the refresh token, so
you stay connected until you click **Disconnect**.

## Route models to it

Add a **Model Route** mapping a public model name to the xAI subscription
provider + a Grok model, e.g. `grok-code` → `grok-4` on the xAI provider. Then
clients calling that model are served through your subscription. The model
catalog is the standard xAI one (`https://api.x.ai/v1/models`).

## Cost & budgets

A subscription is a flat monthly fee, not per-token. The per-token **cost
tracking** does not know your plan price, so if you want spend to read `$0` for
subscription traffic, set the xAI **model prices** to `0` (Providers → Model
pricing). The monthly **budget** guard still applies to whatever cost is
recorded.

## Configuration (advanced)

All overridable via environment, with sensible defaults baked in:

| Variable              | Default                                                          | Purpose                                                     |
| --------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------- |
| `XAI_OAUTH_ISSUER`    | `https://auth.x.ai`                                              | OIDC issuer (discovery)                                     |
| `XAI_OAUTH_CLIENT_ID` | xAI Grok-CLI public client                                       | OAuth client id                                             |
| `XAI_OAUTH_SCOPE`     | `openid profile email offline_access grok-cli:access api:access` | requested scopes (`offline_access` is required for refresh) |

## Troubleshooting

- **"No pending login"** when polling → the code expired or the server
  restarted mid-flow; click **Connect** again.
- **Stops working after a while** → xAI may have rotated the client/endpoints
  (see caveats). Disconnect and reconnect, or fall back to an API key.
- **Privacy mode** blocks any cloud provider — including this one.
