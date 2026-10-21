// Post-build guard: the production page must satisfy the strict CSP (no inline scripts/styles, no remote URLs).
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = fileURLToPath(new URL('../dist/', import.meta.url));
const html = readFileSync(join(dist, 'index.html'), 'utf8');
const problems = [];
if (!html.includes("Content-Security-Policy")) problems.push('missing CSP meta');
if (html.includes('unsafe-inline')) problems.push("CSP contains 'unsafe-inline'");
for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
  if (!/\bsrc=/.test(m[1]) || m[2].trim()) problems.push('inline script in index.html');
}
if (/<style\b/i.test(html)) problems.push('inline <style> in index.html');
if (/\sstyle=/i.test(html)) problems.push('inline style attribute in index.html');
if (/\s(onclick|onload|onerror)=/i.test(html)) problems.push('inline event handler in index.html');
if (/https?:\/\//.test(html.replace(/xmlns="[^"]*"/g, ''))) problems.push('remote URL in index.html');
const assets = readdirSync(join(dist, 'assets'));
for (const f of assets.filter((n) => n.endsWith('.css'))) {
  const css = readFileSync(join(dist, 'assets', f), 'utf8');
  if (/url\(\s*['"]?https?:/.test(css)) problems.push(`remote url() in ${f}`);
}
if (problems.length) {
  console.error('CSP check failed:\n - ' + problems.join('\n - '));
  process.exit(1);
}
console.log(`CSP check ok (${assets.length} assets, no inline scripts/styles besides nonce'd emotion tags).`);
