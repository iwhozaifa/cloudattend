/**
 * Full deployment: checks, CDK deploy, web config, web build, upload with correct caching, and
 * CloudFront invalidation. Requires AWS credentials for the target account (see README).
 *
 *   npx tsx scripts/deploy.ts dev|prod
 */
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

const env = process.argv[2] ?? 'dev';
if (env !== 'dev' && env !== 'prod') throw new Error('Usage: tsx scripts/deploy.ts dev|prod');
const run = (cmd: string, args: string[]) => execFileSync(cmd, args, { stdio: 'inherit' });

run('npm', ['run', 'lint']);
run('npm', ['run', 'typecheck']);
run('npm', ['run', 'test']);
run('npm', ['run', 'cdk:synth']);
run('npx', ['cdk', 'deploy', '--app', 'npx tsx infra/bin/cloudattend.ts', '--context', `environment=${env}`, '--outputs-file', 'infra/cdk-outputs.json', '--require-approval', env === 'prod' ? 'broadening' : 'never']);
run('npx', ['tsx', 'scripts/generate-web-config.ts', 'infra/cdk-outputs.json']);
run('npm', ['--workspace', '@cloudattend/web', 'run', 'build']);

const outputs = JSON.parse(await readFile('infra/cdk-outputs.json', 'utf8')) as Record<string, Record<string, string>>;
const stack = outputs[`CloudAttend-${env}`] ?? Object.values(outputs)[0];
const bucket = `s3://${stack.FrontendBucket}`;
// Hashed assets never change: cache for a year. index.html and config.json must always be revalidated.
run('aws', ['s3', 'sync', 'apps/web/dist/', bucket, '--delete', '--exclude', 'index.html', '--exclude', 'config.json', '--cache-control', 'public,max-age=31536000,immutable']);
run('aws', ['s3', 'cp', 'apps/web/dist/index.html', `${bucket}/index.html`, '--cache-control', 'no-cache', '--content-type', 'text/html; charset=utf-8']);
run('aws', ['s3', 'cp', 'apps/web/dist/config.json', `${bucket}/config.json`, '--cache-control', 'no-cache', '--content-type', 'application/json']);
run('aws', ['cloudfront', 'create-invalidation', '--distribution-id', stack.DistributionId, '--paths', '/index.html', '/config.json']);
console.log(`Deployed ${env}: ${stack.CloudFrontUrl}`);
