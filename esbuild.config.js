const path = require('path')
const esbuild = require('esbuild')

const dev = /^dev/i.test(process.env.NODE_ENV)

const watchOptions = {
  onRebuild(error, result) {
    if (error) {
      console.error('<esbuild> error: ', error)
    } else {
      const { errors, warnings } = result
      console.log('<esbuild> ok: ', { errors, warnings })
    }
  },
}

const watch = dev ? watchOptions : null

const base = {
  entryPoints: {
    komposer: './src/scripts/main.ts',
  },
  outExtension: { '.js': '.bun.js' },
  // outdir: './build/bundled',
  bundle: true,
  target: [
    'es2022',
    'chrome100',
    'firefox91',
    'edge100',
  ],
  watch,
  minifyWhitespace: !dev,
  minifyIdentifiers: !dev,
  minifySyntax: !dev,
  sourcemap: true,
}

async function main() {
  if (watch) {
    console.log('<esbuild> watching...')
  } else {
    console.log('<esbuild> building...')
  }
  const mv2 = esbuild.build({
    ...base,
    outdir: './build/bundled',
  })
  const mv3 = esbuild.build({
    ...base,
    outdir: './build-v3/bundled',
  })
  await Promise.all([mv2, mv3])
  if (!watch) {
    console.log('<esbuild> DONE')
  }
}

main()
