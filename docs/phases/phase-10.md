# Phase 10 — SEO, offline support, articles, legal pages, performance

## Delivered

Every concrete public route receives crawlable semantic fallback content, a descriptive title, metadata, canonical URL, structured data, and social assets at build time. The frontend then replaces the fallback with the interactive React workspace. Sitemap and robots files are generated from real route/data identifiers. Private project, account, authentication, assistant, and share routes are excluded from search indexing.

The final Workbox service worker is generated after static content so precache revisions match the actual release. Public application assets, fonts, calculators, and reference content can be cached for offline use. Private navigation paths and API responses are excluded from the runtime cache. The UI reports offline readiness and available updates.

Five original technical articles contain complete worked explanations and primary standards references. Privacy, terms, cookie controls, about, and contact pages describe the implemented behavior and operator responsibilities. The contact form reports persistence failure when the backing service is unavailable instead of pretending to submit.

Optional analytics remain disabled unless configured and accepted. Events use bounded public page paths, exclude query strings and sensitive/private routes, and require a manual pageview integration. The user can change consent through the cookie controls.

Routes are lazy loaded, heavy PDF/password functionality is deferred, fonts are bundled, and motion honors reduced-motion preferences. Lighthouse and browser performance measurements, where executed, are recorded in `../verification.md`; a target is not represented as an achieved score without a measurement.
