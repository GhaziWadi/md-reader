import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createReader } from '../server.js';

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
const server = await createReader(temporary);
try {
  await fs.writeFile(path.join(temporary, 'diagram.md'), [
    '# Diagram check',
    '```mermaid', 'flowchart TD', ' A[Start] --> B[Read]', '```',
    '```mermaid', 'this is not a diagram', '```',
    '```js', 'const ordinaryCode = 1;', '```',
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
    console.log('Browser checks passed: flowchart SVG, invalid-diagram fallback, ordinary code, and CSP.');
  } finally { clearTimeout(timer); }
} finally {
  await new Promise(resolve => server.close(resolve));
  // Only remove the unique directory created by this script inside the OS temp folder.
  assert.equal(path.dirname(temporary), path.resolve(os.tmpdir()));
  await fs.rm(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
}
