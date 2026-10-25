import { spawn } from 'node:child_process';

const commands: [string, string[]][] = [
  ['node', ['--import', 'tsx', 'src/server/main.ts']],
  ['node', ['--import', 'tsx', 'src/server/worker.ts']],
  ['node', ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1']],
];
const children = commands.map(([command, args]) => spawn(command, args, { stdio: 'inherit', env: process.env }));
let stopping = false;

function shutdown(signal: NodeJS.Signals = 'SIGTERM'): void {
  if (stopping) return;
  stopping = true;
  for (const child of children) if (child.exitCode === null) child.kill(signal);
}

for (const child of children) {
  child.once('error', (error) => {
    console.error(error);
    shutdown();
  });
  child.once('exit', (code) => {
    if (!stopping) {
      process.exitCode = code || 0;
      shutdown();
    }
  });
}
process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));
