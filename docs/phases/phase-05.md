# Phase 5 — Frontend foundation, accounts, and workspace

## Delivered

The React 18 application includes a responsive navigation shell, nested tool/learning/project routes, a keyboard command palette, accessible Radix dialogs, shared form and table components, reduced-motion support, light/dark/system themes, and a persistent preference store. Navigation has English, Amharic, Arabic, French, and Spanish dictionaries; Arabic changes the document direction to RTL. Technical content remains a complete English fallback.

Authentication connects directly to Supabase for password sign-in, account registration, magic links, password reset, and Google/GitHub OAuth. Return paths are limited to local application paths. Unconfigured account features render an explicit setup state. Private query caches are cleared when account identity changes, and the application subtree remounts so another identity cannot inherit in-memory project or conversation state.

The account page supports display names, private avatar upload, favorite and saved calculation management, private account-export storage, temporary export links, account data download, and deliberate account deletion. Service keys are absent from browser configuration.

The common result panel presents exact engine output, explanatory steps, notes, sources, and tables; it supports text copying, URL sharing, CSV, JSON, PDF, printing, and project/assistant handoffs. Non-mathematical toolkit results are labeled as results/reference material, not exact calculations. Spreadsheet export prefixes formula-triggering text to avoid executable cells.

## Review and verification

The calculator and toolkit suites exercise the shared components through actual interactions. Whole-app browser, accessibility, mobile, theme, export, and authentication-state checks are recorded in `../verification.md`. Live OAuth/email/Storage behavior requires a configured Supabase deployment and remains a separately identified launch gate.
