global.self = global;

const {
  cleanText,
  replaceSmartQuotes,
  normalizeCommas,
  normalizeDashes,
  removeZeroWidthChars
} = require('./worker.js');

describe('worker normalization helper functions', () => {
  test('normalizeCommas should convert full-width, vertical, and small commas to standard commas', () => {
    expect(normalizeCommas('a，b︐c﹐d')).toBe('a,b,c,d');
  });

  test('normalizeDashes should convert various unicode dashes and minus signs to standard hyphens', () => {
    expect(normalizeDashes('a‐b‑c‒d–e—f―g−h－i')).toBe('a-b-c-d-e-f-g-h-i');
  });

  test('replaceSmartQuotes should normalize smart single and double quotes and prime marks', () => {
    expect(replaceSmartQuotes('“hello” and ‘world’')).toBe('"hello" and \'world\'');
    expect(replaceSmartQuotes('＂test＇')).toBe('"test\'');
  });

  test('removeZeroWidthChars should strip zero-width spaces, joiners, and soft hyphens', () => {
    // \u200B (ZWSP), \u200C (ZWNJ), \u200D (ZWJ), \u2060 (WJ), \uFEFF (BOM), \u00AD (SHY)
    expect(removeZeroWidthChars('a\u200Bb\u200Cc\u200Dd\u2060e\uFEFFf\u00ADg')).toBe('abcdefg');
  });

  test('cleanText should perform end-to-end normalization', () => {
    const input = 'This is a test: “hello”，with dashes—and\u200Bzero-width chars.';
    const expected = 'This is a test: "hello",with dashes-andzero-width chars.';
    expect(cleanText(input)).toBe(expected);
  });
});
