import { renderDiagrams } from './diagrams.js';

const $ = id => document.getElementById(id);
let folder = '', currentFile = '', entries = [], rootName = '';
let navigation = 0;
const storedTheme = localStorage.getItem('md-reader-theme');
document.documentElement.dataset.theme = storedTheme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

function showError(error) { $('message').textContent = error.message; $('message').hidden = false; }
async function api(endpoint, relative) {
  const response = await fetch(`/api/${endpoint}?path=${encodeURIComponent(relative)}`);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error);
  return data;
}
function renderFiles() {
  const filtered = entries.filter(entry => entry.name.toLowerCase().includes($('search').value.toLowerCase()));
  $('files').replaceChildren();
  for (const entry of filtered) {
    const button = document.createElement('button');
    button.className = `file-row ${entry.directory ? 'folder' : ''} ${entry.path === currentFile ? 'active' : ''}`;
    const icon = document.createElement('span'); icon.className = 'file-icon'; icon.textContent = entry.directory ? '▸' : 'M↓';
    const name = document.createElement('span'); name.textContent = entry.name;
    button.append(icon, name); button.title = entry.name;
    if (entry.path === currentFile) button.setAttribute('aria-current', 'page');
    button.onclick = () => navigate(entry.directory ? { folder: entry.path } : { file: entry.path });
    $('files').append(button);
  }
  if (!filtered.length) {
    const p = document.createElement('p'); p.className = 'empty';
    p.textContent = $('search').value ? 'No matching files or folders.' : 'No Markdown files or subfolders here.';
    $('files').append(p);
  }
}
function breadcrumbs() {
  $('breadcrumbs').replaceChildren();
  const parts = folder.split('/').filter(Boolean);
  [rootName, ...parts].forEach((part, index) => {
    const button = document.createElement('button'); button.textContent = part;
    button.onclick = () => navigate({ folder: parts.slice(0, index).join('/') });
    if (index) $('breadcrumbs').append(document.createTextNode(' / '));
    $('breadcrumbs').append(button);
  });
}
function navigate(state, replace = false) {
  const url = new URL(location.href); url.search = '';
  if (state.file) url.searchParams.set('file', state.file);
  else if (state.folder) url.searchParams.set('folder', state.folder);
  url.hash = state.hash || '';
  history[replace ? 'replaceState' : 'pushState']({}, '', url);
  load();
}
async function load() {
  const request = ++navigation;
  $('message').hidden = true;
  const params = new URLSearchParams(location.search);
  const file = params.get('file') || '';
  const nextFolder = file ? file.split('/').slice(0, -1).join('/') : params.get('folder') || '';
  try {
    const [listing, documentData] = await Promise.all([api('list', nextFolder), file ? api('read', file) : null]);
    if (request !== navigation) return;
    folder = nextFolder; currentFile = file; entries = listing.entries; rootName = listing.name;
    $('root-name').textContent = rootName; $('root-path').textContent = listing.root; $('root-path').title = listing.root;
    $('search').value = ''; $('up').disabled = !folder;
    renderFiles(); breadcrumbs();
    $('welcome').hidden = !!file; $('document').hidden = !file;
    document.title = file ? `${documentData.name} · Markdown Reader` : 'Markdown Reader';
    if (documentData) {
      $('content').innerHTML = documentData.html;
      // Give headings stable anchors for local Markdown links.
      const ids = new Map();
      $('content').querySelectorAll('h1,h2,h3,h4,h5,h6').forEach(heading => {
        if (heading.id) return;
        const slug = heading.textContent.toLowerCase().replace(/[^\p{L}\p{N}_\s-]/gu, '').trim().replace(/\s/g, '-');
        const count = ids.get(slug) || 0; ids.set(slug, count + 1); heading.id = slug + (count ? `-${count}` : '');
      });
      $('file-label').textContent = documentData.name;
      $('read-time').textContent = `${Math.max(1, Math.ceil($('content').textContent.split(/\s+/).length / 220))} min read`;
      $('modified').textContent = `Last updated ${new Date(documentData.modified).toLocaleString()}`;
      await renderDiagrams($('content'), document.documentElement.dataset.theme);
      if (request !== navigation) return;
    }
    if (location.hash) {
      document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView();
    } else window.scrollTo(0, 0);
  } catch (error) { if (request === navigation) showError(error); }
}
$('search').oninput = renderFiles;
$('up').onclick = () => navigate({ folder: folder.split('/').slice(0, -1).join('/') });
$('refresh').onclick = load;
$('theme').onclick = () => {
  const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = theme; localStorage.setItem('md-reader-theme', theme);
  renderDiagrams($('content'), theme);
};
$('print').onclick = () => window.print();
$('content').onclick = event => {
  const link = event.target.closest('a');
  if (!link || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
  const url = new URL(link.href, location.href);
  if (url.origin === location.origin && url.pathname.startsWith('/files/') && /\.(md|markdown|mdown)$/i.test(url.pathname)) {
    event.preventDefault(); navigate({ file: decodeURIComponent(url.pathname.slice(7)), hash: url.hash });
  }
};
window.onpopstate = load;
load();
