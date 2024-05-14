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
  await esbuild.build(buildConfig.mv3)
  await esbuild.build(buildConfig.mv2)
})

task('esbuild-watch', async () => {
  const prefixedLogger = prefix => [{
    name: 'log-on-build',
    setup(build) {
      build.onEnd(result =>
        void console.log(
          '<%s> build ended at: %s, with: %d Errors, %d Warnings',
          prefix,
          new Date().toLocaleTimeString(),
          result.errors.length,
          result.warnings.length,
        )
      )
    },
  }]
  const ctx2 = await esbuild.context({
    ...buildConfig.mv2,
    plugins: prefixedLogger('mv2'),
  })
  const ctx3 = await esbuild.context({
    ...buildConfig.mv3,
    plugins: prefixedLogger('mv3'),
  })
  await Promise.all([ctx2.watch(), ctx3.watch()])
  logger.info('esbuild: watching...')
})

task('copy-assets', async () => {
  const copyOptions = {
    stopOnErr: true,
    filter(filename) {
      return !/\.tsx?$/.test(filename)
    },
  }
  await Promise.all([cp('src/', 'build/', copyOptions), cp('src/', 'build-v3/', copyOptions)])
  await fs.move('build-v3/manifest-v3.json', 'build-v3/manifest.json', {
    overwrite: true,
  })
})

task('clean', async () => {
  await Promise.all([rmrf('build/'), rmrf('build-v3/')])
})

task('zip', async () => {
  const filename = `${name}-v${version}.zip`
  const filenamev3 = `${name}-v${version} [MV3].zip`
  logger.info(`zipping into "${filename}" / "${filenamev3}"...`)
  await mkdirp('dist/')
  await Promise.all([
    exec(`7z a -r "dist/${filename}" build/.`),
    exec(`7z a -r "dist/${filenamev3}" build-v3/.`),
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
