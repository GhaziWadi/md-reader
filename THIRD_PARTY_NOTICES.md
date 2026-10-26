# Third-party notices

The root MIT license covers original Markdown Reader code and documentation.
Third-party software and optional artwork retain their own licenses and notices.

## Installed software

See [licenses/dependencies/INDEX.md](licenses/dependencies/INDEX.md) for the
installed package versions, declared licenses, original license/notice files,
and notices found in distributed bundles. This includes transitive packages.
Marked's complete license file includes its additional Markdown notice.

After installing or updating dependencies, run `npm run licenses:generate` and
commit the generated changes with `package-lock.json`. Run
`npm run licenses:check` to verify the recorded files match the installation.
The inventory records evidence; it is not a legal compatibility determination.
Review any missing license files or additional terms before distributing a release.
Keep upstream comments and notices in the Mermaid files served to the browser.

Include `LICENSE`, this file, and the complete `licenses/` directory in releases.
If shipping installed dependencies, retain their license and notice files too.

## Optional Microsoft Azure icons

Microsoft Azure artwork is not included in the repository or covered by the
project's MIT license. The local importer requires separately downloaded icons,
an original archive, a terms file, and explicit acknowledgement of those terms.

Microsoft's published terms limit these icons to architecture diagrams,
training materials, and documentation. Preserve original colors and proportions;
do not crop, flip, rotate, distort, or use them as this application's branding.
See the [official source and current terms](https://learn.microsoft.com/en-us/azure/architecture/icons/).

Imported originals, their applicable terms and supplied notices, provenance,
checksums, and generated icon data live in ignored `.local/azure-icons/`.
Do not add that directory to an MIT-only source distribution. Users install
their own pack. If separately redistributing icons for a permitted use, include
their applicable terms and provenance and review the original archive's notices.
