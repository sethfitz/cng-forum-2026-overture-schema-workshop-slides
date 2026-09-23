# Overture Schema Workshop slides — CNG Forum 2026

Slides for the Overture Schema workshop (Snowbird, Oct 6 2026), written in
[Marp](https://marp.app/) Markdown.

```console
brew install marp-cli    # or: npx @marp-team/marp-cli
npm ci                   # Shiki, for syntax highlighting (make does this too)
make serve               # live preview at http://localhost:8080
make html                # dist/index.html
make pdf                 # dist/slides.pdf
```

`slides.md` is the deck; `themes/overture.css` is its theme. `marp.config.mjs`
swaps Marp's highlight.js for Shiki, in VS Code's light theme, and colours Python
type and call names the way VS Code's language server does. Speaker notes are
HTML comments on each slide and appear in Marp's presenter view.

Every code sample and command output in the deck was run against the
`overture-schema` 2.0.0 packages on PyPI (Python 3.12).
