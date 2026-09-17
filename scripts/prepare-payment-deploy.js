const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const root = path.resolve(__dirname, '..')
const source = path.join(root, 'cloudfunctions', 'payment')
const outputRoot = path.join(root, '.deploy', 'cloudfunctions')
const functions = ['payment', 'payment-callback', 'payment-notify', 'payment-worker']
const files = [
  'domain.js', 'http-client.js', 'http.js', 'index.js', 'package.json',
  'provider.js', 'repository.js', 'worker-auth.js', 'worker-domain.js',
  'worker-repository.js', 'worker.js'
]

fs.mkdirSync(outputRoot, { recursive: true })
const manifest = {}
for (const name of functions) {
  const target = path.join(outputRoot, name)
  fs.mkdirSync(target, { recursive: true })
  manifest[name] = {}
  for (const file of files) {
    const from = path.join(source, file), to = path.join(target, file)
    if (!fs.existsSync(from)) throw new Error(`missing payment source: ${file}`)
    fs.copyFileSync(from, to)
    manifest[name][file] = crypto.createHash('sha256').update(fs.readFileSync(to)).digest('hex')
  }
}

const baseline = JSON.stringify(manifest.payment)
for (const name of functions.slice(1)) {
  if (JSON.stringify(manifest[name]) !== baseline) throw new Error(`deploy package mismatch: ${name}`)
}
process.stdout.write(`prepared ${functions.length} identical payment packages (${files.length} files each)\n`)
