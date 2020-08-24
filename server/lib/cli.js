let _app
const options = {
  loglevel: 'KF_LOG_LEVEL',
  port: 'KF_SERVER_PORT',
}

const yargs = require('yargs')
  .version(false) // disable default handler
  .command('scanonly', 'Run a media scan on server startup, then exit when finished')
  .option('l', {
    alias: 'loglevel',
    describe: 'Log file level (0=off, 1=error, 2=warn, 3=info, 4=verbose, 5=debug) (default=2)',
    requiresArg: true,
  })
  .option('p', {
    alias: 'port',
    describe: 'Web server port (default=0/auto)',
    requiresArg: true,
  })
  .option('v', {
    alias: 'version',
    describe: 'Output the Karaoke Forever Server version and exit',
  })

let argv = yargs.argv

if (process.versions.electron) {
  _app = require('electron').app

  // see https://github.com/yargs/yargs/blob/master/docs/api.md#argv
  if (_app.isPackaged) {
    argv = yargs.parse(process.argv.slice(1))
  }
}

if (argv.version) {
  console.log(_app ? _app.getVersion() : process.env.npm_package_version)
  process.exit(0)
}

// Sets environment variables for the current process based on CLI args.
// Returns an object of env vars ready to hand to child_process.fork()
function computeEnv () {
  const env = { NODE_ENV: process.env.NODE_ENV }

  // options set via CLI take precendence over env vars
  Object.keys(options).forEach(key => {
    if (typeof argv[key] !== 'undefined') {
      env[options[key]] = argv[key]
      process.env[options[key]] = argv[key]
    } else if (process.env[options[key]]) {
      env[options[key]] = process.env[options[key]]
    }
  })

  return env
}

module.exports = computeEnv()
