import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseDocument } from 'htmlparser2';
import serialize from 'dom-serializer';

const project = fileURLToPath(new URL('../', import.meta.url));
const officialSource = 'https://learn.microsoft.com/en-us/azure/architecture/icons/';
const selections = {
  'app-service': ['app-services', 'app-service'],
  functions: ['function-apps', 'functions'],
  aks: ['kubernetes-services', 'azure-kubernetes-service'],
  storage: ['storage-accounts'],
  'sql-database': ['sql-database', 'sql-databases'],
  'key-vault': ['key-vaults', 'key-vault'],
  'azure-openai': ['azure-openai', 'azure-openai-service'],
};
const sha256 = data => createHash('sha256').update(data).digest('hex');

export function iconName(filename) {
  const name = path.basename(filename).replace(/^\d+-(?:icon-service-)?/i, '').replace(/\.svg$/i, '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/&/g, '-and-').replace(/\+/g, '-plus-').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (!name) throw new Error(`Cannot derive an icon name from ${filename}`);
  return Object.entries(selections).find(([alias, names]) => alias === name || names.includes(name))?.[0] || name;
}

export function svgToIcon(source) {
  if (/<!DOCTYPE|<!ENTITY/i.test(source)) throw new Error('SVG entities and document types are unsupported.');
  const document = parseDocument(source, { xmlMode: true, decodeEntities: true });
  const elements = document.children.filter(node => node.type === 'tag');
  if (elements.length !== 1 || elements[0].name !== 'svg') throw new Error('Expected one SVG root.');
  const svg = elements[0];
  const externalCss = value => /@import|javascript:/i.test(value) || [...value.matchAll(/url\(([^)]*)\)/gi)].some(match => !match[1].trim().replace(/^["']|["']$/g, '').startsWith('#'));
  const dimension = value => typeof value === 'string' && /^(?:\d+(?:\.\d*)?|\.\d+)(?:px)?$/i.test(value.trim()) ? Number.parseFloat(value) : NaN;
  // SVGs without viewBox use their explicit pixel viewport as coordinates.
  const viewBox = svg.attribs.viewBox === undefined
    ? [0, 0, dimension(svg.attribs.width), dimension(svg.attribs.height)]
    : svg.attribs.viewBox.trim().split(/[\s,]+/).map(Number);
  if (viewBox.length !== 4 || !viewBox.every(Number.isFinite) || viewBox[2] <= 0 || viewBox[3] <= 0) throw new Error('SVG must have a valid viewBox or explicit positive pixel width and height.');
  function validate(node) {
    if (node.name && !['svg', 'g', 'path', 'rect', 'circle', 'ellipse', 'polygon', 'polyline', 'line', 'defs', 'linearGradient', 'radialGradient', 'stop', 'clipPath', 'mask', 'title', 'desc', 'use', 'style'].includes(node.name)) throw new Error(`Unsupported SVG element: ${node.name}`);
    for (const [key, value] of Object.entries(node.attribs || {})) {
      if (/^on/i.test(key) || /(?:href|src)$/i.test(key) && !value.startsWith('#')) throw new Error('Active or external SVG content is unsupported.');
      if (externalCss(value)) throw new Error('External SVG styles are unsupported.');
    }
    if (node.name === 'style') {
      const css = node.children.map(child => child.data || '').join('');
      if (externalCss(css)) throw new Error('External SVG styles are unsupported.');
    }
    for (const child of node.children || []) validate(child);
  }
  validate(svg);
  // Retain root styling, original coordinates, gradients, and aspect ratio.
  const attributes = { ...svg.attribs };
  for (const name of ['xmlns', 'xmlns:xlink', 'viewBox', 'width', 'height', 'x', 'y']) delete attributes[name];
  const wrapper = { ...svg, name: 'g', attribs: attributes };
  return { body: serialize(wrapper, { xmlMode: true }), left: viewBox[0], top: viewBox[1], width: viewBox[2], height: viewBox[3] };
}

export async function importAzureIcons({ source, archive, terms, accepted, output = path.join(project, '.local/azure-icons') }) {
  if (!accepted) throw new Error('Read Microsoft’s and the archive’s terms, then pass --accept-terms to acknowledge them.');
  if (!source || !archive || !terms) throw new Error('Provide the extracted folder, --archive original.zip, and --terms terms.txt.');
  const sourceRoot = await fs.realpath(source);
  const archiveBytes = await fs.readFile(archive);
  const termsBytes = await fs.readFile(terms);
  if (!termsBytes.toString('utf8').trim()) throw new Error('The terms file must not be empty.');
  const files = [];
  async function walk(directory, relative = '') {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) continue;
      const rel = path.posix.join(relative, entry.name);
      if (entry.isDirectory()) await walk(path.join(directory, entry.name), rel);
      else if (entry.isFile()) files.push(rel);
    }
  }
  await walk(sourceRoot);
  const icons = {}, originals = [], writes = [], skipped = [], groups = new Map();
  const svgFiles = files.filter(file => /\.svg$/i.test(file)).sort();
  for (const file of svgFiles) {
    const name = iconName(file);
    const bytes = await fs.readFile(path.join(sourceRoot, file));
    const hash = sha256(bytes);
    if (!groups.has(name)) groups.set(name, new Map());
    const variants = groups.get(name);
    if (!variants.has(hash)) variants.set(hash, { bytes, paths: [] });
    variants.get(hash).paths.push(file);
  }
  for (const [name, variants] of [...groups].sort(([a], [b]) => a.localeCompare(b))) {
    for (const [hash, { bytes, paths }] of variants) {
      // Distinct artwork with the same normalized name gets stable hash suffixes.
      const alias = variants.size === 1 ? name : `${name}-${hash.slice(0, 12)}`;
      const original = paths[0];
      try { icons[alias] = svgToIcon(bytes.toString('utf8')); }
      catch (error) {
        skipped.push({ original, identicalCopies: paths.slice(1), sha256: hash, reason: error.message });
        continue;
      }
      originals.push({ alias: `azure:${alias}`, original, identicalCopies: paths.slice(1), sha256: hash });
      writes.push([`originals/${original}`, bytes]);
    }
  }
  if (!originals.length) throw new Error('No supported Azure SVG filenames found. Point to the extracted official archive.');
  const suppliedNotices = files.filter(file => /^(?:licen[sc]e|notice|copying|copyright|terms)(?:[._ -]|$)/i.test(path.basename(file)));
  for (const file of suppliedNotices) writes.push([`notices/${file}`, await fs.readFile(path.join(sourceRoot, file))]);
  const missing = Object.keys(selections).filter(alias => !Object.hasOwn(icons, alias));
  const manifest = { sourceUrl: officialSource, importedAt: new Date().toISOString(), archive: { name: path.basename(archive), sha256: sha256(archiveBytes) }, terms: { name: path.basename(terms), sha256: sha256(termsBytes) }, sourceSvgCount: svgFiles.length, icons: originals, suppliedNotices, missing, skipped };
  const catalog = ['# Installed Azure icons', '', `Imported ${originals.length} unique icons from ${svgFiles.length} SVG files.`, '', 'Use the exact alias below in Mermaid icon nodes or architecture services.', '', '| Alias | Original file | Identical copies |', '| --- | --- | --- |', ...originals.map(icon => `| \`${icon.alias}\` | ${icon.original.replaceAll('|', '\\|')} | ${icon.identicalCopies.length} |`), '', '## Skipped SVGs', '', ...skipped.map(icon => `- ${icon.original}: ${icon.reason}`), ''].join('\n');
  writes.push(['CATALOG.md', catalog]);
  writes.push(['TERMS.txt', termsBytes], ['SOURCE.json', JSON.stringify(manifest, null, 2) + '\n'], ['azure-icons.json', JSON.stringify({ prefix: 'azure', icons }) + '\n']);
  // A complete new pack is required; never mix notices from different archives.
  await fs.mkdir(output, { recursive: false });
  for (const [relative, data] of writes) {
    const target = path.join(output, relative);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, data);
  }
  return manifest;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    console.log('npm run icons:import -- "extracted-folder" --archive "original.zip" --terms "terms.txt" --accept-terms\nRead docs/azure-icons.md first. No download or license acceptance is automatic.');
    return;
  }
  const option = name => { const index = args.indexOf(name); return index < 0 ? undefined : args[index + 1]; };
  await fs.mkdir(path.join(project, '.local'), { recursive: true });
  const manifest = await importAzureIcons({ source: args[0], archive: option('--archive'), terms: option('--terms'), accepted: args.includes('--accept-terms') });
  console.log(`Imported ${manifest.icons.length} Azure icons locally. Restart the reader and refresh your browser.`);
  console.log(`Scanned ${manifest.sourceSvgCount} SVG files, including subfolders. Alias catalog: .local/azure-icons/CATALOG.md`);
  if (manifest.skipped.length) console.warn(`Skipped ${manifest.skipped.length} unsupported or unsafe SVG variants. See SOURCE.json for filenames and reasons.`);
  if (manifest.missing.length) console.warn(`Not present in this archive: ${manifest.missing.join(', ')}`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main().catch(error => { console.error(error.message); process.exitCode = 1; });
