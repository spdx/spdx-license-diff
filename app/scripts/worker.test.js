// SPDX-FileCopyrightText: Alan D. Tse <alandtse@gmail.com>
// SPDX-License-Identifier: (GPL-3.0-or-later AND Apache-2.0)

global.self = global;

const {
  cleanText,
  replaceSmartQuotes,
  normalizeCommas,
  normalizeDashes,
  removeZeroWidthChars,
  escapeHtml,
  escapeHtmlAttributes,
  escapeRegex,
  processTemplate,
  removeLineNumbers
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

describe('worker helper functions', () => {
  test('escapeHtml should escape HTML special characters and newlines', () => {
    expect(escapeHtml('Hello & Welcome <world>')).toBe('Hello &amp; Welcome &lt;world&gt;');
    expect(escapeHtml('Line 1\nLine 2')).toBe('Line 1<br>Line 2');
  });

  test('escapeHtmlAttributes should escape attributes safely', () => {
    expect(escapeHtmlAttributes('class="test" & name=\'foo\' <tag>')).toBe('class=&quot;test&quot; &amp; name=&#39;foo&#39; &lt;tag&gt;');
  });

  test('escapeRegex should escape special regex characters', () => {
    expect(escapeRegex('hello-world. [test] (abc) *+?^$|\\/{}')).toBe('hello\\-world\\. \\[test\\] \\(abc\\) \\*\\+\\?\\^\\$\\|\\\\\\/\\{\\}');
  });

  test('removeLineNumbers should strip line numbers when they are present on most lines', () => {
    // 80% default threshold. 5 lines of code, all 5 start with numbers.
    const input = '1: First line\n2: Second line\n3: Third line\n4: Fourth line\n5: Fifth line';
    const expected = ': First line\n: Second line\n: Third line\n: Fourth line\n: Fifth line';
    expect(removeLineNumbers(input)).toBe(expected);

    // If it does not exceed the percentage threshold, it shouldn't modify them
    const mixedInput = '1: First line\nSecond line\nThird line\nFourth line\nFifth line';
    expect(removeLineNumbers(mixedInput)).toBe(mixedInput);
  });

  test('processTemplate should extract variables and optional tags from templates', () => {
    const template = 'This is <<var;name="licenseName";match=".+?">> under <<beginOptional>>optional<<endOptional>> conditions.';
    const result = processTemplate(template);
    expect(result.variables).toEqual([{ name: 'licenseName', match: '.+?' }]);
    expect(result.patterns).toEqual(['.+?']);
    expect(result.matchRegex).toBe('This is (.+?) under (\\s?optional\\s?)?\\s*conditions\\.');
  });
});
