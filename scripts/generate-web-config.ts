import { readFile, writeFile } from 'node:fs/promises';
const [outputsFile, destination='apps/web/public/config.json'] = process.argv.slice(2);
if (!outputsFile) throw new Error('Usage: tsx scripts/generate-web-config.ts <cdk-outputs.json> [destination]');
const outputs = JSON.parse(await readFile(outputsFile, 'utf8')); const stack = outputs[Object.keys(outputs)[0]];
await writeFile(destination, JSON.stringify({ region: process.env.AWS_REGION ?? 'us-east-1', apiUrl: stack.ApiUrl, userPoolId: stack.UserPoolId, userPoolClientId: stack.UserPoolClientId }, null, 2));
