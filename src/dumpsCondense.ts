/** Condensed ST22 dump sections for LLM-sized responses. */

/** Strip HTML tags, decode entities and collapse whitespace to plain text. */
export function textOf(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/[\s\u00A0]+/g, " ")
    .trim()
}

/**
 * Split the dump body into its sections by <h4 id="XXX"> markers
 * (OVERVIEW/HEADERX/ERROR/TERMINATION/SOURCE/STACK/...).
 */
export function splitSections(html: string): Map<string, string> {
  const sections = new Map<string, string>()
  const re = /<h4[^>]*\bid="([A-Z_]+)"[^>]*>[\s\S]*?<\/h4>/gi
  const marks: { id: string; contentStart: number }[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(html)))
    marks.push({ id: m[1], contentStart: m.index + m[0].length })
  for (let k = 0; k < marks.length; k++) {
    const end =
      k + 1 < marks.length ? marks[k + 1].contentStart : html.length
    sections.set(marks[k].id, html.slice(marks[k].contentStart, end))
  }
  return sections
}

/**
 * Extract troubleshooting-relevant parts of a dump HTML body.
 * Falls back to truncated plain text when section layout is unexpected.
 */
export function condenseDump(html: string): Record<string, unknown> {
  if (!html) return {}
  const sections = splitSections(html)
  if (sections.size === 0)
    return { text: textOf(html).slice(0, 4000) }

  const tds = (s: string) =>
    (s.match(/<td[^>]*>[\s\S]*?<\/td>/gi) || []).map((td) => textOf(td))

  const header: Record<string, string> = {}
  const htds = tds(sections.get("HEADERX") || "")
  for (let k = 0; k + 1 < htds.length; k += 2)
    header[htds[k].replace(/[\s\u00A0]+$/, "")] = htds[k + 1]

  let source: Record<string, unknown> | undefined
  const srcHtml = (sections.get("SOURCE") || "").replace(
    /<style[\s\S]*?<\/style>/gi,
    ""
  )
  const stds = tds(srcHtml)
  if (stds.length) {
    const tokens: string[] = stds[0].match(/\d{1,4}|>>/g) || []
    const at = tokens.indexOf(">>")
    const next =
      at >= 0 && tokens[at + 1] ? Number(tokens[at + 1]) : undefined
    const prev = at > 0 ? Number(tokens[at - 1]) : undefined
    const crashLine =
      next ?? (prev !== undefined && !isNaN(prev) ? prev + 1 : undefined)
    const code = stds
      .slice(1)
      .join(" ")
      .replace(/[\s\u00A0]{2,}/g, " ")
      .trim()
      .slice(0, 1500)
    source = { crashLine, code }
  }

  const callStack = ((sections.get("STACK") || "").match(
    /<tr[^>]*>[\s\S]*?<\/tr>/gi
  ) || [])
    .map((tr) => tds(tr))
    .filter((cells) => cells.length >= 5)
    .slice(0, 15)
    .map((c) => `${c[0]} ${c[1]} ${c[2]} ${c[3]}:${c[4]}`)

  const cap = (s: string | undefined, n: number) =>
    s ? textOf(s).slice(0, n) : undefined

  return {
    header,
    whereTerminated: cap(sections.get("TERMINATION"), 800),
    errorAnalysis: cap(sections.get("ERROR"), 1000),
    source,
    callStack,
  }
}
