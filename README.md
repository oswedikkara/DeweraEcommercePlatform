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

Store: http://localhost:3000. Management: http://localhost:3001. Both use the same API services and SQLite database. Customer enquiries are saved in the private management inbox and sent to the business email through the connected Dewera Gmail account. Customers stay on the website. The sender is Dewera; Reply-To is the customer’s email, so the team can reply directly. WhatsApp remains a preferred reply method for the team, not an automatic customer-account sender.

## Email sign-in setup (required)

Copy `.env.example` to `.env`. Set `DEWERA_GMAIL_USER` to your existing Dewera Gmail address and `DEWERA_GMAIL_APP_PASSWORD` to a Google App Password for that account. Enable Google 2-Step Verification first, then create the App Password yourself at https://myaccount.google.com/apppasswords. Some account policies do not allow App Passwords. Enter the credential only in the private server environment, never in chat or Git. Restart both servers.

This uses Gmail SMTP via Nodemailer; there is no paid email-service subscription or per-message billing integration. Gmail’s sending limits and account policies apply; a third-party service’s perpetual availability cannot be guaranteed. The deployment must permit outbound SMTP. Setup guidance: https://nodemailer.com/guides/using-gmail and limits: https://support.google.com/mail/answer/22839.

The same connection sends admin verification codes and enquiry notifications. Until configured, admin code requests return HTTP 503. Enquiries still save in the management inbox, with pending email notifications retained in SQLite. The store retries up to five queued notifications each minute, with three delivery attempts and a five-minute delay after failures. SMTP acceptance is not a guarantee of inbox delivery; check Gmail’s Sent folder and delivery failures. A process interruption during SMTP delivery can cause a duplicate notification on retry; its stable enquiry reference identifies the same request.

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

Tests use isolated in-memory databases and mocked delivery. They cover direct-store restrictions, enquiry persistence, inventory error handling, inbox rendering, content validation, owner protection, code expiry/reuse/attempt limits, session revocation, WhatsApp destinations, static-file privacy, maintenance blocking and preview scope. Tests do not send real email or WhatsApp messages. Live email delivery requires connecting the existing Gmail account separately.

## Responsive layout

`store/layout.css` owns shared gutters, grid transitions and collection filter alignment after the presentation styles. Story and editorial sections stack below 800px; the contact form stacks below 1000px. A single collection item uses a full-width editorial layout and stacks on phones. Browser QA covers 320–1920 CSS pixels, including the narrow 440px viewport reported with docked DevTools.
