import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { svgToIcon } from './import-azure-icons.mjs';

const project = fileURLToPath(new URL('../', import.meta.url));
const sourceUrl = 'https://learn.microsoft.com/en-us/entra/architecture/architecture-icons';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

export async function importEntraIcon({ source, archive, terms, accepted, output = path.join(project, '.local/entra-icons') }) {
  if (!accepted) throw new Error('Read Microsoft’s Entra terms, then pass --accept-terms.');
  if (!source || !archive || !terms) throw new Error('Provide the extracted Entra folder, --archive original.zip, and --terms the original terms file.');
  const root = await fs.realpath(source);
  const files = [];
  async function walk(directory, relative = '') {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) continue;
      const name = path.posix.join(relative, entry.name);
      if (entry.isDirectory()) await walk(path.join(directory, entry.name), name);
      else if (entry.isFile()) files.push(name);
    }
  }
  await walk(root);
  const matches = files.filter(file => path.basename(file).toLowerCase() === 'microsoft entra id color icon.svg').sort();
  if (matches.length !== 1) throw new Error('Expected one official Microsoft Entra ID color icon.svg. Select the extracted Entra archive.');
  const original = matches[0];
  const bytes = await fs.readFile(path.join(root, original));
  const icon = svgToIcon(bytes.toString('utf8'));
  const archiveBytes = await fs.readFile(archive);
  const termsBytes = await fs.readFile(terms);
  if (!termsBytes.length) throw new Error('The terms file is empty.');
  const notices = files.filter(file => /terms|licen[sc]e|notice|copyright|playbook|branding/i.test(path.basename(file)));
  const manifest = { sourceUrl, importedAt: new Date().toISOString(), archive: { name: path.basename(archive), sha256: hash(archiveBytes) }, terms: { name: path.basename(terms), sha256: hash(termsBytes) }, alias: 'azure:entra-id', original, sha256: hash(bytes), notices };
  const writes = [
    ['entra-icons.json', JSON.stringify({ prefix: 'azure', icons: { 'entra-id': icon } }) + '\n'],
    ['SOURCE.json', JSON.stringify(manifest, null, 2) + '\n'],
    [`originals/${original}`, bytes],
    [`archive/${path.basename(archive)}`, archiveBytes],
    [`terms/${path.basename(terms)}`, termsBytes],
  ];
  for (const file of notices) writes.push([`notices/${file}`, await fs.readFile(path.join(root, file))]);
  await fs.mkdir(path.dirname(output), { recursive: true });
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
    console.log('npm run icons:import-entra -- "extracted-entra-folder" --archive "original.zip" --terms "Microsoft Terms of Use.docx" --accept-terms\nSee docs/azure-icons.md. Artwork and notices stay local and Git-ignored.');
    return;
  }
  const option = name => { const index = args.indexOf(name); return index < 0 ? undefined : args[index + 1]; };
  await importEntraIcon({ source: args[0], archive: option('--archive'), terms: option('--terms'), accepted: args.includes('--accept-terms') });
  console.log('Installed azure:entra-id locally with original artwork, archive, terms, branding playbook, and checksums. Restart the reader and refresh your browser.');
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main().catch(error => { console.error(error.message); process.exitCode = 1; });
