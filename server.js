import http from 'node:http';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';

const publicRoot = fileURLToPath(new URL('./public/', import.meta.url));
const isMarkdown = name => /\.(md|markdown|mdown)$/i.test(name);
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

export async function safePath(root, relative = '') {
  const candidate = await fs.realpath(path.resolve(root, relative));
  const difference = path.relative(root, candidate);
  if (difference === '..' || difference.startsWith(`..${path.sep}`) || path.isAbsolute(difference)) {
    throw Object.assign(new Error('This path is outside the selected folder.'), { status: 403 });
  }
  return candidate;
}

export function renderMarkdown(source, relative) {
  const html = marked.parse(source, { gfm: true, breaks: false });
  return sanitizeHtml(html, {
    allowedTags: [...sanitizeHtml.defaults.allowedTags, 'img', 'del', 'input', 'details', 'summary'],
    allowedAttributes: {
      ...sanitizeHtml.defaults.allowedAttributes,
      '*': ['id'],
      a: ['href', 'title'],
      img: ['src', 'alt', 'title', 'width', 'height', 'loading'],
      code: ['class'],
      input: ['type', 'checked', 'disabled'],
      th: ['align'], td: ['align'],
    },
    transformTags: {
      input: (_tag, attrs) => ({ tagName: 'input', attribs: { type: 'checkbox', disabled: '', ...(Object.hasOwn(attrs, 'checked') ? { checked: '' } : {}) } }),
      a: (_tag, attrs) => ({ tagName: 'a', attribs: { ...attrs, href: localUrl(attrs.href, relative) } }),
      img: (_tag, attrs) => ({ tagName: 'img', attribs: { ...attrs, src: localUrl(attrs.src, relative), loading: 'lazy' } }),
    },
  });
}

function localUrl(value, relative) {
  if (!value || /^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(value)) return value;
  const base = new URL(`http://local/files/${relative.split('/').map(encodeURIComponent).join('/')}`);
  return new URL(value, base).pathname + new URL(value, base).search + new URL(value, base).hash;
}

export async function createReader(directory) {
  const root = await fs.realpath(path.resolve(directory));
  if (!(await fs.stat(root)).isDirectory()) throw new Error('Choose a directory, not a file.');
  return http.createServer(async (req, res) => {
    const send = (status, body, type = 'application/json; charset=utf-8') => {
      res.writeHead(status, { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store', 'Content-Security-Policy': "default-src 'self'; img-src 'self' https: http:; style-src 'self'; script-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'" });
      res.end(type.startsWith('application/json') ? JSON.stringify(body) : body);
    };
    try {
      if (req.method !== 'GET') return send(405, { error: 'Only reading is supported.' });
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname === '/api/list') {
        const relative = url.searchParams.get('path') || '';
        const folder = await safePath(root, relative);
        const entries = (await fs.readdir(folder, { withFileTypes: true }))
          .filter(entry => entry.isDirectory() || (entry.isFile() && isMarkdown(entry.name)))
          .map(entry => ({ name: entry.name, directory: entry.isDirectory(), path: path.posix.join(relative.replaceAll('\\', '/'), entry.name) }))
          .sort((a, b) => Number(b.directory) - Number(a.directory) || a.name.localeCompare(b.name, undefined, { numeric: true }));
        return send(200, { root, name: path.basename(root), path: relative, entries });
      }
      if (url.pathname === '/api/read') {
        const relative = url.searchParams.get('path') || '';
        if (!isMarkdown(relative)) return send(400, { error: 'Choose a Markdown file.' });
        const file = await safePath(root, relative);
        const stat = await fs.stat(file);
        if (stat.size > 10 * 1024 * 1024) return send(413, { error: 'This file is larger than the 10 MB reading limit.' });
        const source = await fs.readFile(file, 'utf8');
        return send(200, { name: path.basename(file), path: relative, html: renderMarkdown(source, relative), modified: stat.mtime.toISOString() });
      }
      if (url.pathname.startsWith('/files/')) {
        const relative = decodeURIComponent(url.pathname.slice(7));
        const extension = path.extname(relative).toLowerCase();
        if (!['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico'].includes(extension)) return send(403, { error: 'Only image attachments can be served directly.' });
        return send(200, await fs.readFile(await safePath(root, relative)), mime[extension]);
      }
      const assets = { '/': 'index.html', '/app.js': 'app.js', '/style.css': 'style.css' };
      const asset = assets[url.pathname];
      if (!asset) return send(404, { error: 'Not found.' });
      send(200, await fs.readFile(path.join(publicRoot, asset)), mime[path.extname(asset)]);
    } catch (error) {
      send(error.status || (['ENOENT', 'ENOTDIR'].includes(error.code) ? 404 : 500), { error: error.status ? error.message : error.code === 'ENOENT' ? 'The file or folder no longer exists. Refresh the folder to update the list.' : 'Unable to read this file or folder.' });
    }
  });
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    console.log('Usage: npm start -- [directory] [--port 3000] [--no-open]\nDefaults to the current directory. Press Ctrl+C to stop.');
    return;
  }
  const portIndex = args.indexOf('--port');
  const port = portIndex < 0 ? 3000 : Number(args[portIndex + 1]);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Port must be between 0 and 65535.');
  const directory = args.find((arg, index) => !arg.startsWith('--') && (portIndex < 0 || index !== portIndex + 1)) || process.cwd();
  const server = await createReader(directory);
  server.on('error', error => { console.error(error.code === 'EADDRINUSE' ? `Port ${port} is busy. Try --port ${port + 1}.` : error.message); process.exitCode = 1; });
  server.listen(port, '127.0.0.1', () => {
    const url = `http://127.0.0.1:${server.address().port}`;
    console.log(`\nMarkdown Reader\nFolder: ${path.resolve(directory)}\nOpen:   ${url}\n\nPress Ctrl+C to stop.\n`);
    if (!args.includes('--no-open')) {
      const command = process.platform === 'win32' ? 'explorer.exe' : process.platform === 'darwin' ? 'open' : 'xdg-open';
      const child = spawn(command, [url], { detached: true, stdio: 'ignore', windowsHide: true });
      child.on('error', () => console.log(`Open ${url} in your browser.`));
      child.unref();
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
