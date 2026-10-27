import { renderDiagrams, disposeDiagrams } from './diagrams.js';

const $ = id => document.getElementById(id);
let folder = '', currentFile = '', entries = [], rootName = '';
let navigation = 0;
let currentRemoteUrl = '';
const storedTheme = localStorage.getItem('md-reader-theme');
const themes = [...$('theme').options].map(option => option.value);
const initialTheme = themes.includes(storedTheme) ? storedTheme : (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
document.documentElement.dataset.theme = initialTheme;
$('theme').value = initialTheme;

function showError(error) { $('message').textContent = error.message; $('message').hidden = false; }
async function api(endpoint, relative) {
  const response = await fetch(`/api/${endpoint}?${endpoint === 'remote' ? 'url' : 'path'}=${encodeURIComponent(relative)}`);
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
  else if (state.remote) {
    const remote = new URL(state.remote);
    if (remote.hash && !state.hash) state.hash = remote.hash;
    remote.hash = '';
    url.searchParams.set('url', remote.href);
  }
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
  const remote = params.get('url') || '';
  const nextFolder = remote ? folder : file ? file.split('/').slice(0, -1).join('/') : params.get('folder') || '';
  $('remote-open').disabled = !!remote;
  $('remote-open').textContent = remote ? 'Opening…' : 'Open';
  $('remote-url').value = remote;
  try {
    const [listing, documentData] = await Promise.all([api('list', nextFolder), remote ? api('remote', remote) : file ? api('read', file) : null]);
    if (request !== navigation) return;
    folder = nextFolder; currentFile = remote ? '' : file; currentRemoteUrl = documentData?.url || ''; entries = listing.entries; rootName = listing.name;
    $('root-name').textContent = rootName; $('root-path').textContent = listing.root; $('root-path').title = listing.root;
    $('search').value = ''; $('up').disabled = !folder;
    renderFiles(); breadcrumbs();
    if (remote) {
      const local = document.createElement('button');
      local.textContent = 'Local files'; local.onclick = () => navigate({ folder });
      const source = document.createElement('a');
      source.textContent = new URL(currentRemoteUrl).host;
      source.href = currentRemoteUrl; source.target = '_blank'; source.rel = 'noreferrer';
      source.title = currentRemoteUrl;
      $('breadcrumbs').replaceChildren(local, document.createTextNode(' / '), source);
    }
    $('welcome').hidden = !!documentData; $('document').hidden = !documentData;
    document.title = documentData ? `${documentData.name} · Markdown Reader` : 'Markdown Reader';
    if (documentData) {
      disposeDiagrams($('content'));
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
      $('modified').textContent = documentData.modified
        ? `Last updated ${new Date(documentData.modified).toLocaleString()}${remote ? ` · ${new URL(currentRemoteUrl).host}` : ''}`
        : 'Remote document · No modification date provided';
      await renderDiagrams($('content'), document.documentElement.dataset.theme);
      if (request !== navigation) return;
    }
    if (location.hash) {
      document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView();
    } else window.scrollTo(0, 0);
  } catch (error) { if (request === navigation) showError(error); }
  finally {
    if (request === navigation) { $('remote-open').disabled = false; $('remote-open').textContent = 'Open'; }
  }
}
$('remote-form').onsubmit = event => {
  event.preventDefault();
  try { navigate({ remote: $('remote-url').value.trim() }); } catch (error) { showError(error); }
};
$('search').oninput = renderFiles;
$('up').onclick = () => navigate({ folder: folder.split('/').slice(0, -1).join('/') });
$('refresh').onclick = load;
$('theme').onchange = () => {
  const theme = $('theme').value;
  document.documentElement.dataset.theme = theme; localStorage.setItem('md-reader-theme', theme);
  renderDiagrams($('content'), theme);
};
$('print').onclick = () => window.print();
$('content').onclick = event => {
  const link = event.target.closest('a');
  if (!link || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
  const url = new URL(link.href, location.href);
  if (['http:', 'https:'].includes(url.protocol)) {
    const target = new URL(url); target.hash = '';
    if (currentRemoteUrl && target.href === currentRemoteUrl && url.hash) {
      event.preventDefault(); location.hash = url.hash; return;
    }
    if (url.origin !== location.origin && (/\.(md|markdown|mdown)$/i.test(url.pathname) || url.hostname === 'github.com' && url.pathname.includes('/blob/'))) {
      event.preventDefault(); navigate({ remote: url.href }); return;
    }
  }
  if (url.origin === location.origin && url.pathname.startsWith('/files/') && /\.(md|markdown|mdown)$/i.test(url.pathname)) {
    event.preventDefault(); navigate({ file: decodeURIComponent(url.pathname.slice(7)), hash: url.hash });
  }
};
window.onpopstate = load;
load();
