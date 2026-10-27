import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { svgToIcon, importAzureIcons } from '../scripts/import-azure-icons.mjs';
import { createReader } from '../server.js';

// Original test artwork, not a Microsoft icon.
const sample = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="2 3 24 18" fill="#0078d4"><defs><linearGradient id="a"><stop stop-color="#fff"/></linearGradient></defs><rect x="2" y="3" width="24" height="18" fill="url(#a)"/></svg>';

test('SVG conversion preserves coordinates, root styling, and gradients', () => {
  const icon = svgToIcon(sample);
  assert.deepEqual([icon.left, icon.top, icon.width, icon.height], [2, 3, 24, 18]);
  assert.match(icon.body, /fill="#0078d4"/);
  assert.match(icon.body, /linearGradient/);
  assert.match(icon.body, /url\(#a\)/);
  assert.doesNotThrow(() => svgToIcon(sample.replace('url(#a)', "url(&quot;#a&quot;)")));
});

test('SVG conversion rejects active or external content and invalid coordinates', () => {
  for (const bad of [
    sample.replace('<defs>', '<script>alert(1)</script><defs>'),
    sample.replace('<rect ', '<rect onclick="alert(1)" '),
    sample.replace('url(#a)', 'url(https://example.com/a)'),
    sample.replace('<defs>', '<use href="https://example.com/a"/><defs>'),
    sample.replace('24 18', '-1 18'),
  ]) assert.throws(() => svgToIcon(bad));
});

test('optional import preserves originals, terms and provenance and serves only the pack', async () => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'md-reader-icons-'));
  let server;
  try {
    const source = path.join(temporary, 'source');
    await fs.mkdir(source);
    await fs.writeFile(path.join(source, '10035-App-Services.svg'), sample);
    await fs.writeFile(path.join(source, 'NOTICE.txt'), 'Synthetic fixture notice');
    const archive = path.join(temporary, 'fixture.zip');
    const terms = path.join(temporary, 'terms.txt');
    await fs.writeFile(archive, 'Synthetic archive bytes for provenance test');
    await fs.writeFile(terms, 'Synthetic fixture terms');
    const output = path.join(temporary, 'imported');
    await assert.rejects(importAzureIcons({ source, archive, terms, output }), /accept-terms/);
    const manifest = await importAzureIcons({ source, archive, terms, output, accepted: true });
    assert.equal(manifest.icons[0].alias, 'azure:app-service');
    assert.match(manifest.archive.sha256, /^[a-f0-9]{64}$/);
    assert.equal(await fs.readFile(path.join(output, 'originals/10035-App-Services.svg'), 'utf8'), sample);
    assert.equal(await fs.readFile(path.join(output, 'TERMS.txt'), 'utf8'), 'Synthetic fixture terms');
    assert.equal(await fs.readFile(path.join(output, 'notices/NOTICE.txt'), 'utf8'), 'Synthetic fixture notice');
    await assert.rejects(importAzureIcons({ source, archive, terms, output, accepted: true }), /EEXIST/);
    server = await createReader(source, { iconPack: path.join(output, 'azure-icons.json') });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const pack = await (await fetch(`${base}/api/icons/azure`)).json();
    assert.equal(pack.prefix, 'azure');
    assert.equal(pack.icons['app-service'].body, svgToIcon(sample).body);
    assert.equal((await fetch(`${base}/.local/azure-icons/TERMS.txt`)).status, 404);
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    assert.equal(path.dirname(temporary), path.resolve(os.tmpdir()));
    await fs.rm(temporary, { recursive: true, force: true });
  }
});

test('an absent optional pack returns an actionable message', async () => {
  const server = await createReader(process.cwd(), { iconPack: path.join(os.tmpdir(), 'md-reader-pack-that-does-not-exist.json') });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/icons/azure`);
    assert.equal(response.status, 404);
    assert.match((await response.json()).error, /docs\/azure-icons.md/);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('imports official filename prefixes and identical category copies but rejects conflicting artwork', async () => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'md-reader-icon-names-'));
  try {
    const source = path.join(temporary, 'source');
    await fs.mkdir(path.join(source, 'compute'), { recursive: true });
    await fs.mkdir(path.join(source, 'web'));
    const filename = '10035-icon-service-App-Services.svg';
    await fs.writeFile(path.join(source, 'compute', filename), sample);
    await fs.writeFile(path.join(source, 'web', filename), sample);
    const archive = path.join(temporary, 'fixture.zip');
    const terms = path.join(temporary, 'terms.txt');
    await fs.writeFile(archive, 'Synthetic archive bytes');
    await fs.writeFile(terms, 'Synthetic fixture terms');
    const options = { source, archive, terms, accepted: true, output: path.join(temporary, 'output') };
    const manifest = await importAzureIcons(options);
    assert.equal(manifest.icons.length, 1);
    assert.equal(manifest.icons[0].alias, 'azure:app-service');
    assert.equal(manifest.icons[0].original, `compute/${filename}`);
    assert.deepEqual(manifest.icons[0].identicalCopies, [`web/${filename}`]);
    await fs.writeFile(path.join(source, 'web', filename), sample.replace('#0078d4', '#ff0000'));
    await assert.rejects(importAzureIcons({ ...options, output: path.join(temporary, 'conflicting') }), /different artwork/);
    assert.equal(await fs.stat(path.join(temporary, 'conflicting')).catch(() => null), null);
  } finally {
    assert.equal(path.dirname(temporary), path.resolve(os.tmpdir()));
    await fs.rm(temporary, { recursive: true, force: true });
  }
});
