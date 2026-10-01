# Ahoier

Independent German-language travel companion for AIDA guests, derived from selected Locker9 assets and itinerary data.

- Keep Locker9 and its user data, credentials, database and deployment separate.
- Do not copy .env files, service-role keys, crew profiles, contracts, payroll or message data.
- Read the relevant installed Next.js documentation before changing framework-specific code.
- Imported itineraries are a dated snapshot, not a live or official feed. Never invent arrival, departure, all-aboard, weather or event data.
- Departure and all-aboard are different concepts. Only display all-aboard when an authoritative source exists.
- Preserve ship-photo attribution. Do not present Ahoier as an official AIDA product.
- Before delivery run npm run lint, npm run typecheck, npm test and npm run build as appropriate.
- No agent delegation unless the user explicitly requests it.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
