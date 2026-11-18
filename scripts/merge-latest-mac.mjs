// Two runners (arm64, x64) each write a latest-mac.yml listing only their own files. The updater reads one,
// so join them: node scripts/merge-latest-mac.mjs a/latest-mac.yml b/latest-mac.yml > latest-mac.yml
import { readFileSync } from 'node:fs'
import process from 'node:process'
import { dump, load } from 'js-yaml'

const docs = process.argv.slice(2).map((f) => load(readFileSync(f, 'utf8')))
if (docs.length < 2 || new Set(docs.map((d) => d.version)).size !== 1) {
  process.stderr.write('need two latest-mac.yml files of the same version\n')
  process.exit(1)
}
const [first] = docs
first.files = docs.flatMap((d) => d.files)
process.stdout.write(dump(first, { lineWidth: -1 }))
