// Adapts peaklogic-architecture-diagram.html for publishing as a Claude
// Artifact — a different target than "Investor Documents", which is a
// print-oriented, 420mm x 236mm-per-page document meant to also exist as a
// PDF. The Artifact platform wraps published content in its own
// <!doctype>/<html>/<head>/<body> skeleton (no such tags belong in the
// source file) and requires wide content to scroll inside its own
// container rather than the page body, so the same six <section
// class="slide"> blocks the generator produces get re-wrapped here rather
// than published as-is:
//   - strips the generator's own <!doctype html><html>...<body> shell,
//     keeping just the <style> block and the six slides
//   - wraps each slide in a shadowed "page-shell" card on a neutral canvas
//     background, so six fixed-width print pages read as a document on
//     screen instead of six borderless pages jammed edge to edge
//   - gives every page-shell its own overflow-x:auto (each slide is a
//     literal 420mm wide, wider than most viewports) so the ARTIFACT BODY
//     itself never scrolls horizontally — the platform's one hard rule for
//     wide content
//   - paints an explicit light/dark canvas background so the artifact
//     holds its own look regardless of the viewer's host theme, since the
//     diagram's internal palette (AZURE/SEC/POS tokens etc.) is fixed and
//     was never designed to invert
//
// Run AFTER build-architecture.mjs (reads its output). Writes
// artifact-export.html into this same directory — gitignored, since it's
// a derived adapter for one specific publishing target, not an investor
// deliverable in its own right; regenerate it, don't hand-edit it.

import { writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, '..', 'Investor Documents', 'peaklogic-architecture-diagram.html');
const html = readFileSync(src, 'utf8');

const styleMatch = html.match(/<style>([\s\S]*?)<\/style>/);
if (!styleMatch) throw new Error('Could not find <style> block in ' + src);
const originalStyle = styleMatch[1];

const sections = html.split(/(?=<section class="slide">)/).filter((s) => s.startsWith('<section'));
if (sections.length === 0) throw new Error('Found zero <section class="slide"> blocks in ' + src);
// The last section's captured text runs to end-of-file, dragging along the
// generator's own closing </body></html> — trim everything after the last
// real </section>.
sections[sections.length - 1] = sections[sections.length - 1].replace(/<\/section>[\s\S]*$/, '</section>');

const wrapperStyle = `
  :root { --canvas-bg: #eef0f4; --canvas-bg-dark: #1b1c20; }
  html, body { background: var(--canvas-bg); }
  @media (prefers-color-scheme: dark) {
    html:not([data-theme="light"]), body:not([data-theme="light"]) { background: var(--canvas-bg-dark); }
  }
  [data-theme="dark"] { background: var(--canvas-bg-dark); }
  .diagram-canvas { padding: 28px 20px 48px; display: flex; flex-direction: column; align-items: center; gap: 28px; }
  .page-shell {
    background: #fff;
    box-shadow: 0 1px 2px rgba(20,22,29,.08), 0 12px 32px rgba(20,22,29,.14);
    border-radius: 6px;
    overflow-x: auto;
    max-width: 100%;
  }
  .page-shell .slide { page-break-after: auto; background: #fff; }
`;

const body = sections.map((s) => `<div class="page-shell">\n${s}\n</div>`).join('\n');

const out = `<style>${originalStyle}\n${wrapperStyle}</style>
<div class="diagram-canvas">
${body}
</div>`;

writeFileSync(join(here, 'artifact-export.html'), out);
console.log(`artifact-export.html built (${sections.length} pages, ${out.length} bytes)`);
