// Loads the real Product KB sources (architecture doc §5): the current
// SysAdmin Guide, the current User Guide, and the PEAKASSIST_CONTENT corpus —
// the SAME files the real platform ships, never a duplicated/hand-copied
// version. No fixtures, no invented sample docs.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import * as esbuild from 'esbuild';
import { chunkHtmlGuide, type Chunk } from './chunk.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

const SYSADMIN_GUIDE = path.join(REPO_ROOT, 'sysadmin-guides', 'PeakLogic_SysAdmin_Guide.html');
const USER_GUIDE = path.join(REPO_ROOT, 'user-guides', 'PeakLogic_User_Guide.html');
const PEAKASSIST_CONTENT_TS = path.join(REPO_ROOT, 'backend', 'shared', 'peakassist-content.ts');

interface HelpContentItem {
  id: string;
  helpContextKey: string;
  type: 'screen_guide' | 'procedure' | 'alarm_explanation' | 'troubleshooting' | 'playbook' | 'glossary';
  title: string;
  body: string;
  alarmType?: string | null;
}

/**
 * Transpiles the real backend/shared/peakassist-content.ts (a plain TS module,
 * only type-only imports) via esbuild and evaluates it to get the literal
 * PEAKASSIST_CONTENT array — the actual repo source of truth, not a copy.
 */
async function loadPeakAssistContent(): Promise<HelpContentItem[]> {
  const result = await esbuild.build({
    entryPoints: [PEAKASSIST_CONTENT_TS],
    bundle: false, // single file — its only import is a type, erased by esbuild
    write: false,
    format: 'esm',
    platform: 'node',
    target: 'node18',
  });
  const code = result.outputFiles[0].text;
  const dataUrl = 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
  const mod = (await import(dataUrl)) as { PEAKASSIST_CONTENT: HelpContentItem[] };
  return mod.PEAKASSIST_CONTENT;
}

function peakAssistContentToChunks(items: HelpContentItem[]): Chunk[] {
  return items.map((item) => ({
    id: `peakassist-content-${item.id}`,
    source: 'peakassist-content' as const,
    title: item.title,
    text: item.body,
  }));
}

export async function loadCorpus(): Promise<Chunk[]> {
  const sysadminHtml = readFileSync(SYSADMIN_GUIDE, 'utf-8');
  const userHtml = readFileSync(USER_GUIDE, 'utf-8');
  const peakAssistContent = await loadPeakAssistContent();

  const chunks: Chunk[] = [
    ...chunkHtmlGuide(sysadminHtml, 'sysadmin-guide'),
    ...chunkHtmlGuide(userHtml, 'user-guide'),
    ...peakAssistContentToChunks(peakAssistContent),
  ];

  return chunks;
}
