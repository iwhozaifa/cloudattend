import { execFileSync } from 'node:child_process';

const files = execFileSync('git', ['ls-files'], { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
const forbidden = /(^|\/)(\.env|demo-credentials\.local\.json|cdk\.out|node_modules)(\/|$)|AKIA[0-9A-Z]{16}|-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/;
const bad = files.filter((file) => forbidden.test(file));
if (bad.length) {
  console.error(`Potential secret/generated files tracked:\n${bad.join('\n')}`);
  process.exit(1);
}
console.log('Secret path scan passed.');
