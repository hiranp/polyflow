/**
 * strip-comments.mjs — strip comments and string literals from JS source,
 * preserving character positions (replaced with spaces) and newlines.
 *
 * Shared by validate-workflow.mjs, estimate-cost.mjs, and any future scripts
 * that need comment/string-blind source analysis.
 */

/**
 * Return a copy of `code` where every character inside comments and
 * string/template literals is replaced with a space (newlines preserved).
 * The output has the same `.length` as the input so that character indices
 * remain stable for line-number lookups.
 */
export function strip(code) {
  let out = ''
  let i = 0
  const n = code.length
  while (i < n) {
    const c = code[i]
    const d = code[i + 1]
    if (c === '/' && d === '/') {                    // line comment
      while (i < n && code[i] !== '\n') { out += ' '; i++ }
    } else if (c === '/' && d === '*') {             // block comment
      out += '  '; i += 2
      while (i < n && !(code[i] === '*' && code[i + 1] === '/')) {
        out += code[i] === '\n' ? '\n' : ' '; i++
      }
      out += '  '; i += 2
    } else if (c === '"' || c === "'" || c === '`') { // string / template
      const quote = c; out += ' '; i++
      while (i < n && code[i] !== quote) {
        if (code[i] === '\\') { out += '  '; i += 2; continue }
        out += code[i] === '\n' ? '\n' : ' '; i++
      }
      out += ' '; i++
    } else {
      out += c; i++
    }
  }
  return out
}
