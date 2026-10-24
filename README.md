# Baptism In Your Pocket

**We help pastors register their church and report baptisms with Baptize The World by texting on WhatsApp.**

A pastor texts a WhatsApp number to register their church and to report baptisms. Every registration and count shows up on a live dashboard within seconds, and an admin approves new churches there with one click.

Built for the FaithTech SoCal × Baptize The World hackathon, Track 1 (mobile-first church onboarding).

## How it works

```
WhatsApp ──► Meta Cloud API ──► POST /api/whatsapp ──► handleInbound()
                                                         │  extract() with Claude Haiku
                                                         │  routing rules decide what to save
                                                         ├─► Supabase (contacts, churches, reports, message log)
                                                         └─► sendText() reply in the pastor's language

/dashboard ◄── Supabase Realtime (churches, baptism_reports) ── Approve ──► approved message on WhatsApp
```

- **Registration in one message.** The first reply lists every field we need; later replies ask only for what's still missing. Corrections overwrite earlier answers.
- **Consent and opt-out.** Consent (YES) is a required field. `STOP` / `PARAR` / `PARE` / `ARRET` / `ARRÊT` opt a contact out; `START` / `INICIAR` / `COMEÇAR` / `COMMENCER` opt back in.
- **Baptism reports.** Registered contacts text a count ("14 bautismos", "nove"); we ask for the date if they didn't give one. Unregistered numbers are told to register, and nothing is saved.
- **Languages.** Replies come from human-written templates in English, Spanish, Portuguese and French (`src/lib/templates/`). Any other language gets the English template translated live by AI and logged with `translated_by_ai = true`.
- **AI only extracts.** Claude returns structured JSON (language, intent, fields, count, date). The routing code in `src/lib/flow.ts` decides what to save and send.

### Code map

| Path | What it does |
| --- | --- |
| `src/app/api/whatsapp/route.ts` | GET: Meta's verification handshake. POST: acknowledges at once, then processes messages with `after()`. |
| `src/lib/flow.ts` | `handleInbound()`: the routing rules. |
| `src/lib/ai.ts` | `extract()` and `translate()` (Claude Haiku 5.5, structured outputs). |
| `src/lib/i18n.ts`, `src/lib/templates/*.json` | `render(key, language, vars)`. |
| `src/lib/whatsapp.ts` | Webhook parsing, `sendText()` (logs every outbound message), `sendTemplate()`. |
| `src/lib/baptize.ts` | **Mock Baptize adapter** (see below). |
| `src/app/dashboard/` | Live dashboard and the `approve()` server action. |
| `supabase/migrations/0001_init.sql` | Database schema. |

## What's mocked

`src/lib/baptize.ts` stands in for Baptize The World's own systems. `registerChurch()`, `saveBaptismReport()` and `approveChurch()` write to our own Supabase tables today. This file is the one place a real Baptize API would plug in later; nothing else in the app needs to change.

## Running it

### 1. Supabase

Create a project and run `supabase/migrations/0001_init.sql` in the SQL editor. This creates the tables, enables Realtime on `churches` and `baptism_reports`, and sets row level security: only `churches` and `baptism_reports` are publicly readable (Realtime needs that); contacts and the message log are server-only.

### 2. Environment

```bash
cp .env.example .env.local
```

| Variable | Notes |
| --- | --- |
| `WHATSAPP_TOKEN` | Temporary access token from WhatsApp → API Setup (expires after about a day). |
| `WHATSAPP_PHONE_NUMBER_ID` | From WhatsApp → API Setup. |
| `WHATSAPP_VERIFY_TOKEN` | Any string; must match the webhook config in Meta. |
| `WHATSAPP_GRAPH_VERSION` | e.g. `v23.0`, as shown on the API Setup page. |
| `ANTHROPIC_API_KEY` | Server-side only. |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Server only. The service role key bypasses RLS. |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser; used only for Realtime. |
| `RESOURCES_LINK` | Link sent in the approval message. |
| `APP_TIME_ZONE` | Optional IANA zone that "today" resolves to. Defaults to UTC. |

Set the same variables in Vercel. Never commit real values; the repo is public.

### 3. Run

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # unit tests (routing rules, templates, webhook parsing)
npm run lint
npm run typecheck
```

For local webhook testing, expose the dev server with `ngrok http 3000`.

### 4. Meta webhook

1. Deploy to Vercel (or start ngrok) so the webhook has a public HTTPS URL.
2. WhatsApp → API Setup: add every demo phone as a recipient. The test number only messages numbers on that list.
3. WhatsApp → Configuration → Webhook: callback URL `https://<app>.vercel.app/api/whatsapp`, verify token = `WHATSAPP_VERIFY_TOKEN`, then **Verify and save**.
4. Subscribe to the `messages` webhook field.

Free-form replies only reach a contact within 24 hours of their last message. Approve churches during the same session they register; after that, the approval message needs a Meta-approved template.

## Dashboard

`/dashboard` shows total baptisms and churches, every church with an **Approve** button while it's pending, and the most recent reports. It updates live through Supabase Realtime.

**There is no login.** The V1 demo shows test data only. Add authentication to the dashboard and the `approve()` action before using real data.

## Out of scope for V1

- Count validation of any kind (range, duplicates, implausible counts). Counts are saved as reported.
- Confirm-back (reading details back before submitting) and a pending/confirmed status on counts.
- Webhook signature verification and rate limiting.
- SMS and other channels.
- Multiple admins per church and inviting others.
- Facebook or website enrichment.
- Confirming the detected language; dialect handling.

## Test data

Use team phones and the test church names from `churches.csv` only. No real names, phone numbers or emails belong in this repo.

## Credits

[Meta WhatsApp Cloud API](https://developers.facebook.com/docs/whatsapp/cloud-api), [Supabase](https://supabase.com), [Anthropic Claude](https://www.anthropic.com/claude), [Next.js](https://nextjs.org), [Vercel](https://vercel.com).

## License

[MIT](LICENSE)
