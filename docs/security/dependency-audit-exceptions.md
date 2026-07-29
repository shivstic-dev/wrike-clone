# Dependency audit exceptions

## GHSA-qwww-vcr4-c8h2 — React Router RSC action processing

- **Affected package/version:** `react-router` and `react-router-dom` `7.18.2`.
- **Decision:** accepted as non-applicable to the current production application.
- **Why:** the frontend is a Vite browser SPA using `BrowserRouter`; it does not
  build or run React Server Components, React Router RSC mode, server actions,
  or an application server that processes RSC action requests.
- **Compensating controls:** the Vercel project serves static frontend assets
  only; API mutations are handled by the separately deployed Railway API with
  authentication, authorization, and request validation.
- **Review trigger:** remove this exception when a fixed release at or above
  `8.3.0` is available, or immediately if this application adopts RSC or server
  actions.
