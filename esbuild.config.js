const path = require('path')
const esbuild = require('esbuild')

const dev = /^dev/i.test(process.env.NODE_ENV)

const buildConfig = {
  entryPoints: {
    komposer: './src/scripts/main.ts',
  },
  outdir: './build/bundled',
  outExtension: { '.js': '.bun.js' },
  bundle: true,
  target: ['esnext'],
  minifyWhitespace: !dev,
  minifyIdentifiers: !dev,
  minifySyntax: !dev,
  sourcemap: true,
}

async function main() {
  esbuild.build(buildConfig).then(result => {
    console.log('<esbuild> build')
  })
}

module.exports = buildConfig

if (require.main == module) {
  main()
}
