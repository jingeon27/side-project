#!/usr/bin/env node
const { spawnSync } = require('node:child_process');
const { dirname, resolve } = require('node:path');
const metadata = require.resolve('@typescript/native/package.json');
const { bin } = require(metadata);
const compiler = resolve(dirname(metadata), bin.tsc);
const result = spawnSync(process.execPath, [compiler, ...process.argv.slice(2)], { stdio: 'inherit' });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
