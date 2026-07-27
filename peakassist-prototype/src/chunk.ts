// Chunking for the Product KB (architecture doc §4.2 / §5). Two source shapes
// today: HTML guides (chunk by heading section) and the PEAKASSIST_CONTENT
// corpus (already one coherent unit per item — chunked further only if long).

export interface Chunk {
  id: string;
  source: 'sysadmin-guide' | 'user-guide' | 'peakassist-content';
  title: string;
  text: string;
}

const MAX_CHARS = 900;
const OVERLAP_CHARS = 120;

/** Split long text into overlapping windows so no chunk exceeds MAX_CHARS. */
function splitLong(text: string): string[] {
  if (text.length <= MAX_CHARS) return [text];
  const parts: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + MAX_CHARS, text.length);
    parts.push(text.slice(start, end));
    if (end === text.length) break;
    start = end - OVERLAP_CHARS;
  }
  return parts;
}

/**
 * Strip HTML to plain text, then split into one chunk per top-level heading
 * section (h1/h2/h3), further splitting a section if it's long. Very small
 * sections (nav chrome, empty headers) are dropped.
 */
export function chunkHtmlGuide(html: string, source: 'sysadmin-guide' | 'user-guide'): Chunk[] {
  // Drop <script>/<style> content entirely — never real guide prose.
  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ');

  // Split on heading tags, keeping the heading text as the section title.
  const headingRe = /<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi;
  const sections: { title: string; bodyHtml: string }[] = [];

  let match: RegExpExecArray | null;
  const matches: { title: string; start: number; end: number }[] = [];
  while ((match = headingRe.exec(cleaned))) {
    matches.push({ title: stripTags(match[1]), start: match.index, end: headingRe.lastIndex });
  }

  for (let i = 0; i < matches.length; i++) {
    const bodyStart = matches[i].end;
    const bodyEnd = i + 1 < matches.length ? matches[i + 1].start : cleaned.length;
    sections.push({ title: matches[i].title, bodyHtml: cleaned.slice(bodyStart, bodyEnd) });
  }
  // Anything before the first heading (rare, but don't silently drop it).
  if (matches.length === 0 || matches[0].start > 0) {
    const preface = cleaned.slice(0, matches[0]?.start ?? cleaned.length);
    sections.unshift({ title: 'Introduction', bodyHtml: preface });
  }

  const chunks: Chunk[] = [];
  let n = 0;
  for (const { title, bodyHtml } of sections) {
    const text = normalizeWhitespace(stripTags(bodyHtml));
    if (text.length < 40) continue; // nav chrome / empty section — not real content
    for (const part of splitLong(text)) {
      chunks.push({ id: `${source}-${n++}`, source, title, text: part });
    }
  }
  return chunks;
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, ' ');
}

function normalizeWhitespace(text: string): string {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}
