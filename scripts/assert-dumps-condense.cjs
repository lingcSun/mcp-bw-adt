/** Smoke assert for dumpsCondense (no Jest in this package). */
const { condenseDump } = require("../build/dumpsCondense.js")

const withHeader =
  '<h4 id="HEADERX">Header</h4><table><tr><td>Runtime Error</td><td>FOO</td></tr></table>'
const c = condenseDump(withHeader)
if (!c.header || c.header["Runtime Error"] !== "FOO") {
  console.error("FAIL: header parse", c)
  process.exit(1)
}

const plain = condenseDump("<p>no sections here</p>")
if (typeof plain.text !== "string" || !plain.text.includes("no sections")) {
  console.error("FAIL: fallback text", plain)
  process.exit(1)
}

console.log("assert-dumps-condense: ok")
