// Bridges to the REAL, already-built deterministic resolver
// (backend/shared/peakassist.ts) — the "floor" the architecture doc requires
// (§0): "the deterministic resolver is the floor, the LLM is the ceiling...
// the LLM never becomes a hard dependency for basic help." This prototype
// imports the actual repo module (via esbuild, same technique as
// corpus.ts) rather than reimplementing or copying its logic, so there is
// exactly one resolver in the whole codebase, matching the "regenerate never
// hand-edit" / single-source-of-truth discipline used elsewhere.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const PEAKASSIST_TS = path.join(REPO_ROOT, 'backend', 'shared', 'peakassist.ts');
const PEAKASSIST_CONTENT_TS = path.join(REPO_ROOT, 'backend', 'shared', 'peakassist-content.ts');

export interface HelpContentItem {
  id: string;
  helpContextKey: string;
  type: 'screen_guide' | 'procedure' | 'alarm_explanation' | 'troubleshooting' | 'playbook' | 'glossary';
  title: string;
  body: string;
  alarmType?: string | null;
}

interface ResolverModule {
  resolveHelp: (catalog: HelpContentItem[], contextKey: string, opts?: { alarmType?: string | null }) => HelpContentItem[];
  resolveAlarmHelp: (catalog: HelpContentItem[], alarmType: string) => HelpContentItem | null;
}

let cached: { resolver: ResolverModule; catalog: HelpContentItem[] } | null = null;

async function transpileAndImport<T>(entryFile: string): Promise<T> {
  const result = await esbuild.build({
    entryPoints: [entryFile],
    bundle: false,
    write: false,
    format: 'esm',
    platform: 'node',
    target: 'node18',
  });
  const code = result.outputFiles[0].text;
  const dataUrl = 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
  return (await import(dataUrl)) as T;
}

async function load(): Promise<{ resolver: ResolverModule; catalog: HelpContentItem[] }> {
  if (cached) return cached;
  const resolver = await transpileAndImport<ResolverModule>(PEAKASSIST_TS);
  const contentMod = await transpileAndImport<{ PEAKASSIST_CONTENT: HelpContentItem[] }>(PEAKASSIST_CONTENT_TS);
  cached = { resolver, catalog: contentMod.PEAKASSIST_CONTENT };
  return cached;
}

/**
 * The deterministic floor: resolve help for a known screen-context key using
 * the REAL resolveHelp(), exactly as PeakView360/the cloud app would. Used
 * when a question maps to a known context key (e.g. the CLI's `--context`
 * flag), or as the fallback path the design doc requires when the LLM/RAG
 * path can't ground an answer.
 */
export async function resolveHelpForContext(
  contextKey: string,
  opts: { alarmType?: string | null } = {},
): Promise<HelpContentItem[]> {
  const { resolver, catalog } = await load();
  return resolver.resolveHelp(catalog, contextKey, opts);
}

export async function listKnownContextKeys(): Promise<string[]> {
  const { catalog } = await load();
  return [...new Set(catalog.map((c) => c.helpContextKey))];
}
