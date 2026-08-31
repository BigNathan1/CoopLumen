// CSS Modules stub: returns the requested class name so tests can assert on
// `class` attributes (e.g. `[class*="spinner"]`) instead of empty strings.
module.exports = new Proxy(
  {},
  {
    get: (target, key) => (key === '__esModule' ? false : key),
  }
);
