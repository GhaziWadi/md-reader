let mermaidPromise;
let queue = Promise.resolve();
let revision = 0;
let diagramId = 0;
const sources = new WeakMap();
let azurePack;

// Serialize Mermaid's global configuration and rendering across theme changes.
export function renderDiagrams(root, theme) {
  const current = ++revision;
  const blocks = [...root.querySelectorAll('pre > code.language-mermaid')].map(code => {
    const pre = code.parentElement;
    let figure = sources.get(pre);
    if (!figure) {
      figure = document.createElement('figure');
      figure.className = 'mermaid-diagram';
      const output = document.createElement('div');
      output.className = 'mermaid-output';
      output.setAttribute('role', 'img');
      output.setAttribute('aria-label', 'Mermaid diagram');
      const details = document.createElement('details');
      const summary = document.createElement('summary');
      summary.textContent = 'Diagram source';
      const error = document.createElement('p');
      error.className = 'mermaid-error';
      error.setAttribute('role', 'status');
      error.hidden = true;
      pre.replaceWith(figure);
      details.append(summary, pre);
      figure.append(output, error, details);
      sources.set(pre, figure);
    }
    return { figure, source: code.textContent };
  });
  const job = async () => {
    if (!blocks.length || current !== revision) return;
    let mermaid;
    try {
      mermaidPromise ||= import('/vendor/mermaid/mermaid.esm.min.mjs').catch(error => {
        mermaidPromise = undefined;
        throw error;
      });
      mermaid = (await mermaidPromise).default;
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'strict',
        theme: ['dark', 'ocean'].includes(theme) ? 'dark' : 'default',
        fontFamily: 'Segoe UI, system-ui, sans-serif',
        htmlLabels: false,
        flowchart: { htmlLabels: false },
        suppressErrorRendering: true,
        secure: ['secure', 'securityLevel', 'startOnLoad', 'maxTextSize', 'maxEdges', 'suppressErrorRendering'],
      });
    } catch {
      for (const { figure } of blocks) showFailure(figure, 'Mermaid could not load. The diagram source is shown below.');
      return;
    }
    for (const { figure, source } of blocks) {
      if (current !== revision || !figure.isConnected) return;
      try {
        if (/\bazure:/.test(source)) {
          if (!azurePack) {
            const response = await fetch('/api/icons/azure');
            if (!response.ok) throw new Error('Azure icons are not installed. Follow docs/azure-icons.md, then refresh this page.');
            const pack = await response.json();
            if (pack.prefix !== 'azure' || !pack.icons) throw new Error('The local Azure icon pack is invalid. Reimport it using docs/azure-icons.md.');
            mermaid.registerIconPacks([{ name: 'azure', icons: pack }]);
            azurePack = pack;
          }
          const missing = [...source.matchAll(/\bazure:([a-z0-9-]+)/g)].map(match => match[1]);
          // Mermaid otherwise draws a question mark for unavailable icons.
          for (const name of missing) if (!Object.hasOwn(azurePack.icons, name)) throw new Error(`Azure icon "${name}" is not installed. Check .local/azure-icons/SOURCE.json.`);
        }
        const { svg } = await mermaid.render(`reader-diagram-${++diagramId}`, source);
        if (current !== revision || !figure.isConnected) return;
        figure.querySelector('.mermaid-output').innerHTML = svg;
        figure.querySelector('.mermaid-error').hidden = true;
      } catch (error) {
        if (current !== revision || !figure.isConnected) return;
        showFailure(figure, /^Azure icon|^The local Azure/.test(error.message) ? error.message : 'This Mermaid diagram could not be rendered. Check its source below.');
      }
    }
  };
  queue = queue.then(job, job);
  return queue;
}

function showFailure(figure, message) {
  figure.querySelector('.mermaid-output').replaceChildren();
  const error = figure.querySelector('.mermaid-error');
  error.textContent = message;
  error.hidden = false;
  figure.querySelector('details').open = true;
}
