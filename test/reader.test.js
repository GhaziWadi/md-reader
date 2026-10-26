import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createReader, renderMarkdown } from '../server.js';

let temporary, root, server, base;
before(async () => {
  temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'md-reader-'));
  root = path.join(temporary, 'notes');
  await fs.mkdir(path.join(root, 'subfolder'), { recursive: true });
  await Promise.all([
    fs.writeFile(path.join(root, 'README.md'), '# Welcome\n\n**Readable** notes.'),
    fs.writeFile(path.join(root, 'ignored.txt'), 'Not Markdown'),
    fs.writeFile(path.join(root, 'subfolder', 'More.MD'), '# More'),
    fs.writeFile(path.join(temporary, 'outside.md'), 'Private outside file'),
    fs.writeFile(path.join(root, 'image.png'), Buffer.from([137, 80, 78, 71])),
  ]);
  server = await createReader(root);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  if (temporary) await fs.rm(temporary, { recursive: true, force: true });
});

test('lists folders first and includes only Markdown files', async () => {
  const data = await (await fetch(`${base}/api/list`)).json();
  assert.deepEqual(data.entries.map(entry => entry.name), ['subfolder', 'README.md']);
  const nested = await (await fetch(`${base}/api/list?path=subfolder`)).json();
  assert.equal(nested.entries[0].path, 'subfolder/More.MD');
});

test('renders a document and serves the interface', async () => {
  const response = await fetch(`${base}/api/read?path=README.md`);
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.match(data.html, /<h1>Welcome<\/h1>/);
  assert.match(data.html, /<strong>Readable<\/strong>/);
  const ui = await fetch(base);
  assert.match(await ui.text(), /Markdown Reader/);
  assert.match(ui.headers.get('content-security-policy'), /frame-ancestors 'none'/);
});

test('blocks traversal, non-Markdown reads, and non-image raw access', async () => {
  for (const requested of ['../outside.md', path.join(temporary, 'outside.md')]) {
    const response = await fetch(`${base}/api/read?path=${encodeURIComponent(requested)}`);
    assert.equal(response.status, 403);
  }
  assert.equal((await fetch(`${base}/api/read?path=ignored.txt`)).status, 400);
  assert.equal((await fetch(`${base}/files/README.md`)).status, 403);
  assert.equal((await fetch(`${base}/files/image.png`)).status, 200);
  assert.equal((await fetch(`${base}/api/read?path=missing.md`)).status, 404);
});

test('blocks a symbolic link that points outside the root', async t => {
  try {
    await fs.symlink(temporary, path.join(root, 'escape'), process.platform === 'win32' ? 'junction' : 'dir');
  } catch (error) {
    if (['EPERM', 'EACCES'].includes(error.code)) return t.skip('Symbolic links unavailable.');
    throw error;
  }
  assert.equal((await fetch(`${base}/api/read?path=escape/outside.md`)).status, 403);
});

test('sanitizes unsafe HTML and resolves relative document links and images', () => {
  const html = renderMarkdown('<script>alert(1)</script>\n\n[Bad](javascript:alert%281%29)\n\n![Diagram](../images/a%20b.png)\n\n[Next](next.md#details)\n\n- [x] Done\n\n<img src="x" onerror="alert(1)">', 'docs/start.md');
  assert.doesNotMatch(html, /<script|onerror|javascript:/i);
  assert.match(html, /src="\/files\/images\/a%20b.png"/);
  assert.match(html, /href="\/files\/docs\/next.md#details"/);
  assert.match(html, /type="checkbox"/);
  assert.match(html, /disabled/);
});
