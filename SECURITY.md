# Security policy

## Supported version

Security fixes are applied to the latest release from `main`. Older snapshots
and forks are not maintained by this repository.

## Reporting a vulnerability

Use GitHub's private vulnerability reporting flow in the repository's
**Security** tab. Do not include vulnerability details, credentials, tokens, or
customer data in a public issue.

Include the affected route or component, reproduction steps, impact, and any
suggested mitigation. Maintainers should acknowledge a report within three
business days and coordinate disclosure only after a fix is available.

## Deployment responsibilities

- Keep all secrets in the hosting provider's encrypted environment settings.
- Never expose the Supabase service-role key to the browser.
- Back up and test restoration before applying database changes.
- Keep public registration disabled unless abuse controls and email
  verification are configured.
- Rotate credentials immediately if they appear in source control, logs, or
  support material.

## Known upstream advisory

`npm audit --omit=dev` currently reports GHSA-qwww-vcr4-c8h2 in React Router's
React Server Components action handling. This application uses
`BrowserRouter` as a client-only Vite SPA and does not enable React Server
Components, server actions, or React Router framework mode, so the affected
execution path is not present in this deployment. Keep React Router current
and remove this exception as soon as an upstream fixed release is available.
