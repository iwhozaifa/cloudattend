#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { CloudAttendStack } from '../lib/cloudattend-stack.js';
const app = new cdk.App();
new CloudAttendStack(app, `CloudAttend-${app.node.tryGetContext('environment') ?? 'dev'}`, { env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION } });
