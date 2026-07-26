# PeakLogic Customer Portal

A tenant's (customer's) view of the PeakLogic platform — their OWN sites only.
Sibling app to `channel-partner-portal/` and `peakview360/`; same React + Vite +
Tailwind stack. Port **5176**.

```bash
cd customer-portal
npm install
npm run dev        # http://localhost:5176
npm run build
```

## Who this is for (vs. the other surfaces)

- **Customer Portal (this app)** — an **end customer** (e.g., Bayfront Municipal
  District) sees only *their* sites, devices, alerts, and compliance reports, and
  who services them. **Not** the partner portal.
- **Channel Partner Portal** (`channel-partner-portal/`, :5174) — the *service
  company* (Ace, WTR DR) sees all of *their* customers.
- **PeakView360** (`peakview360/`, :5175) — the live operator view, **launched
  from within** this portal (a site's "Open live view"), not a separate login.
- **Control Center** — PeakLogic staff (the Platform Control Center / revised
  Super Admin Console).

## Status — preview

PeakLogic-branded (the customer is a PeakLogic tenant). Light/dark + saved
settings, interactive alerts (acknowledge), and compliance reports. All **preview
data** — swap for real `GET /v1/sites|devices|alerts|reports` under `withTenant`
once a backend exists. Links back to the platform hub (`marketing/demo.html`).
