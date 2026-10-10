import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';
import { CloudAttendStack } from '../lib/cloudattend-stack.js';

function template(environment = 'dev') {
  const app = new App({ context: { environment } });
  return Template.fromStack(new CloudAttendStack(app, `Sbx-${environment}`, { env: { account: '111111111111', region: 'us-east-1' } }));
}

describe('CloudAttend infrastructure', () => {
  it('defines five on-demand DynamoDB tables and required GSIs', () => {
    const stack = template();
    stack.resourceCountIs('AWS::DynamoDB::Table', 5);
    const tables = stack.findResources('AWS::DynamoDB::Table');
    expect(Object.values(tables).every((table: any) => table.Properties.BillingMode === 'PAY_PER_REQUEST')).toBe(true);
    expect(JSON.stringify(tables)).toContain('email-index');
    expect(JSON.stringify(tables)).toContain('rollNo-index');
    expect(JSON.stringify(tables)).toContain('teacherId-index');
    expect(JSON.stringify(tables)).toContain('studentId-index');
    expect(JSON.stringify(tables)).toContain('courseId-index');
    expect(JSON.stringify(tables)).toContain('role-index');
  });

  it('configures Cognito groups, a hardened SRP-only client, and both triggers', () => {
    const stack = template();
    stack.resourceCountIs('AWS::Cognito::UserPoolGroup', 3);
    stack.hasResourceProperties('AWS::Cognito::UserPoolGroup', { GroupName: 'ADMIN' });
    stack.hasResourceProperties('AWS::Cognito::UserPoolClient', {
      GenerateSecret: false,
      PreventUserExistenceErrors: 'ENABLED',
      EnableTokenRevocation: true,
      ExplicitAuthFlows: ['ALLOW_USER_SRP_AUTH', 'ALLOW_REFRESH_TOKEN_AUTH']
    });
    stack.hasResourceProperties('AWS::Cognito::UserPool', {
      LambdaConfig: { PostConfirmation: Match.anyValue(), PreSignUp: Match.anyValue() },
      AccountRecoverySetting: { RecoveryMechanisms: [{ Name: 'verified_email', Priority: 1 }] },
      Policies: { PasswordPolicy: Match.objectLike({ MinimumLength: 12, RequireSymbols: true, RequireNumbers: true }) }
    });
  });

  it('scopes the post-confirmation group grant to this user pool', () => {
    const policies = JSON.stringify(template().findResources('AWS::IAM::Policy'));
    expect(policies).toContain('cognito-idp:AdminAddUserToGroup');
    expect(policies).not.toContain('userpool/*');
  });

  it('uses Node.js 24 and 30-day log groups for every Lambda and API access logs', () => {
    const stack = template();
    const functions = stack.findResources('AWS::Lambda::Function');
    const applicationFunctions = Object.values(functions).filter((fn: any) => fn.Properties.Tags?.some((tag: any) => tag.Key === 'Project' && tag.Value === 'CloudAttend')) as any[];
    expect(applicationFunctions).toHaveLength(3);
    expect(applicationFunctions.every((fn) => fn.Properties.Runtime === 'nodejs24.x')).toBe(true);
    stack.resourceCountIs('AWS::Logs::LogGroup', 4);
    for (const group of Object.values(stack.findResources('AWS::Logs::LogGroup')) as any[]) expect(group.Properties.RetentionInDays).toBe(30);
  });

  it('keeps health public and protects the catch-all route with JWT auth', () => {
    const stack = template();
    stack.hasResourceProperties('AWS::ApiGatewayV2::Integration', { PayloadFormatVersion: '2.0' });
    stack.hasResourceProperties('AWS::ApiGatewayV2::Route', { RouteKey: 'GET /health', AuthorizationType: 'NONE' });
    stack.hasResourceProperties('AWS::ApiGatewayV2::Route', { RouteKey: 'ANY /{proxy+}', AuthorizationType: 'JWT', AuthorizerId: Match.anyValue() });
  });

  it('throttles the API stage and writes access logs', () => {
    template().hasResourceProperties('AWS::ApiGatewayV2::Stage', {
      DefaultRouteSettings: { ThrottlingBurstLimit: 200, ThrottlingRateLimit: 100 },
      AccessLogSettings: { DestinationArn: Match.anyValue(), Format: Match.stringLikeRegexp('requestId') }
    });
  });

  it('sends a strict CSP and Permissions-Policy from CloudFront', () => {
    const policy = JSON.stringify(template().findResources('AWS::CloudFront::ResponseHeadersPolicy'));
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).toContain("script-src 'self'");
    expect(policy).toContain('Permissions-Policy');
  });

  it('blocks public S3 access and uses CloudFront OAC', () => {
    const stack = template();
    stack.resourceCountIs('AWS::S3::Bucket', 1);
    stack.hasResourceProperties('AWS::S3::Bucket', {
      PublicAccessBlockConfiguration: { BlockPublicAcls: true, BlockPublicPolicy: true, IgnorePublicAcls: true, RestrictPublicBuckets: true }
    });
    stack.resourceCountIs('AWS::CloudFront::OriginAccessControl', 1);
    stack.resourceCountIs('AWS::CloudFront::ResponseHeadersPolicy', 1);
  });

  it('creates a generated secret and a Lambda error alarm', () => {
    const stack = template();
    stack.hasResourceProperties('AWS::SecretsManager::Secret', { GenerateSecretString: Match.objectLike({ PasswordLength: 64 }) });
    stack.resourceCountIs('AWS::CloudWatch::Alarm', 2);
  });

  it('has no administrator policy or wildcard action', () => {
    const serialized = JSON.stringify(template().toJSON());
    expect(serialized).not.toContain('AdministratorAccess');
    const policies = template().findResources('AWS::IAM::Policy');
    for (const policy of Object.values(policies) as any[]) {
      for (const statement of policy.Properties.PolicyDocument.Statement) expect(statement.Action).not.toBe('*');
    }
  });

  it('retains production data and enables point-in-time recovery', () => {
    const stack = template('prod');
    for (const table of Object.values(stack.findResources('AWS::DynamoDB::Table')) as any[]) {
      expect(table.DeletionPolicy).toBe('Retain');
      expect(table.Properties.PointInTimeRecoverySpecification.PointInTimeRecoveryEnabled).toBe(true);
      expect(table.Properties.DeletionProtectionEnabled).toBe(true);
    }
  });
});
