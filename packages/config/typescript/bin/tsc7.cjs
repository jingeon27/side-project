#!/usr/bin/env node
const { spawn } = require('node:child_process');
const { dirname, resolve } = require('node:path');
const metadata = require.resolve('@typescript/native/package.json');
const { bin } = require(metadata);
const compiler = resolve(dirname(metadata), bin.tsc);
const forwardedSignals = ['SIGINT', 'SIGTERM', 'SIGHUP'];
const child = spawn(process.execPath, [compiler, ...process.argv.slice(2)], { stdio: 'inherit' });
// 호출자(셸·concurrently·스크립트)가 이 프로세스에만 보낸 종료 신호도 tsc(-w 포함)에 넘긴다.
const forward = (signal) => child.kill(signal);
for (const signal of forwardedSignals) process.on(signal, forward);
child.once('error', (error) => {
  throw error;
});
child.once('exit', (code, signal) => {
  for (const name of forwardedSignals) process.off(name, forward);
  // 신호로 끝난 tsc는 같은 신호로 이 프로세스도 끝내 호출자가 1이 아닌 신호 종료를 받게 한다.
  if (signal) process.kill(process.pid, signal);
  else process.exitCode = code ?? 1;
});
