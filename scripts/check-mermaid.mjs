import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createReader } from '../server.js';
import { svgToIcon } from './import-azure-icons.mjs';

const candidates = [process.env.BROWSER_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].filter(Boolean);
let browser;
for (const candidate of candidates) {
  try { await fs.access(candidate); browser = candidate; break; } catch {}
}
if (!browser) throw new Error('Chrome or Edge not found. Set BROWSER_PATH to its executable.');

const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'md-reader-browser-'));
const iconPack = path.join(temporary, 'synthetic-icons.json');
const server = await createReader(temporary, { iconPack });
// Add a test-only probe; production pages never load this script.
const handler = server.listeners('request')[0];
server.removeAllListeners('request');
server.on('request', (req, res) => {
  if (req.url === '/browser-probe.js') {
    res.writeHead(200, { 'Content-Type': 'text/javascript' });
    res.end(`
      const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
      for (let i = 0; i < 100; i++) {
        const paths = [...document.querySelectorAll('.mermaid-output [fill="#008abc"]')];
        if (paths.length >= 2) {
          const output = document.createElement('output');
          output.id = 'browser-icon-colors';
          output.textContent = paths.map(node => getComputedStyle(node).fill).join('|');
          document.body.append(output);
          break;
        }
        await wait(50);
      }
    `);
    return;
  }
  if (req.url.startsWith('/?file=')) {
    const end = res.end;
    res.end = function (body, ...rest) {
      return end.call(this, body.toString().replace('</body>', '<script type="module" src="/browser-probe.js"></script></body>'), ...rest);
    };
  }
  handler(req, res);
});
try {
  // Original geometric test artwork, not Microsoft's Azure assets.
  await fs.writeFile(iconPack, JSON.stringify({ prefix: 'azure', icons: {
    'app-service': svgToIcon('<svg viewBox="0 0 18 18"><path fill="#008abc" d="M1 1h16v16H1z"/></svg>'),
  } }));
  await fs.writeFile(path.join(temporary, 'diagram.md'), [
    '# Diagram check',
    '```mermaid', 'flowchart TD', ' A[Start] --> B[Read]', '```',
    '```mermaid', 'this is not a diagram', '```',
    '```js', 'const ordinaryCode = 1;', '```',
    '```mermaid', 'flowchart LR', ' app@{ icon: "azure:app-service", label: "Synthetic icon test" }', '```',
    '```mermaid', 'architecture-beta', ' service app(azure:app-service)[Synthetic icon test]', '```',
    '```mermaid', 'flowchart LR', ' app@{ icon: "azure:not-installed", label: "Missing icon test" }', '```',
  ].join('\n\n'));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}/?file=diagram.md`;
  const child = spawn(browser, [
    '--headless', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    `--user-data-dir=${path.join(temporary, 'profile')}`,
    '--virtual-time-budget=15000', '--dump-dom', url,
  ], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '', errors = '';
  child.stdout.on('data', data => { output += data; });
  child.stderr.on('data', data => { errors += data; });
  const timer = setTimeout(() => child.kill(), 45000);
  try {
    const code = await new Promise((resolve, reject) => {
      child.on('error', reject); child.on('close', resolve);
    });
    assert.equal(code, 0, `Browser failed: ${errors.slice(-2000)}`);
    assert.match(output, /<svg[^>]+id="reader-diagram-/, 'Valid flowchart renders as SVG');
    assert.match(output, /class="node default/, 'Flowchart nodes are drawn');
    assert.match(output, /This Mermaid diagram could not be rendered/, 'Invalid diagram shows its fallback');
    assert.match(output, /<code class="language-js">\s*const ordinaryCode = 1;/, 'Regular code stays intact');
    assert.doesNotMatch(errors, /Refused to (?:apply|execute|load)/, 'CSP permits diagram resources');
    assert.ok((output.match(/<svg[^>]+id="reader-diagram-/g) || []).length >= 3, 'Flowchart, icon flowchart, and architecture diagrams render');
    assert.match(output, /fill="#008abc"/, 'Registered artwork retains its color');
    assert.match(output, /id="browser-icon-colors">rgb\(0, 138, 188\)\|rgb\(0, 138, 188\)/, 'Both diagram types preserve displayed icon colors');
    assert.match(output, /Azure icon "not-installed" is not installed/, 'Unavailable aliases show an actionable message');
    console.log('Browser checks passed: flowcharts, local icon registration, architecture icons, missing aliases, invalid syntax, ordinary code, and CSP.');
  } finally { clearTimeout(timer); }
} finally {
  await new Promise(resolve => server.close(resolve));
  // Only remove the unique directory created by this script inside the OS temp folder.
  assert.equal(path.dirname(temporary), path.resolve(os.tmpdir()));
  await fs.rm(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
}
