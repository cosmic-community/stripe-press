# Stripe Press: Ideas for Progress
![App Preview](https://imgix.cosmicjs.com/5e95ca30-e380-11f1-8bde-eb83efbf437d-social-card.jpg?w=1200&h=630&fit=crop&auto=format,compress)

A bookish, minimal publishing-house website powered by [Cosmic](https://www.cosmicjs.com). It uses your existing `book` and `page` content types to build a featured-release shelf, a library index, a books shelf, long-form book pages and generic pages.

## Features

- 📚 Featured-release carousel with 3D-style covers, a "1 of N" counter, and arrow-key and click navigation
- 🗂️ Alphabetical library index with hover cover previews
- 📖 Long-form reading typography with drop cap, markdown rendering and comfortable measure
- 🧱 Shelf-style books grid
- 🌐 "Websites" list of `page` objects styled as path-like links (`/boom`)
- 🌙 Paper / "library at night" theme toggle
- ⌨️ Keyboard shortcuts: `Esc` home, `←` `→` browse, `B` books, `M` multimedia
- ♿ Accessible, responsive, reduced-motion friendly
- 🔒 Server-side Cosmic reads with draft-preview support
- 🛒 Customer accounts, a cart, and Stripe Checkout (test mode) with order tracking
- 🤖 AI agent access via the [Concierge Agent Protocol (CAP)](https://conciergeprotocol.org/spec): agents ask in a message, and a signed-in customer can have the concierge change their cart or start a checkout they still pay for themselves

## Clone this Project

Want to create your own version of this project with all the content and structure? Clone this Cosmic bucket and code repository to get started instantly:

[![Clone this Project](https://img.shields.io/badge/Clone%20this%20Project-29abe2?style=for-the-badge&logo=cosmic&logoColor=white)](https://app.cosmicjs.com/projects/new?clone_bucket=6afdf26a48f83858e228fb12&clone_repository=6afdf75bec710b333fc5e0da)

## Prompts

This application was built using the following prompts to generate the content structure and code:

### Content Model Prompt

> No content model prompt provided - app built from existing content structure

### Code Generation Prompt

> Build a Next.js application for a creative portfolio called "Stripe Press". The content is managed in Cosmic CMS with the following object types: book, page. Create a beautiful, modern, responsive design with a homepage and pages for each content type.
>
> User instructions: A literary publishing house website inspired by stripe.press ("Ideas for progress"). Use the EXISTING Cosmic content types: "book" (title, seo_description, featured_image, source_url, content rich-text) and "page" (title, seo_description, featured_image, source_url, content rich-text). Do not create new content types.
>
> VIBE / DESIGN: Elegant, bookish, minimal, and tactile — like a premium print publisher crossed with a terminal/library catalog. Warm off-white paper background (#f5f2ea-ish) with near-black ink text; optionally a dark "library at night" mode. Serif display typography for titles (e.g. a classic book serif like EB Garamond / Cormorant / Newsreader) paired with a monospace UI font (e.g. IBM Plex Mono / JetBrains Mono) for navigation, labels, metadata and small caps. UI labels in bracket style like "[ NEW & FEATURED RELEASES ]", "[ Cart 0 ]", "[Esc] to home", "[ B ]ooks", "[ M ]ultimedia", "Open book [+]", "View details [+]". Generous whitespace, thin hairline rules, subtle grain/paper texture, slow refined hover/transition animations. Header: "STRIPE PRESS" wordmark in monospace caps, tagline "Ideas for progress".
>
> PAGES:
> 1. Home (/): Hero featured-release carousel/shelf showcasing books as large 3D-ish book covers (featured_image) with title, author line derived from seo_description, and counter "1 of N" style indicator; arrow-key and click navigation. Below: a "Library" index — an alphabetical list of all books in a clean typographic list (monospace index numbers, serif titles), with hover revealing a cover preview. A "Sections" nav with [ B ]ooks and [ M ]ultimedia. A "Websites" list linking to pages (e.g. /boom, /scaling, /tacit) styled as path-like links "/boom".
> 2. Book detail (/book/[slug]): Large cover image, title in big serif, seo_description as subtitle/blurb, rich-text content rendered as beautiful long-form reading typography (drop cap, comfortable measure), and a link to the original source_url ("View at original [+]"). Prev/next book navigation.
> 3. Books index (/books): grid of book covers on a shelf-like layout.
> 4. Generic page (/[slug]) for "page" objects (FAQ, Tacit, Scaling, Boom, etc.) rendering content in the same refined long-form style.
> 5. Footer with small monospace links (FAQ, Terms, Privacy), and "Ideas for progress".
>
> Keyboard shortcuts (Esc to return home, arrow keys to browse featured books) are a nice touch. Fully responsive, accessible, fast. Render rich-text content as markdown.

The app has been tailored to work with your existing Cosmic content structure and includes all the features requested above.

## Technologies

- [Next.js 16](https://nextjs.org) (App Router, Server Components)
- [React 19](https://react.dev)
- [TypeScript](https://www.typescriptlang.org) (strict)
- [Tailwind CSS](https://tailwindcss.com)
- [Cosmic](https://www.cosmicjs.com/docs) via `@cosmicjs/sdk`
- [marked](https://marked.js.org) for markdown rendering
- EB Garamond and IBM Plex Mono (Google Fonts)

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) 1.1 or later
- A Cosmic bucket with `book` and `page` object types

### Installation

```bash
bun install
bun run dev
```

Set these environment variables (they are provided automatically on Cosmic deployments):

```
COSMIC_BUCKET_SLUG=your-bucket-slug
COSMIC_READ_KEY=your-read-key
COSMIC_WRITE_KEY=your-write-key
```

## Cosmic SDK Examples

```typescript
// Fetch all books (server-side only)
const { objects } = await cosmic.objects
  .find({ type: 'book' })
  .props(['id', 'slug', 'title', 'metadata'])
  .depth(1)

// Fetch a single page by slug
const { object } = await cosmic.objects
  .findOne({ type: 'page', slug: 'faq' })
  .props(['id', 'slug', 'title', 'metadata'])
  .depth(1)
```

## Cosmic CMS Integration

- `book`: `title`, `seo_description`, `featured_image`, `source_url`, `content`
- `page`: `title`, `seo_description`, `featured_image`, `source_url`, `content`
- `book.price` (number, USD): the hardcover price. Books without a price show as unavailable and can't be added to the cart.

The store and CAP features also write to these types. All records are saved as **drafts**, so they never appear in published queries:

- `customers`: `email`, `passcode_hash` (slug `customer-{username}`)
- `carts`: `customer`, `items` (slug `cart-{username}`)
- `orders`: `customer`, `items`, `total_cents`, `order_status` (`pending` / `paid` / `expired` / `failed`), `source` (`web` / `agent`), `stripe_session_id`
- `cap-records`: `record_key`, `value`. An expiring key-value store for OAuth device codes and refresh tokens.

All reads happen in Server Components through `lib/cosmic.ts`, so your keys never reach the browser. Draft content is visible only inside the Cosmic dashboard preview. Learn more in the [Cosmic docs](https://www.cosmicjs.com/docs).

## Store: Accounts, Cart & Checkout

- **Sign in** at `/login`. A demo account always works: username `demo`, password `demo`. New customers can sign up with a username (3-32 characters), an optional email, and a password of at least 6 characters.
- **Cart** at `/cart`. Add books from any book page. Quantities are capped at 10 per title.
- **Checkout** creates a pending order and a Stripe Checkout Session in USD. Shipping is limited to US, CA, GB, AU, IE and NZ. Until `STRIPE_SECRET_KEY` is set, checkout reports "payments not configured".
- **Orders** at `/orders/{order}`. The Stripe webhook (`/api/stripe/webhook`) marks orders `paid`, `expired` or `failed` and clears the cart once payment succeeds.

In Stripe, point a webhook at `https://your-site/api/stripe/webhook` and subscribe it to these events:

- `checkout.session.completed`
- `checkout.session.expired`
- `checkout.session.async_payment_succeeded`
- `checkout.session.async_payment_failed`

## AI Agent Access (CAP)

The site exposes a [Concierge Agent Protocol](https://conciergeprotocol.org/spec) door. Agents find it through `/agent.txt` and ask with one message. They do not call cart or checkout routes.

| Endpoint | Purpose |
| --- | --- |
| `/agent.txt` | Discovery file with the CAP and OAuth URLs |
| `/cap/v1/messages` | Ask the concierge. Public questions are proxied to the hosted Cosmic CAP door (`CAP_UPSTREAM_URL`). Cart and checkout questions are answered here when the customer has signed in. |
| `/cap/v1/confirmations/{id}` | The status of a purchase waiting for the customer |
| `/confirm/{id}` | The page where the customer approves and pays |
| `/oauth` | OAuth 2.0 authorization server (device code flow) |
| `/.well-known/oauth-authorization-server/oauth` | Authorization server metadata |
| `/.well-known/oauth-protected-resource/cap/v1` | Protected resource metadata |

### How an agent signs a customer in

The site uses the OAuth 2.0 device authorization grant with public clients, so agents don't register and don't use a client secret. `client_id` is the agent's `CAP-From`, such as `agent:example-assistant`. The token only works for that agent.

1. The agent calls `POST /oauth/device` with `client_id` and an optional `scope` of `read` or `write`. `write` includes read.
2. The customer opens `verification_uri_complete` (`/login/device?code=XXXX-XXXX`), signs in and approves.
3. The agent polls `POST /oauth/token` with `grant_type=urn:ietf:params:oauth:grant-type:device_code`, `device_code`, and the same `client_id`, every `interval` seconds (5).
4. The agent sends the question to `POST /cap/v1/messages` with `Authorization: Bearer {access_token}` and the same `CAP-From`.

A read login can see the cart and an order. A write login can add or remove books. Checkout returns a confirmation. The customer opens it, pays on Stripe, and the agent reads the confirmation until it is done. The agent never sees a card and never pays.

Access tokens last 1 hour. Refresh tokens last 30 days and **rotate on every use** (`grant_type=refresh_token`). Revoke at `POST /oauth/revoke`. Device codes expire after 10 minutes. A purchase confirmation expires after 10 minutes if nobody decides.

## Environment Variables

See `.env.example` for the full list.

| Variable | Required | Purpose |
| --- | --- | --- |
| `COSMIC_BUCKET_SLUG`, `COSMIC_READ_KEY` | Yes | Content reads |
| `COSMIC_WRITE_KEY` | For store/CAP | Customers, carts, orders, OAuth records |
| `AUTH_SECRET` | Recommended | Signs session cookies and agent access tokens. Falls back to `COSMIC_WRITE_KEY` if unset. |
| `SITE_URL` | Optional | Forces the public origin used in OAuth metadata and Stripe redirects |
| `CAP_UPSTREAM_URL` | Optional | Hosted Cosmic CAP door that answers questions. Defaults to this project's door. |
| `STRIPE_SECRET_KEY` | For checkout | Stripe secret key (use a test-mode key for the demo) |
| `STRIPE_WEBHOOK_SECRET` | For checkout | Verifies Stripe webhook signatures |

## Deployment Options

- **Vercel:** import the repo and set `COSMIC_BUCKET_SLUG`, `COSMIC_READ_KEY` and `COSMIC_WRITE_KEY` in the project settings. Add `AUTH_SECRET`, `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` to enable the store.
- **Netlify:** use the Next.js runtime and set the same environment variables.
- Run `bun run type-check` before deploying to catch type errors early.
<!-- README_END -->