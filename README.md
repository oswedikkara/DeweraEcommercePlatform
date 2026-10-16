# Dewera - Private Ceylon Gem House

A direct, enquiry-only gemstone store. There are no third-party sellers, checkout, wallets or online payments.

## Local setup

Use Node.js 24 or newer (`node:sqlite` is required):

```sh
npm install
npm start
# In a separate terminal:
npm run start:admin
```

Store: http://localhost:3000. Management: http://localhost:3001. Both use the same API services and SQLite database. Customer enquiries are saved before the browser opens WhatsApp with a prepared message. The customer must tap Send in WhatsApp; the application does not send messages automatically.

## Email sign-in setup (required)

Copy `.env.example` to `.env`. Set `RESEND_API_KEY` from your own Resend account and `DEWERA_EMAIL_FROM` to a sender on a domain verified in that account. Restart both servers. A Gmail inbox can receive codes but cannot be used as an arbitrary verified Resend sending domain. There is no fallback password, console code or authentication bypass. Until the service is configured, requesting a code returns a clear HTTP 503 and admin sign-in is unavailable.

Only approved emails can receive sign-in codes. Codes expire after ten minutes, are stored as hashes, allow at most five attempts, and can be used once. Requests and verification are rate-limited. Sessions expire after eight hours and are stored as token hashes.

Permanent protected owners:

- os.wedikkara@gmail.com
- pramodyadewmini.d@gmail.com

Both owners always have full access. No administrator can remove or demote them. Only these owners can add or remove other approved email addresses. The initial site email, deweragems@gmail.com, is approved once and may be removed by either owner. Removing access revokes active sessions and preview tokens. Changing the public contact email does not grant admin access.

## Management

- Overview and searchable client enquiry inbox, including general and gemstone-specific requests.
- Inventory creation, descriptions, specifications, images, prices, discounts and availability.
- Site content editor for customer-facing copy, navigation, buttons, links, image paths, alt text, page titles and descriptions. Empty and decorative fields are excluded. Plain text and validated URLs only; no executable HTML. Saves use revision checks to prevent overwriting a newer editor's changes.
- Contact settings for business email and international WhatsApp number.
- Maintenance switch and message. Public HTML and inventory/enquiry endpoints are blocked while management remains accessible. Editor previews use a separate ten-minute, read-only token; staff session tokens never enter the storefront iframe.

Product-specific information belongs in inventory. Page layout, application logic and security rules are maintained in source code; they are not editable through content fields.

## Architecture and data

`store/` contains public page shells and shared rendering, styles and accessible controls. `admin/` contains management screens. `backend/http/server.js` is the shared HTTP/static entry point; `backend/api/` handles routing and validation; `backend/services/` handles business logic and `backend/database/` persists data.

The supported deployment is the Node server, not static GitHub Pages. Use a persistent private data volume, HTTPS and a reverse proxy for production. Default local port links and allowed browser origins must match the deployment. Do not expose port 3001 as an unencrypted public service.

`data/dewera.db` is the authoritative local database. Existing data is retained locally; private runtime databases, staff records, seller records, settings and `.env` are excluded from Git. Back up the data directory before deploying. `data/gems.json` is the public inventory bootstrap for a fresh checkout; reviewed listing changes belong in the inventory editor. Legacy schema and service modules remain for historical data compatibility, but seller, payment and password routes are retired.

The editorial sapphire still-life is an illustrative brand asset; listing photography remains attached to the actual gemstone record.

## Verification

```sh
npm test
```

Tests use isolated in-memory databases and mocked delivery. They cover direct-store restrictions, enquiry persistence, inventory error handling, inbox rendering, content validation, owner protection, code expiry/reuse/attempt limits, session revocation, WhatsApp destinations, static-file privacy, maintenance blocking and preview scope. Tests do not send real email or WhatsApp messages. Live email delivery requires configuring and verifying your sending account separately.
