/**
 * Lot F: what the app says about the user is either epicene, or agrees with the physiological sex of the
 * profile. Never a masculine default presented as neutral, never an inclusive dot, and never a gendered
 * word before the sex has been given.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { agree, occupationLabel, SCOPE_TEXT } from '@/app/copy';
import { ONBOARDING_SCREENS } from '@/domain/onboarding';
import type { OccupationActivity } from '@/science/types';

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(p) ? [p] : [];
  });
}
const UI_SOURCE = [...walk('src/screens'), ...walk('src/components'), ...walk('src/app')];

describe('gender agreement (lot F)', () => {
  it('agrees with the profile, and falls back to the masculine form only where nothing is shown', () => {
    expect(agree('female', 'Assis', 'Assise')).toBe('Assise');
    expect(agree('male', 'Assis', 'Assise')).toBe('Assis');
    // No sex yet: there is no agreed form to pick, which is why such copy is written epicene instead.
    expect(agree(null, 'Assis', 'Assise')).toBe('Assis');
  });

  it('agrees on the seated answer and leaves the epicene ones alone', () => {
    expect(occupationLabel('seated', 'female')).toBe('Assise');
    expect(occupationLabel('seated', 'male')).toBe('Assis');
    for (const o of ['mixed', 'standing', 'physical'] as OccupationActivity[]) {
      expect(occupationLabel(o, 'female'), o).toBe(occupationLabel(o, 'male'));
    }
    expect([occupationLabel('mixed', 'female'), occupationLabel('standing', 'female'), occupationLabel('physical', 'female')]).toEqual(['Mixte', 'Debout', 'Physique']);
  });

  it('asks the sex before every screen whose copy agrees with it', () => {
    const order = ONBOARDING_SCREENS.map((s) => s.id);
    expect(order.indexOf('sex')).toBeLessThan(order.indexOf('occupation'));
    // The scope question is on the age screen, before the sex: its wording must hold for everyone.
    expect(order.indexOf('age')).toBeLessThan(order.indexOf('sex'));
    expect(SCOPE_TEXT.label).not.toMatch(/enceinte|allaitante|prête?\b/);
    expect(SCOPE_TEXT.label).toContain('grossesse');
    expect(SCOPE_TEXT.label).toContain('allaitement');
  });

  it('leaves no gendered form about the user in the interface', () => {
    // Forms that described the reader and were either reworded epicene, or routed through `agree`.
    const GENDERED = /enceinte|allaitante|reste attentif|\bAssise?\b|[a-zà-ÿ]·e·?s?\b|[a-zà-ÿ]é\(e\)/;
    const offenders = UI_SOURCE.filter((f) => GENDERED.test(readFileSync(f, 'utf8')) && !f.endsWith(join('app', 'copy.ts')));
    expect(offenders).toEqual([]);
    // In copy.ts the gendered forms exist only as the two branches of the agreement, and the masculine
    // map is no longer exported, so no screen can reach the ungendered label by accident.
    const copy = readFileSync(join('src', 'app', 'copy.ts'), 'utf8');
    expect(copy).toMatch(/agree\(sex, 'Assis', 'Assise'\)/);
    expect(copy).not.toMatch(/export const OCCUPATION_LABEL/);
  });
});
