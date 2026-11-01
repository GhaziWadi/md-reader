# Demo: Documentation as Code

This demo shows how the markdown reader makes it easy to maintain documentation as code, allowing you to quickly update and iterate on diagrams and documentation without external tools.

## What This Demo Shows

In this screen recording, we demonstrate:

1. **Local Development**: Running the project locally and accessing the markdown reader
2. **Live Editing**: Modifying a Mermaid diagram in a markdown file (specifically changing "Client apps" to "This is a demo:")
3. **Instant Updates**: The changes are immediately reflected in the browser without rebuilding or restarting
4. **Documentation as Code**: How treating your documentation like code gives you version control, review processes, and the ability to iterate quickly

## Key Benefits

- **No External Tools Required**: Edit diagrams directly in markdown, no need for drag-and-drop diagram tools
- **Version Control**: All changes to diagrams are tracked in Git with full history
- **Collaboration**: Use standard code review processes for documentation changes
- **Live Preview**: See changes instantly as you edit
- **Portable**: Everything is self-contained in markdown files

## Watch the Demo

<iframe width="1280" height="720" src="https://www.youtube.com/embed/pMPoWJm7qKk" title="MD Reader Demo - Documentation as Code" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen style="border-radius: 4px;"></iframe>

[Watch on YouTube](https://youtu.be/pMPoWJm7qKk)

## Getting Started

To run the project locally and see this in action:

```powershell
cd path/to/md-reader
npm install
npm start
```

Then open your browser to the URL shown in the terminal (typically `http://localhost:3000`).

Browse to any markdown file with Mermaid diagrams and start editing. Your changes will appear instantly in the browser as you save the file.

## Example: Updating a Diagram

1. Open a markdown file in your editor
2. Find a Mermaid diagram with text you want to change
3. Edit the markdown directly (e.g., change a label)
4. Save the file
5. Refresh your browser or let it auto-reload
6. The diagram is instantly updated with your changes

## Commit Your Documentation Changes

Since your documentation is now in Git, you can commit and push your diagram changes like any other code:

```powershell
git add docs/my-diagram.md
git commit -m "docs: update architecture diagram labels"
git push origin main
```

This approach treats documentation with the same rigor as your source code, ensuring it stays synchronized and maintainable throughout your project's lifecycle.
