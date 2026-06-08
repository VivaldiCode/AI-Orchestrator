import { describe, expect, it } from 'vitest';
import { en } from './en';
import { pt } from './pt';
import { es } from './es';

// Every non-English locale must mirror `en` exactly. Add new locales here and
// the parity + no-empty checks cover them automatically.
const LOCALES: Record<string, Record<string, string>> = { pt, es };

describe('i18n dictionaries', () => {
  const enKeys = Object.keys(en).sort();

  for (const [name, dict] of Object.entries(LOCALES)) {
    it(`${name} mirrors every key in en`, () => {
      expect(Object.keys(dict).sort()).toEqual(enKeys);
    });
  }

  it('has no empty translations', () => {
    for (const [key, value] of Object.entries(en)) expect(value, `en:${key}`).not.toBe('');
    for (const [name, dict] of Object.entries(LOCALES)) {
      for (const [key, value] of Object.entries(dict)) expect(value, `${name}:${key}`).not.toBe('');
    }
  });
});
