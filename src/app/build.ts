/**
 * Build of the code in service (report 49, point 1a): short commit and date, injected by vite.config.ts at build time and in
 * the dev server. Absent (tests): 'dev'.
 */
import type { BuildInfo } from '@/persistence/exportImport';

declare const __WHEIGHTY_BUILD__: BuildInfo | undefined;

export const BUILD: BuildInfo = typeof __WHEIGHTY_BUILD__ !== 'undefined' ? __WHEIGHTY_BUILD__ : { commit: 'dev', date: null };

/** "71bc77e 2026-10-24" for the logs; the commit alone without a date. */
export function buildLabel(build: BuildInfo = BUILD): string {
  return build.date ? `${build.commit} ${build.date}` : build.commit;
}
