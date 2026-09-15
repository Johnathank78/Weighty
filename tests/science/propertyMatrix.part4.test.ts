import { expect, it } from 'vitest';
import { PROFILES_PER_PART, runPropertyPart } from '../helpers/propertyMatrix';

it('randomized property matrix part 4 of 4 (2,500 accepted profiles)', () => {
  const r = runPropertyPart(4);
  expect(r.accepted).toBe(PROFILES_PER_PART);
  expect(r.plans).toBeGreaterThan(PROFILES_PER_PART / 3);
}, 600_000);
