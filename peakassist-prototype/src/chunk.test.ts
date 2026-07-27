import { describe, it, expect } from 'vitest';
import { chunkHtmlGuide } from './chunk.js';

describe('chunkHtmlGuide', () => {
  it('splits into one chunk per heading section', () => {
    const html = `
      <h1>Intro</h1>
      <p>This is the introduction paragraph, long enough to keep.</p>
      <h2>Section Two</h2>
      <p>This is the second section's content, also long enough to keep.</p>
    `;
    const chunks = chunkHtmlGuide(html, 'user-guide');
    expect(chunks.map((c) => c.title)).toEqual(['Intro', 'Section Two']);
  });

  it('drops sections shorter than the minimum content length (nav chrome)', () => {
    const html = `<h2>Empty</h2><p></p><h2>Real Section</h2><p>${'x'.repeat(80)}</p>`;
    const chunks = chunkHtmlGuide(html, 'sysadmin-guide');
    expect(chunks).toHaveLength(1);
    expect(chunks[0].title).toBe('Real Section');
  });

  it('splits a long section into overlapping windows so no chunk exceeds the max size', () => {
    const longBody = 'word '.repeat(400); // ~2000 chars, well over the 900-char window
    const html = `<h2>Long Section</h2><p>${longBody}</p>`;
    const chunks = chunkHtmlGuide(html, 'sysadmin-guide');
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.text.length).toBeLessThanOrEqual(900);
    // Every chunk from a split section keeps the section's own title.
    expect(chunks.every((c) => c.title === 'Long Section')).toBe(true);
  });

  it('strips real tags and decodes common HTML entities', () => {
    const html = `<h2>Entities</h2><p>Alerts &amp; Alarms, shown here in <b>bold</b> text for emphasis. It&#39;s fine either way.</p>`;
    const chunks = chunkHtmlGuide(html, 'user-guide');
    expect(chunks[0].text).toContain('Alerts & Alarms');
    expect(chunks[0].text).toContain("It's fine");
    expect(chunks[0].text).not.toContain('<b>');
  });

  it('captures content before the first heading rather than silently dropping it', () => {
    const html = `<p>${'preface content '.repeat(10)}</p><h2>First Real Heading</h2><p>${'body '.repeat(20)}</p>`;
    const chunks = chunkHtmlGuide(html, 'sysadmin-guide');
    expect(chunks.some((c) => c.title === 'Introduction')).toBe(true);
  });
});
