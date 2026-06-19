/* eslint-env jest, node */

global.self = global;

const {
  cleanText,
  replaceSmartQuotes
} = require('./worker.js');

describe('worker normalization helper functions', () => {
  test('replaceSmartQuotes should normalize smart single and double quotes', () => {
    expect(replaceSmartQuotes('“hello” and ‘world’')).toBe('"hello" and \'world\'');
  });

  test('cleanText should perform basic quotes and spaces normalization', () => {
    const input = 'This is a test: “hello”  world';
    const expected = 'This is a test: "hello" world';
    expect(cleanText(input)).toBe(expected);
  });
});
