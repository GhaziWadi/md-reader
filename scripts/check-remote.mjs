import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { createReader } from '../server.js';

let browserPath;
for (const candidate of [process.env.BROWSER_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome', '/usr/bin/chromium', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].filter(Boolean)) {
  try { await fs.access(candidate); browserPath = candidate; break; } catch {}
}
if (!browserPath) throw new Error('Chrome or Edge not found. Set BROWSER_PATH.');
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'md-reader-remote-browser-'));
await fs.writeFile(path.join(temporary, 'Local.md'), '# Local document');
const server = await createReader(temporary, { remoteReader: async input => {
  const url = new URL(input);
  if (url.pathname === '/fail.md') throw Object.assign(new Error('Remote fixture is unavailable.'), { status: 502 });
  return { url: url.href, modified: null, source: url.pathname.endsWith('next.md') ? '# Next document\n\n## Details\n\nLinked document.' : '# Remote document\n\n[Next](next.md#details)\n\n```mermaid\nflowchart LR\n A --> B\n```' };
} });
const handler = server.listeners('request')[0];
server.removeAllListeners('request');
server.on('request', (req, res) => {
  if (req.url === '/remote-probe.js') {
    res.writeHead(200, { 'Content-Type': 'text/javascript' });
    res.end(`
      const result = document.createElement('output'); result.id = 'remote-check'; document.body.append(result);
      const wait = async (test, label) => { for (let i = 0; i < 150; i++) { if (test()) return; await new Promise(resolve => setTimeout(resolve, 30)); } throw new Error('Timed out: ' + label); };
      const ensure = (test, message) => { if (!test) throw new Error(message); };
      const title = () => document.querySelector('#content h1')?.textContent;
      try {
        await wait(() => title() === 'Remote document' && document.querySelector('.mermaid-output svg'), 'initial document');
        ensure(document.getElementById('remote-url').value === 'https://example.com/docs/start.md', 'URL field reflects the document');
        document.querySelector('#content a').click();
        await wait(() => title() === 'Next document', 'relative link');
        ensure(new URLSearchParams(location.search).get('url') === 'https://example.com/docs/next.md', 'Relative Markdown link resolves remotely');
        ensure(location.hash === '#details', 'Heading hash is preserved');
        history.back();
        await wait(() => title() === 'Remote document' && document.querySelector('.mermaid-output svg'), 'browser Back');
        history.forward();
        await wait(() => title() === 'Next document', 'browser Forward');
        document.querySelector('#breadcrumbs button').click();
        await wait(() => !document.getElementById('welcome').hidden, 'local folder');
        document.querySelector('.file-row:not(.folder)').click();
        await wait(() => title() === 'Local document', 'local document');
        document.getElementById('remote-url').value = 'https://example.com/docs/start.md';
        document.getElementById('remote-form').requestSubmit();
        await wait(() => title() === 'Remote document' && document.querySelector('.mermaid-output svg'), 'URL form');
        document.getElementById('refresh').click();
        await wait(() => !document.getElementById('remote-open').disabled, 'refresh');
        ensure(title() === 'Remote document', 'Refresh preserves remote selection');
        document.getElementById('remote-url').value = 'https://example.com/fail.md';
        document.getElementById('remote-form').requestSubmit();
        await wait(() => !document.getElementById('message').hidden, 'error message');
        ensure(document.getElementById('message').textContent === 'Remote fixture is unavailable.', 'Shows remote failures');
        ensure(!document.getElementById('remote-open').disabled, 'Can retry after a failure');
        result.textContent = 'passed';
      } catch (error) { result.textContent = error.message; }
    `);
    return;
  }
  if (req.url.startsWith('/?url=')) {
    const end = res.end;
    res.end = function(body, ...rest) { return end.call(this, body.toString().replace('</body>', '<script type="module" src="/remote-probe.js"></script></body>'), ...rest); };
  }
  handler(req, res);
});
try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}/?url=${encodeURIComponent('https://example.com/docs/start.md')}`;
  const browser = spawn(browserPath, ['--headless', '--disable-gpu', '--no-first-run', '--no-default-browser-check', `--user-data-dir=${path.join(temporary, 'profile')}`, '--virtual-time-budget=20000', '--dump-dom', url], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let html = '', errors = '';
  browser.stdout.on('data', chunk => { html += chunk; });
  browser.stderr.on('data', chunk => { errors += chunk; });
  const timer = setTimeout(() => browser.kill(), 45000);
  try {
    const code = await new Promise((resolve, reject) => { browser.once('close', resolve); browser.once('error', reject); });
    assert.equal(code, 0, errors.slice(-1500));
    assert.equal(html.match(/id="remote-check">([^<]*)/)?.[1], 'passed');
    console.log('Remote browser checks passed: URL form, Mermaid, relative links and anchors, history, refresh, errors, and local files.');
  } finally { clearTimeout(timer); }
} finally {
  await new Promise(resolve => server.close(resolve));
  assert.equal(path.dirname(temporary), path.resolve(os.tmpdir()));
  await fs.rm(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
}
