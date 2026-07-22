/**
 * A local Postgres you never have to think about.
 *
 * `npm run db:up` starts one on port 55432 with its own data directory under .pgdata/,
 * creating it on first run. `npm run db:down` stops it. Nothing is registered with launchd
 * or `brew services`, so it never starts behind your back — it is there when you ask and
 * gone when you do not.
 *
 * LC_ALL is forced to C because Postgres 16 on macOS otherwise dies at startup with
 * "postmaster became multithreaded during startup". That is a Homebrew/macOS interaction,
 * not something this project causes, and it is handled here so it never has to be
 * remembered.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const PORT = 55432;
const DB = 'grimoire';
const root = fileURLToPath(new URL('../', import.meta.url));
const dataDir = `${root}.pgdata`;
const socketDir = dataDir;

/** Homebrew keg-only installs are not on PATH; find the binaries wherever they live. */
function binDir() {
  for (const candidate of [
    '/opt/homebrew/opt/postgresql@16/bin',
    '/usr/local/opt/postgresql@16/bin',
    '/opt/homebrew/bin',
    '/usr/local/bin',
  ]) {
    if (existsSync(`${candidate}/pg_ctl`)) return candidate;
  }
  console.error(
    'No postgres found. Install one:  brew install postgresql@16\n' +
      '(Only needed for local end-to-end tests; unit tests run without it.)',
  );
  process.exit(1);
}

const bin = binDir();
const env = { ...process.env, LC_ALL: 'C', LANG: 'C' };
const run = (cmd, args, opts = {}) =>
  spawnSync(`${bin}/${cmd}`, args, { env, encoding: 'utf8', ...opts });

const isUp = () => run('pg_isready', ['-h', socketDir, '-p', String(PORT)]).status === 0;

const command = process.argv[2];

if (command === 'up') {
  if (isUp()) {
    console.log(`already running — postgresql://postgres@localhost:${PORT}/${DB}`);
    process.exit(0);
  }

  if (!existsSync(`${dataDir}/PG_VERSION`)) {
    mkdirSync(dataDir, { recursive: true });
    console.log('first run — initialising the data directory…');
    const init = run('initdb', ['-D', dataDir, '-U', 'postgres', '--auth=trust'], {
      stdio: 'ignore',
    });
    if (init.status !== 0) {
      console.error('initdb failed');
      process.exit(1);
    }
  }

  const start = run('pg_ctl', [
    '-D',
    dataDir,
    '-o',
    `-p ${PORT} -k ${socketDir}`,
    '-l',
    `${dataDir}/server.log`,
    '-w',
    'start',
  ]);
  if (start.status !== 0) {
    console.error(start.stdout ?? '', start.stderr ?? '');
    console.error(`\nSee ${dataDir}/server.log`);
    process.exit(1);
  }

  // createdb is a no-op error when it already exists; ignore that specific case.
  run('createdb', ['-h', socketDir, '-p', String(PORT), '-U', 'postgres', DB], {
    stdio: 'ignore',
  });

  console.log(`up — postgresql://postgres@localhost:${PORT}/${DB}`);
  console.log('next:  npm run migrate && npm run seed:dev');
} else if (command === 'down') {
  if (!isUp()) {
    console.log('not running');
    process.exit(0);
  }
  run('pg_ctl', ['-D', dataDir, '-m', 'fast', '-w', 'stop'], { stdio: 'ignore' });
  console.log('down');
} else if (command === 'status') {
  console.log(isUp() ? `up on ${PORT}` : 'down');
} else {
  console.error('usage: node scripts/db.mjs up|down|status');
  process.exit(1);
}

// Keep the binary location discoverable for anyone debugging by hand.
if (process.env.DEBUG) execFileSync('echo', [`postgres binaries: ${bin}`], { stdio: 'inherit' });
