/* Done Right: write the catalog migration from js/data/*.js (macOS, no Node needed):
 *   osascript -l JavaScript tools/gen_catalog_sql.js > supabase/migrations/20260922000200_catalog.sql
 * Run from the repo root. On other platforms open tools/catalog-sql.html in a browser instead. */
ObjC.import('Foundation');
function read(p) {
  const s = $.NSString.stringWithContentsOfFileEncodingError(p, $.NSUTF8StringEncoding, null);
  if (s.isNil()) throw new Error('Cannot read ' + p + ' (run from the repo root)');
  return ObjC.unwrap(s);
}
var window = this;
window.DR = {};
['js/data/categories.js', 'js/data/locations.js', 'js/data/licensing.js', 'tools/catalog-sql.js'].forEach((f) => eval(read(f)));
DR.catalogSQL();
