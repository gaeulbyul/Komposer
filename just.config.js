const { task, series, parallel, logger } = require('just-scripts')
const util = require('util')
const proc = require('child_process')
const mkdirp = require('mkdirp')
const rimraf = require('rimraf')
const ncp = require('ncp')
const fs = require('fs-extra')

const manifest = require('./src/manifest.json')
const esbuild = require('esbuild')
const buildConfig = require('./esbuild.config.js')

const name = manifest.name.replace(/[^\w\-]+/gi, '')
const version = manifest.version

const cp = util.promisify(ncp)
const rmrf = util.promisify(rimraf)
const exec = util.promisify(proc.exec)

task('check-tsc', async () => {
  await exec('tsc --noEmit')
})

task('bundle-js', async () => {
  await esbuild.build(buildConfig)
})

task('esbuild-watch', async () => {
  const watchLogger = () => [{
    name: 'log-on-build',
    setup(build) {
      build.onEnd(result =>
        void console.log(
          'build ended at: %s, with: %d Errors, %d Warnings',
          new Date().toLocaleTimeString(),
          result.errors.length,
          result.warnings.length,
        )
      )
    },
  }]
  const ctx = await esbuild.context({
    ...buildConfig,
    plugins: watchLogger(),
  })
  logger.info('esbuild: watching...')
  await ctx.watch()
})

task('copy-assets', async () => {
  const copyOptions = {
    stopOnErr: true,
    filter(filename) {
      return !/\.tsx?$/.test(filename)
    },
  }
  await cp('src/', 'build/', copyOptions)
})

task('clean', async () => {
  await rmrf('build/')
})

task('zip', async () => {
  const filename = `${name}-v${version}.zip`
  logger.info(`zipping into "${filename}"...`)
  await mkdirp('dist/')
  await Promise.all([
    exec(`7z a -r "dist/${filename}" build/.`),
  ])
})

task('srczip', async () => {
  await mkdirp('dist/')
  await exec(`git archive -9 -v -o ./dist/${name}-v${version}.Source.zip HEAD`)
})

task('build', parallel('copy-assets', 'bundle-js'))
task('default', series('clean', 'build'))
task('dist', parallel('zip', 'srczip'))
task('all', series('default', 'dist'))
