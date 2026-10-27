let mermaidPromise;
let queue = Promise.resolve();
let revision = 0;
let diagramId = 0;
const sources = new WeakMap();
const zoomStates = new WeakMap();
let azurePack;

export function disposeDiagrams(root) {
  root.querySelectorAll('.mermaid-diagram').forEach(figure => zoomStates.get(figure)?.dispose());
}

function addZoomControls(figure, output) {
  const toolbar = document.createElement('div');
  toolbar.className = 'mermaid-zoom';
  toolbar.setAttribute('role', 'group');
  toolbar.setAttribute('aria-label', 'Diagram zoom controls');
  toolbar.hidden = true;
  const button = (text, label) => {
    const element = document.createElement('button');
    element.type = 'button';
    element.textContent = text;
    element.setAttribute('aria-label', label);
    element.title = label;
    return element;
  };
  const decrease = button('−', 'Zoom out');
  const increase = button('+', 'Zoom in');
  const reset = button('Reset', 'Reset diagram zoom');
  const level = document.createElement('output');
  level.setAttribute('aria-live', 'polite');
  level.setAttribute('aria-label', 'Diagram zoom level');
  toolbar.append(decrease, level, increase, reset);
  figure.prepend(toolbar);
  output.tabIndex = 0;
  output.setAttribute('role', 'region');
  output.setAttribute('aria-label', 'Diagram. Use plus or minus to zoom, zero to reset, and arrow keys to scroll.');
  let scale = 1;
  let previousWidth = 0;
  const apply = (keepCenter = false) => {
    const svg = output.querySelector(':scope > svg');
    if (!svg) { toolbar.hidden = true; return; }
    const naturalWidth = svg.viewBox.baseVal.width || svg.getBoundingClientRect().width;
    if (!naturalWidth || !output.clientWidth) return;
    const center = previousWidth ? (output.scrollLeft + output.clientWidth / 2) / previousWidth : 0.5;
    const width = Math.min(naturalWidth, output.clientWidth) * scale;
    svg.style.maxWidth = 'none';
    svg.style.width = `${width}px`;
    svg.style.height = 'auto';
    level.value = `${Math.round(scale * 100)}%`;
    decrease.disabled = scale <= 0.25;
    increase.disabled = scale >= 4;
    reset.disabled = scale === 1;
    toolbar.hidden = false;
    if (keepCenter) output.scrollLeft = center * width - output.clientWidth / 2;
    else { output.scrollLeft = 0; output.scrollTop = 0; }
    previousWidth = width;
  };
  const change = next => { scale = Math.max(0.25, Math.min(4, next)); apply(scale !== 1); };
  decrease.onclick = () => change(scale - 0.25);
  increase.onclick = () => change(scale + 0.25);
  reset.onclick = () => change(1);
  output.onkeydown = event => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (['+', '=', '-', '0'].includes(event.key)) {
      event.preventDefault();
      change(event.key === '0' ? 1 : scale + (event.key === '-' ? -0.25 : 0.25));
    }
  };
  // Observe only while connected; a removed document should retain no observers.
  const observer = new ResizeObserver(() => apply(true));
  const state = {
    refresh() { apply(true); observer.observe(output); },
    dispose() { observer.disconnect(); },
  };
  zoomStates.set(figure, state);
}

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
      addZoomControls(figure, output);
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
          for (const name of missing) if (!Object.hasOwn(azurePack.icons, name)) {
            if (name === 'entra-id') throw new Error('Azure icon "entra-id" is not installed. Use npm run icons:import-entra; see docs/azure-icons.md.');
            throw new Error(`Azure icon "${name}" is not installed. Check .local/azure-icons/SOURCE.json.`);
          }
        }
        const { svg } = await mermaid.render(`reader-diagram-${++diagramId}`, source);
        if (current !== revision || !figure.isConnected) return;
        figure.querySelector('.mermaid-output').innerHTML = svg;
        figure.querySelector('.mermaid-error').hidden = true;
        zoomStates.get(figure).refresh();
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
  zoomStates.get(figure)?.dispose();
  figure.querySelector('.mermaid-zoom').hidden = true;
  figure.querySelector('.mermaid-output').replaceChildren();
  const error = figure.querySelector('.mermaid-error');
  error.textContent = message;
  error.hidden = false;
  figure.querySelector('details').open = true;
}
