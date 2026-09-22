#!/usr/bin/env python3
"""Done Right: run the database tests against a throwaway local Postgres.

  python3 tools/db_test.py            # stub + supabase/migrations/*.sql + tests/db/*.sql
  python3 tools/db_test.py --keep     # leave the cluster running and print how to connect

Needs Postgres 15+ binaries (initdb, pg_ctl, psql) on PATH, in $PG_BIN, or from Homebrew
(`brew install postgresql@16`). The cluster lives in a temp directory and listens on a Unix
socket only; it is deleted afterwards.
"""
import argparse
import glob
import os
import re
import shutil
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CANDIDATES = [os.environ.get('PG_BIN', ''), '/opt/homebrew/opt/postgresql@16/bin', '/usr/local/opt/postgresql@16/bin',
              '/opt/homebrew/opt/postgresql@17/bin', '/usr/lib/postgresql/16/bin']


def pg_bin():
    for d in CANDIDATES:
        if d and os.path.exists(os.path.join(d, 'initdb')):
            return d
    found = shutil.which('initdb')
    if found:
        return os.path.dirname(found)
    sys.exit('Postgres binaries not found. Install with `brew install postgresql@16` or set PG_BIN.')


ENV = dict(os.environ, LC_ALL='C', LANG='C')  # macOS postmaster refuses to start without a valid locale


def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True, env=ENV)
    if r.returncode:
        raise RuntimeError(f'{os.path.basename(cmd[0])} failed:\n{r.stdout}{r.stderr}')
    return r


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--keep', action='store_true', help='keep the cluster running after the tests')
    args = ap.parse_args()
    bindir = pg_bin()
    tmp = tempfile.mkdtemp(prefix='dr-pg-')
    data, sock, port = os.path.join(tmp, 'data'), tmp, '54329'
    b = lambda name: os.path.join(bindir, name)
    psql = [b('psql'), '-h', sock, '-p', port, '-U', 'postgres', '-d', 'postgres', '-X', '-q', '-v', 'ON_ERROR_STOP=1']
    try:
        run([b('initdb'), '-D', data, '-U', 'postgres', '--auth=trust', '--no-locale', '-E', 'UTF8'])
        try:
            run([b('pg_ctl'), '-D', data, '-l', os.path.join(tmp, 'pg.log'), '-w', 'start',
                 '-o', f"-k {sock} -p {port} -c listen_addresses='' -c timezone=UTC"])
        except RuntimeError:
            print(open(os.path.join(tmp, 'pg.log')).read()[-2000:])
            raise
        files = [os.path.join(ROOT, 'tests', 'db', '00_supabase_stub.sql')]
        files += sorted(glob.glob(os.path.join(ROOT, 'supabase', 'migrations', '*.sql')))
        for f in files:
            r = subprocess.run(psql + ['-f', f], capture_output=True, text=True, env=ENV)
            if r.returncode:
                print(f'✗ {os.path.relpath(f, ROOT)}\n{r.stderr}')
                return 1
            print(f'✓ applied {os.path.relpath(f, ROOT)}')
        passed = failed_n = 0
        for f in sorted(glob.glob(os.path.join(ROOT, 'tests', 'db', '[1-9]*.sql'))):
            r = subprocess.run(psql + ['-f', f], capture_output=True, text=True, env=ENV)
            out = r.stdout + r.stderr
            for line in out.splitlines():
                m = re.search(r'(not ok|ok) - (.*)', line)
                if m:
                    print(('  ✓ ' if m.group(1) == 'ok' else '  ✗ ') + m.group(2))
                    if m.group(1) == 'ok':
                        passed += 1
                    else:
                        failed_n += 1
            if r.returncode:
                print(f'✗ {os.path.relpath(f, ROOT)} aborted:\n{r.stderr}')
                failed_n += 1
        print(f'\n{passed} passed, {failed_n} failed')
        return 1 if failed_n or not passed else 0
    finally:
        if args.keep:
            print(f'\nCluster kept. Connect: psql -h {sock} -p {port} -U postgres\nStop: {b("pg_ctl")} -D {data} stop')
        else:
            subprocess.run([b('pg_ctl'), '-D', data, '-m', 'immediate', 'stop'], capture_output=True, env=ENV)
            shutil.rmtree(tmp, ignore_errors=True)


if __name__ == '__main__':
    sys.exit(main())
