# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
Primary users are the owner (VB2007) and the people they share the site with: friends, acquaintances, and anyone using the tools openly. The site is the owner's own tools hub, built for their own needs and shared publicly. Visitors arrive to get a small job done (shorten a link, paste text or share a file) or to find out what the owner hosts and how to use it.

## Product Purpose
vb2007.hu is a free multi-tool site and the owner's personal website. It has two roles:

1. **Own tools:** general-purpose utilities behind a single account system. URL shortening, a pastebin and file upload and sharing exist today. Other general features are planned.
2. **Directory of hosted services:** a collector for services the owner self-hosts, such as Vaultwarden, a Matrix instance, Kiwix archives, and a public API, plus past full-stack and other projects. These get separate pages on the site. Those pages are display and status information only: what the service offers, how to set it up, how to connect. The services themselves run elsewhere.

Success is a visitor completing a tool task quickly, or understanding what a hosted service offers and how to start using it.

## Positioning
One personal, self-hosted home that holds both working tools and the owner's infrastructure: a single person's stack, openly shared, rather than a commercial SaaS. Its difference is that everything is run by one developer, with the hosted-service pages documenting real services the owner operates.

## Operating Context
- Vue 3 + Vite + TypeScript SPA (vue-router), consuming a separate backend API (`VITE_API_BASE_URL`, default `https://api.vb2007.hu`).
- Accounts exist: register and log in, with a password or with GitHub (the API's OAuth2; the first GitHub login creates the account). Authentication is a `VB-AUTH` cookie. The URL shortener, creating pastes and uploading files require a logged-in user (the shortener says this "will change in the future"); reading a paste by its link is public.
- Current routes: Home, Shorten, Pastebin (`/pastebin`, plus `/pastebin/:id` for a single paste), Upload (`/upload`), Admin (`/admin`, only for the site's superuser: every account's upload usage and quota, plus `/admin/users/:id/uploads` to browse and moderate one account's uploads), short link redirects (`/r/:code`, plus `/r/:code/preview` to see where a link leads and who shared it before opening it), Login, Register, Account (`/account`: the logged-in user's username, e-mail and whether GitHub is linked and as which GitHub login, with a way to link or unlink it; an account with a password can change its password, and its e-mail address by confirming that password (the superuser's is set on the API); an account made with GitHub has no password and can't unlink it until it sets one there, after GitHub confirms it's them; and a way to delete the account, confirmed with the password or, without one, the username). Light and dark themes exist.
- Navigation follows the route map in `src/constants/stops.ts`; Contact is shown as a planned stop.

## Capabilities and Constraints
- Shipped: URL shortening (logged-in only; links live on the site as `vb2007.hu/r/:code`), pastebin (create, list, view, delete; creating and listing are logged-in only; pastes are syntax-highlighted in the language detected on paste or picked by the user, Markdown renders, and the owner can change a paste's language later), file uploads (upload, list, search, rename, switch public/private, delete, storage meter; logged-in only; files live at `cdn.vb2007.hu/useruploads/<userId>/<uploadId>.<ext>`, public ones open for anyone with the link, private ones only for the logged-in owner; 10 GB per user for now), register, login, logout, GitHub login and linking or unlinking GitHub on an existing account, setting or changing the account's password, changing its e-mail address, deleting an account with its pastes, short links and uploads, theme switch. The site's one superuser (set on the API) can see each account's upload usage and set or reset its quota on `/admin`, and open, rename, make private or delete any account's uploads from there; nobody else sees that page or its link.
- Planned tools: contact, other general features. Contact is not built.
- Planned hosted-service pages (status and info only, one page per service): Vaultwarden, Matrix, Kiwix archives, public API, and past projects. None exist yet. Which services and what status data (live checks versus static text) are undecided.
- Languages: English now, Hungarian planned alongside it. The UI needs to accommodate localization.
- The Home page is currently a placeholder ("Welcome home / Meet a feature-rich site with tools for your various needs!").

## Brand Commitments
- Name: `vb2007.hu` (wordmark in the navbar). Owner handle: VB2007.
- Existing identity is minimal: a favicon and a text wordmark. No logo system is established. `src/assets/logo.svg` is the default Vue template logo, not a brand asset.

## Evidence on Hand
- Working URL shortener and pastebin flows against a real API.
- No testimonials, usage numbers, customer lists, or press. Do not fabricate any.
- No documentation content for the hosted services yet. Service descriptions and setup guides must come from the owner.

## Product Principles
1. **Tools first, immediately usable.** A visitor should reach a working tool in one step and finish its job without friction.
2. **One person's real stack.** Everything shown reflects services and tools the owner actually runs. Never imply scale, a team, or capabilities that do not exist.
3. **Tools and service pages are different kinds of surface.** Tools are interactive. Hosted-service pages inform and point elsewhere. Keep that distinction clear.
4. **Grow without redesign.** New tools and service pages should slot into the same structure as the site expands.
5. **Bilingual from the structure up.** English and Hungarian should both be first-class, not retrofitted.

## Accessibility & Inclusion
Responsive web with working light and dark modes. No formal accessibility standard has been committed. Hungarian and English readers are both audiences.
