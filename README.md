# Markdown Reader

A local, read-only Markdown browser. Point it at a directory to browse Markdown files and subfolders, then click a file to read it as a formatted page in your default browser.

## Start

Requires Node.js 20 or newer.

```powershell
npm install
npm start -- "C:\path\to\your\notes"
```

On Windows, you can also double-click `start-reader.cmd` and enter a directory, or drag a folder onto it. The first run installs dependencies. Paste the folder path without surrounding quotes at the prompt.

The app opens **http://127.0.0.1:3000** in your default browser. Leave the terminal running; press **Ctrl+C** to stop it. To browse a different root folder, restart with its path. Omit the directory to browse the current working directory.

```powershell
# Choose a different port, or disable automatic browser opening
npm start -- "C:\path\to\notes" --port 3001 --no-open
```

## Features

- Browse subfolders with breadcrumbs and an Up button.
- Read `.md`, `.markdown`, and `.mdown` files with headings, tables, code blocks, task lists, and quotes.
- Follow relative Markdown links and display relative image attachments within the selected root.
- Filter the current folder, refresh changed files, use browser Back/Forward, and bookmark document URLs.
- Switch between light and dark themes and print readable documents.

The server listens only on your computer's loopback address. Files are never edited or uploaded. Markdown HTML is sanitized, and paths (including symbolic links) cannot escape the selected root. Remote images referenced in your Markdown may be loaded by your browser. Hidden folders are included; symlinks are omitted from listings. Only Markdown files and folders appear in the sidebar. Documents larger than 10 MB are rejected. Mermaid diagrams and executable Markdown extensions are not processed.

## Verify

```powershell
npm test
```
