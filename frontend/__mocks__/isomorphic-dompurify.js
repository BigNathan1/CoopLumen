// The published `isomorphic-dompurify` build pulls in jsdom 29, whose ESM-only
// dependencies Jest cannot require. Under the jsdom test environment DOMPurify
// itself works directly, so tests use that instance instead.
const dompurify = require('dompurify');

const instance = typeof dompurify === 'function' ? dompurify(window) : dompurify;

module.exports = { __esModule: true, default: instance };
