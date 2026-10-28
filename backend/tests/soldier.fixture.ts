import defaults from '../../tests/fixtures/complete-soldier.json';

/** Positive fixtures contain the full profile and all four (optional) soldier images. */
export function completeSoldierInput(overrides: Record<string, unknown>) {
  return { ...structuredClone(defaults), ...overrides, details: { ...defaults.details, ...(overrides.details as object ?? {}) } };
}
