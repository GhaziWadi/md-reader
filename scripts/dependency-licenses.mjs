import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const project = fileURLToPath(new URL('../', import.meta.url));
const destination = path.join(project, 'licenses/dependencies');
const lock = JSON.parse(await fs.readFile(path.join(project, 'package-lock.json'), 'utf8'));
const outputs = new Map();
const lines = ['# Installed dependency notices', '', 'Generated from package-lock.json and installed package files. Do not edit by hand.', '', '| Package | Version | Declared license | Notices |', '| --- | --- | --- | --- |'];
const warnings = [];
for (const [location, locked] of Object.entries(lock.packages).sort(([a], [b]) => a.localeCompare(b))) {
  if (!location || locked.link) continue;
  const directory = path.join(project, location);
  const pkg = JSON.parse(await fs.readFile(path.join(directory, 'package.json'), 'utf8'));
  if (pkg.version !== locked.version) throw new Error(`Run npm ci: ${location} does not match the lockfile.`);
  const folder = `${pkg.name.replaceAll('/', '__')}@${pkg.version}`;
  const notices = [];
  async function collect(current, relative = '', depth = 0) {
    for (const entry of (await fs.readdir(current, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name === 'node_modules' || entry.isSymbolicLink()) continue;
      const rel = path.posix.join(relative, entry.name);
      if (entry.isDirectory() && depth < 6) await collect(path.join(current, entry.name), rel, depth + 1);
      else if (entry.isFile() && ( /^(licen[sc]e|copying|notice|copyright)(?:[._-]|$)/i.test(entry.name) || /\.licen[sc]e(?:\.txt)?$/i.test(entry.name))) {
        const target = `${folder}/${rel}`;
        outputs.set(target, await fs.readFile(path.join(current, entry.name)));
        notices.push(`[${rel}](${encodeURI(target)})`);
      }
    }
  }
  await collect(directory);
  if (!notices.length) warnings.push(`${pkg.name}@${pkg.version}: no standalone notice found; inspect upstream sources before redistribution.`);
  const license = typeof pkg.license === 'string' ? pkg.license : JSON.stringify(pkg.license || pkg.licenses || 'UNDECLARED');
  lines.push(`| ${pkg.name} | ${pkg.version} | ${license.replaceAll('|', '\\|')} | ${notices.join(', ') || 'REVIEW REQUIRED'} |`);
}
lines.push('', '## Review notes', '', ...(warnings.length ? warnings.map(warning => `- ${warning}`) : ['All installed packages have at least one standalone license/notice file.']), '', 'Declared license identifiers do not replace the full texts. Preserve notices embedded in distributed JavaScript as well.', 'This inventory does not certify license compatibility or cover optional user-installed Azure artwork.', '');
outputs.set('INDEX.md', Buffer.from(lines.join('\n')));

if (process.argv.includes('--check')) {
  const actual = await fs.readdir(destination, { recursive: true });
  for (const [name, expected] of outputs) {
    const data = await fs.readFile(path.join(destination, name)).catch(() => null);
    if (!data?.equals(expected)) throw new Error(`Outdated notices: ${name}. Run npm run licenses:generate.`);
  }
  for (const name of actual) {
    if ((await fs.stat(path.join(destination, name))).isFile() && !outputs.has(name.replaceAll('\\', '/'))) throw new Error(`Stale notice: ${name}. Run npm run licenses:generate.`);
  }
  console.log('Dependency license inventory matches the installed lockfile.');
} else {
  // Remove only this script's generated directory inside the project.
  if (path.relative(project, destination) !== path.join('licenses', 'dependencies')) throw new Error('Unexpected output path.');
  await fs.rm(destination, { recursive: true, force: true });
  for (const [name, data] of outputs) {
    const target = path.join(destination, name);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, data);
  }
  console.log(`Recorded ${Object.keys(lock.packages).length - 1} packages and ${outputs.size - 1} notice files.`);
}
for (const warning of warnings) console.warn(warning);
