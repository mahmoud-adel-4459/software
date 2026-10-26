import { EXIT_REASONS } from '@/common/utils/catalog';

/** Old installations start with their existing reasons; a saved list replaces every default. */
export function exitReasonsOf(settings: { exitReasons?: unknown; extraReasons?: unknown }): string[] {
  if (Array.isArray(settings.exitReasons)) return settings.exitReasons as string[];
  return [...new Set([...EXIT_REASONS, ...(Array.isArray(settings.extraReasons) ? settings.extraReasons as string[] : [])])];
}
