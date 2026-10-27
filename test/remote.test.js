import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { gzipSync } from 'node:zlib';
import { isPublicAddress, markdownUrl, readRemoteMarkdown } from '../remote-markdown.js';
import { createReader, renderMarkdown } from '../server.js';

function transport(pages, resolve = async () => [{ address: '8.8.8.8', family: 4 }]) {
  const calls = [];
  const request = (url, options, callback) => {
    calls.push({ url: url.href, options });
    const page = pages[calls.length - 1] || {};
    const req = new EventEmitter();
    req.end = () => {
      options.signal.addEventListener('abort', () => req.emit('error', new Error('Aborted')), { once: true });
      options.lookup(url.hostname, { all: true }, error => {
        if (error) return req.emit('error', error);
        const response = Readable.from([Buffer.isBuffer(page.body) ? page.body : Buffer.from(page.body ?? '# Remote')]);
        response.statusCode = page.status || 200;
        response.headers = { 'content-type': 'text/plain; charset=utf-8', ...page.headers };
        callback(response);
      });
    };
    return req;
  };
  return { calls, options: { requestHttp: request, requestHttps: request, resolve } };
}

test('rejects local, private, mapped, and reserved addresses while allowing public internet addresses', () => {
  for (const address of ['127.0.0.1', '10.2.3.4', '172.16.1.1', '192.168.1.1', '169.254.169.254', '100.64.1.2', '0.0.0.0', '224.0.0.1', '::1', '::ffff:127.0.0.1', 'fd00::1', 'fe80::1', '2001:db8::1', '2002:7f00:1::']) assert.equal(isPublicAddress(address), false, address);
  for (const address of ['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111']) assert.equal(isPublicAddress(address), true, address);
  for (const url of ['file:///C:/notes.md', 'ftp://example.com/a.md', 'https://user:pass@example.com/a.md', 'http://2130706433/a.md', 'http://[::1]/a.md']) assert.throws(() => markdownUrl(url));
});

test('normalizes GitHub file URLs to raw Markdown without losing query parameters', () => {
  assert.equal(markdownUrl('https://github.com/org/repo/blob/main/docs/start.md?raw=1#section').href, 'https://raw.githubusercontent.com/org/repo/main/docs/start.md?raw=1');
});

test('follows public redirects, pins DNS answers, and resolves metadata from the final response', async () => {
  const fixture = transport([
    { status: 302, headers: { location: '/docs/final.md' } },
    { body: '# Final', headers: { 'last-modified': 'Mon, 26 Oct 2026 12:00:00 GMT' } },
  ]);
  const result = await readRemoteMarkdown('https://example.com/start.md', fixture.options);
  assert.equal(result.source, '# Final');
  assert.equal(result.url, 'https://example.com/docs/final.md');
  assert.equal(result.modified, '2026-10-26T12:00:00.000Z');
  assert.equal(fixture.calls.length, 2);
  assert.equal(fixture.calls[0].options.agent, false);
  assert.equal(fixture.calls[0].options.headers.Cookie, undefined);
});

test('rejects private DNS answers and redirects to private or non-HTTP destinations', async () => {
  for (const answers of [[{ address: '127.0.0.1', family: 4 }], [{ address: '8.8.8.8', family: 4 }, { address: '10.0.0.1', family: 4 }]]) {
    const fixture = transport([{}], async () => answers);
    await assert.rejects(readRemoteMarkdown('https://example.com/a.md', fixture.options), error => error.status === 403);
  }
  for (const destination of ['http://127.0.0.1/private.md', 'file:///private.md']) {
    const fixture = transport([{ status: 302, headers: { location: destination } }]);
    await assert.rejects(readRemoteMarkdown('https://example.com/a.md', fixture.options), error => [400, 403].includes(error.status));
    assert.equal(fixture.calls.length, 1);
  }
});

test('handles HTTP failures, HTML, redirect loops, binary data, and oversized bodies', async () => {
  for (const [page, status] of [
    [{ status: 404 }, 502],
    [{ headers: { 'content-type': 'text/html' }, body: '<html>Sign in</html>' }, 415],
    [{ headers: { 'content-length': 10 * 1024 * 1024 + 1 } }, 413],
    [{ body: Buffer.alloc(10 * 1024 * 1024 + 1, 65) }, 413],
    [{ body: Buffer.from([65, 0, 66]) }, 415],
  ]) {
    const fixture = transport([page]);
    await assert.rejects(readRemoteMarkdown('https://example.com/a.md', fixture.options), error => error.status === status);
  }
  const loop = transport(Array.from({ length: 6 }, () => ({ status: 302, headers: { location: '/again.md' } })));
  await assert.rejects(readRemoteMarkdown('https://example.com/a.md', loop.options), /too many times/);
});

test('decodes compressed content and enforces a total request timeout', async () => {
  const compressed = transport([{ body: gzipSync('# Compressed'), headers: { 'content-encoding': 'gzip' } }]);
  assert.equal((await readRemoteMarkdown('https://example.com/a.md', compressed.options)).source, '# Compressed');
  const slow = transport([{}], () => new Promise(resolve => setTimeout(() => resolve([{ address: '8.8.8.8', family: 4 }]), 60)));
  await assert.rejects(readRemoteMarkdown('https://example.com/a.md', { ...slow.options, timeout: 10 }), error => error.status === 504);
});

test('remote rendering keeps anchors, resolves relative assets, and sanitizes HTML', () => {
  const html = renderMarkdown('[Next](../next.md#details)\n\n![Image](images/a.png)\n\n[Here](#title)\n\n<script>alert(1)</script>\n\n[Unsafe](javascript:alert%281%29)\n\n<img src="http://[">', '', { remoteUrl: 'https://example.com/docs/start.md' });
  assert.match(html, /href="https:\/\/example.com\/next.md#details"/);
  assert.match(html, /src="https:\/\/example.com\/docs\/images\/a.png"/);
  assert.match(html, /href="#title"/);
  assert.match(html, /referrerpolicy="no-referrer"/);
  assert.doesNotMatch(html, /<script|javascript:|http:\/\/\[/);
});

test('remote endpoint renders documents, preserves Mermaid fences, and rejects cross-site requests', async () => {
  const server = await createReader(process.cwd(), { remoteReader: async url => {
    assert.equal(url, 'https://example.com/notes.md');
    return { source: '# Notes\n\n```mermaid\nflowchart LR\n A --> B\n```', url, modified: null };
  } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const target = `http://127.0.0.1:${server.address().port}/api/remote?url=${encodeURIComponent('https://example.com/notes.md')}`;
    const response = await fetch(target);
    const data = await response.json();
    assert.equal(response.status, 200);
    assert.equal(data.name, 'notes.md');
    assert.match(data.html, /<h1>Notes<\/h1>/);
    assert.match(data.html, /language-mermaid/);
    assert.equal((await fetch(target, { headers: { 'sec-fetch-site': 'cross-site' } })).status, 403);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
