import { describe, expect, it } from 'vitest';
import { en } from './en';
import { pt } from './pt';

describe('i18n dictionaries', () => {
  it('pt mirrors every key in en', () => {
    expect(Object.keys(pt).sort()).toEqual(Object.keys(en).sort());
  });

  it('has no empty translations', () => {
    for (const [key, value] of Object.entries(en)) expect(value, `en:${key}`).not.toBe('');
    for (const [key, value] of Object.entries(pt)) expect(value, `pt:${key}`).not.toBe('');
  });
});
