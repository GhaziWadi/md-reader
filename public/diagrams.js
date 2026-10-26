let mermaidPromise;
let queue = Promise.resolve();
let revision = 0;
let diagramId = 0;
const sources = new WeakMap();

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
        const { svg } = await mermaid.render(`reader-diagram-${++diagramId}`, source);
        if (current !== revision || !figure.isConnected) return;
        figure.querySelector('.mermaid-output').innerHTML = svg;
        figure.querySelector('.mermaid-error').hidden = true;
      } catch {
        if (current !== revision || !figure.isConnected) return;
        showFailure(figure, 'This Mermaid diagram could not be rendered. Check its source below.');
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
