const path = require('path')
const esbuild = require('esbuild')

const dev = /^dev/i.test(process.env.NODE_ENV)

const base = {
  entryPoints: {
    komposer: './src/scripts/main.ts',
  },
  outExtension: { '.js': '.bun.js' },
  bundle: true,
  target: ['esnext'],
  minifyWhitespace: !dev,
  minifyIdentifiers: !dev,
  minifySyntax: !dev,
  sourcemap: true,
}

const mv2 = { ...base, outdir: './build/bundled' }
const mv3 = { ...base, outdir: './build-v3/bundled' }

module.exports = { mv2, mv3 }

async function main() {
  await Promise.all([
    esbuild.build(mv2).then(result => {
      console.log('<esbuild> mv2 build')
    }),
    esbuild.build(mv3).then(result => {
      console.log('<esbuild> mv3 build')
    }),
  ])
}

if (require.main == module) {
  main()
}
