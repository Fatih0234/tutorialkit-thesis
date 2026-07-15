import { describe, expect, it } from 'vitest';
import { getLanguage, supportedLanguages } from './languages.js';

describe('CodeMirror language registry', () => {
  it.each(['main.py', 'launcher.pyw'])('lazy-loads Python for %s', async (fileName) => {
    expect(supportedLanguages.find((language) => language.name === 'Python')?.extensions).toContain(
      fileName.split('.').at(-1),
    );
    expect(await getLanguage(fileName)).toBeDefined();
  });
});
