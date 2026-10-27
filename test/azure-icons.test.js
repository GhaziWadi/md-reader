import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { svgToIcon, importAzureIcons, iconName } from '../scripts/import-azure-icons.mjs';
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

test('uses explicit pixel dimensions when viewBox is absent without accepting ambiguous dimensions', () => {
  const source = '<svg width="18" height="24px"><path d="M0 0h18v24H0z"/></svg>';
  const icon = svgToIcon(source);
  assert.deepEqual([icon.left, icon.top, icon.width, icon.height], [0, 0, 18, 24]);
  assert.match(icon.body, /M0 0h18v24H0z/);
  for (const invalid of ['100%', '-18', '0', 'auto']) assert.throws(() => svgToIcon(source.replace('width="18"', `width="${invalid}"`)));
  assert.throws(() => svgToIcon(source.replace('<svg ', '<svg viewBox="invalid" ')));
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

test('imports official filenames, merges identical copies, and retains distinct artwork under stable names', async () => {
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
    const variants = await importAzureIcons({ ...options, output: path.join(temporary, 'conflicting') });
    assert.equal(variants.icons.length, 2);
    assert.ok(variants.icons.every(icon => /^azure:app-service-[a-f0-9]{12}$/.test(icon.alias)));
    assert.notEqual(variants.icons[0].alias, variants.icons[1].alias);
    assert.deepEqual(variants.missing.includes('app-service'), true);
  } finally {
    assert.equal(path.dirname(temporary), path.resolve(os.tmpdir()));
    await fs.rm(temporary, { recursive: true, force: true });
  }
});

test('derives readable names and preserves the seven existing aliases', () => {
  assert.equal(iconName('03438-icon-service-Azure-OpenAI.svg'), 'azure-openai');
  assert.equal(iconName('10035-App-Services.svg'), 'app-service');
  assert.equal(iconName('10023-icon-service-Kubernetes-Services.svg'), 'aks');
  assert.equal(iconName('00001-icon-service-New_Service (Preview).svg'), 'new-service-preview');
  assert.equal(iconName('Example & More.svg'), 'example-and-more');
});

test('imports arbitrary services recursively, writes a catalog, and reports unsafe files without blocking safe icons', async () => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'md-reader-full-icons-'));
  try {
    const source = path.join(temporary, 'source');
    await fs.mkdir(path.join(source, 'nested', 'category'), { recursive: true });
    await fs.writeFile(path.join(source, 'nested/category/123-icon-service-New_Service.svg'), sample);
    await fs.writeFile(path.join(source, '999-icon-service-Unsafe.svg'), sample.replace('<defs>', '<script>alert(1)</script><defs>'));
    const archive = path.join(temporary, 'fixture.zip');
    const terms = path.join(temporary, 'terms.txt');
    await fs.writeFile(archive, 'Synthetic fixture archive');
    await fs.writeFile(terms, 'Synthetic fixture terms');
    const output = path.join(temporary, 'output');
    const manifest = await importAzureIcons({ source, archive, terms, output, accepted: true });
    assert.equal(manifest.sourceSvgCount, 2);
    assert.equal(manifest.icons[0].alias, 'azure:new-service');
    assert.equal(manifest.skipped.length, 1);
    assert.match(manifest.skipped[0].reason, /script/);
    assert.match(await fs.readFile(path.join(output, 'CATALOG.md'), 'utf8'), /azure:new-service/);
    const pack = JSON.parse(await fs.readFile(path.join(output, 'azure-icons.json'), 'utf8'));
    assert.equal(Object.hasOwn(pack.icons, 'unsafe'), false);
  } finally {
    assert.equal(path.dirname(temporary), path.resolve(os.tmpdir()));
    await fs.rm(temporary, { recursive: true, force: true });
  }
});
