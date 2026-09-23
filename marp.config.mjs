// Marp CLI config. Replaces highlight.js with Shiki, using VS Code's own light
// theme and TextMate grammars. highlight.js's Python grammar never tags calls,
// types or keyword arguments, so most of a model rendered as plain text.
import { createHighlighter } from 'shiki'

const THEME = 'light-plus'
const LANGS = ['python', 'json', 'console', 'toml', 'sql', 'yaml']

// VS Code gets type and call colours from the language server's semantic
// tokens, which a TextMate grammar can't see: `stars: StarRating` is one
// uncoloured run. Approximate them in Python's uncoloured text, by name shape.
const PLAIN = '#000000'
const TYPE = '#267F99' // light-plus entity.name.type
const CALL = '#795E26' // light-plus entity.name.function
const ENUM_MEMBER = '#0070C1' // light-plus variable.other.constant
const SIZED = /^u?int(8|16|32|64)$|^float(32|64)$/
const WORD = /[A-Za-z_][A-Za-z0-9_]*/g

function colourFor(word, before, after) {
  if (/^[A-Z][A-Z0-9_]+$/.test(word)) return before === '.' ? ENUM_MEMBER : PLAIN
  if (/^[A-Z]/.test(word) || SIZED.test(word)) return TYPE
  if (after === '(') return CALL
  return PLAIN
}

function splitPlain(token) {
  if (token.color !== PLAIN) return [token]
  const parts = []
  let last = 0
  for (const m of token.content.matchAll(WORD)) {
    const colour = colourFor(m[0], token.content[m.index - 1], token.content[m.index + m[0].length])
    if (colour === PLAIN) continue
    if (m.index > last) parts.push({ ...token, content: token.content.slice(last, m.index) })
    parts.push({ ...token, content: m[0], color: colour })
    last = m.index + m[0].length
  }
  if (last < token.content.length) parts.push({ ...token, content: token.content.slice(last) })
  return parts
}

const semanticGuess = {
  name: 'python-semantic-guess',
  tokens(lines) {
    if (this.options.lang !== 'python') return lines
    return lines.map((line) => line.flatMap(splitPlain))
  },
}

export default {
  themeSet: './themes',
  html: true,
  allowLocalFiles: true,
  engine: async ({ marp }) => {
    const shiki = await createHighlighter({ themes: [THEME], langs: LANGS })
    const loaded = new Set(shiki.getLoadedLanguages())
    marp.highlighter = (code, lang) =>
      shiki.codeToHtml(code, {
        lang: loaded.has(lang) ? lang : 'text',
        theme: THEME,
        transformers: [semanticGuess],
      })
    return marp
  },
}
