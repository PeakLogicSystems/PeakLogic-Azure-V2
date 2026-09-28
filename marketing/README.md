# PeakLogic marketing site

A lightweight, static marketing site for PeakLogic Solutions. It uses plain HTML and CSS, reuses the existing PeakLogic favicon and sensor artwork, and credits its Unsplash hero photo in the page.

## Preview locally

Serve this directory with any static file server. For example, from the repository root:

```sh
python -m http.server 8000 --directory marketing
```

Then open http://localhost:8000.

## Cloudflare Pages

Create or update a Cloudflare Pages project connected to this repository:

- Production branch: `main`
- Build command: leave blank
- Build output directory: `marketing`
- Root directory: repository root

The site has no build step. Pages will serve `marketing/index.html` at the domain root and `marketing/pricing/index.html` at `/pricing/`. Add the custom domain in the Pages project after the first successful deployment. The contact links open an email to `support@peaklogicsolutions.com`; this static site does not process form submissions.
