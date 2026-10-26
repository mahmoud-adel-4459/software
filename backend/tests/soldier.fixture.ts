import defaults from '../../tests/fixtures/complete-soldier.json';

/** Positive fixtures contain the full profile and four images required by soldier registration. */
export function completeSoldierInput(overrides: Record<string, unknown>) {
  return { ...structuredClone(defaults), ...overrides, details: { ...defaults.details, ...(overrides.details as object ?? {}) } };
}
