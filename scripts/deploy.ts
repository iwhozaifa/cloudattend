import { execFileSync } from 'node:child_process';
const env = process.argv[2] ?? 'dev'; const run=(cmd:string,args:string[])=>execFileSync(cmd,args,{stdio:'inherit'});
run('npm',['run','lint']); run('npm',['run','typecheck']); run('npm',['run','test']); run('npm',['run','cdk:synth']);
run('npx',['cdk','deploy','--app','npx tsx infra/bin/cloudattend.ts','--context',`environment=${env}`,'--outputs-file','infra/cdk-outputs.json','--require-approval','never']);
run('npx',['tsx','scripts/generate-web-config.ts','infra/cdk-outputs.json']); run('npm',['--workspace','@cloudattend/web','run','build']);
console.log('Upload apps/web/dist to the FrontendBucket emitted by CDK, then invalidate the DistributionId.');
