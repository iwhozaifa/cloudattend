import * as cdk from 'aws-cdk-lib';
import { CfnOutput, Duration, RemovalPolicy, Tags } from 'aws-cdk-lib';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as authorizers from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import * as integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as secrets from 'aws-cdk-lib/aws-secretsmanager';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import { Construct } from 'constructs';
import { join } from 'node:path';

export class CloudAttendStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    const environment = this.node.tryGetContext('environment') === 'prod' ? 'prod' : 'dev';
    const prod = environment === 'prod';
    const removalPolicy = prod ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY;

    Tags.of(this).add('Project', 'CloudAttend');
    Tags.of(this).add('Environment', environment);
    Tags.of(this).add('ManagedBy', 'CDK');

    const users = this.table('Users', 'userId', undefined, removalPolicy, prod);
    users.addGlobalSecondaryIndex({ indexName: 'email-index', partitionKey: { name: 'email', type: dynamodb.AttributeType.STRING } });
    users.addGlobalSecondaryIndex({ indexName: 'rollNo-index', partitionKey: { name: 'rollNo', type: dynamodb.AttributeType.STRING } });
    users.addGlobalSecondaryIndex({ indexName: 'role-index', partitionKey: { name: 'role', type: dynamodb.AttributeType.STRING }, sortKey: { name: 'email', type: dynamodb.AttributeType.STRING } });
    const courses = this.table('Courses', 'courseId', undefined, removalPolicy, prod);
    courses.addGlobalSecondaryIndex({ indexName: 'teacherId-index', partitionKey: { name: 'teacherId', type: dynamodb.AttributeType.STRING } });
    const enrollments = this.table('Enrollments', 'courseId', 'studentId', removalPolicy, prod);
    enrollments.addGlobalSecondaryIndex({ indexName: 'studentId-index', partitionKey: { name: 'studentId', type: dynamodb.AttributeType.STRING }, sortKey: { name: 'courseId', type: dynamodb.AttributeType.STRING } });
    const sessions = this.table('Sessions', 'sessionId', undefined, removalPolicy, prod);
    sessions.addGlobalSecondaryIndex({ indexName: 'courseId-index', partitionKey: { name: 'courseId', type: dynamodb.AttributeType.STRING }, sortKey: { name: 'startTime', type: dynamodb.AttributeType.STRING } });
    const attendance = this.table('Attendance', 'sessionId', 'studentId', removalPolicy, prod);
    attendance.addGlobalSecondaryIndex({ indexName: 'courseId-index', partitionKey: { name: 'courseId', type: dynamodb.AttributeType.STRING }, sortKey: { name: 'checkInTime', type: dynamodb.AttributeType.STRING } });
    attendance.addGlobalSecondaryIndex({ indexName: 'studentId-index', partitionKey: { name: 'studentId', type: dynamodb.AttributeType.STRING }, sortKey: { name: 'checkInTime', type: dynamodb.AttributeType.STRING } });

    const frontend = new s3.Bucket(this, 'Frontend', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy,
      autoDeleteObjects: !prod
    });
    const securityHeaders = new cloudfront.ResponseHeadersPolicy(this, 'SecurityHeaders', {
      securityHeadersBehavior: {
        contentTypeOptions: { override: true },
        frameOptions: { frameOption: cloudfront.HeadersFrameOption.DENY, override: true },
        referrerPolicy: { referrerPolicy: cloudfront.HeadersReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN, override: true },
        strictTransportSecurity: { accessControlMaxAge: Duration.days(365), includeSubdomains: true, preload: true, override: true },
        // Modern browsers ignore the legacy XSS auditor; OWASP recommends disabling it and relying on CSP.
        xssProtection: { protection: false, override: true },
        contentSecurityPolicy: {
          contentSecurityPolicy: [
            "default-src 'self'",
            // 'wasm-unsafe-eval' lets the self-hosted QR decoder compile WebAssembly; it does not allow eval().
            "script-src 'self' 'wasm-unsafe-eval'",
            // Radix UI positions popovers with inline style attributes.
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data: blob:",
            "font-src 'self' data:",
            `connect-src 'self' https://*.execute-api.${this.region}.amazonaws.com https://cognito-idp.${this.region}.amazonaws.com`,
            "media-src 'self' blob:",
            "frame-ancestors 'none'",
            "base-uri 'self'",
            "form-action 'self'",
            "object-src 'none'"
          ].join('; '),
          override: true
        }
      },
      customHeadersBehavior: {
        customHeaders: [{ header: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=(), payment=()', override: true }]
      }
    });
    const distribution = new cloudfront.Distribution(this, 'Distribution', {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(frontend),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        responseHeadersPolicy: securityHeaders
      },
      defaultRootObject: 'index.html',
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
      errorResponses: [
        { httpStatus: 403, responseHttpStatus: 200, responsePagePath: '/index.html', ttl: Duration.minutes(1) },
        { httpStatus: 404, responseHttpStatus: 200, responsePagePath: '/index.html', ttl: Duration.minutes(1) }
      ]
    });

    const pool = new cognito.UserPool(this, 'UserPool', {
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true },
      standardAttributes: { fullname: { required: true, mutable: true }, email: { required: true, mutable: true } },
      customAttributes: { rollNo: new cognito.StringAttribute({ minLen: 2, maxLen: 64, mutable: false }) },
      signInCaseSensitive: false,
      passwordPolicy: { minLength: 12, requireLowercase: true, requireUppercase: true, requireDigits: true, requireSymbols: true },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      deletionProtection: prod,
      removalPolicy
    });
    const client = pool.addClient('WebClient', {
      generateSecret: false,
      // SRP only: the plain USER_PASSWORD flow sends the password to Cognito and is not needed by the web app.
      authFlows: { userSrp: true },
      preventUserExistenceErrors: true,
      enableTokenRevocation: true,
      accessTokenValidity: Duration.hours(1),
      idTokenValidity: Duration.hours(1),
      refreshTokenValidity: Duration.days(30)
    });
    new cognito.CfnUserPoolGroup(this, 'Students', { groupName: 'STUDENT', userPoolId: pool.userPoolId });
    new cognito.CfnUserPoolGroup(this, 'Teachers', { groupName: 'TEACHER', userPoolId: pool.userPoolId });
    new cognito.CfnUserPoolGroup(this, 'Admins', { groupName: 'ADMIN', userPoolId: pool.userPoolId, description: 'Can list users and change their STUDENT/TEACHER role' });

    const postConfirmLogs = new logs.LogGroup(this, 'PostConfirmLogs', { retention: logs.RetentionDays.ONE_MONTH, removalPolicy });
    const postConfirm = new NodejsFunction(this, 'PostConfirmation', {
      runtime: lambda.Runtime.NODEJS_24_X,
      entry: join(import.meta.dirname, '../../apps/api/src/post-confirmation.ts'),
      handler: 'handler',
      logGroup: postConfirmLogs,
      environment: { USERS_TABLE: users.tableName },
      bundling: { minify: true, sourceMap: true }
    });
    users.grant(postConfirm, 'dynamodb:GetItem', 'dynamodb:PutItem', 'dynamodb:ConditionCheckItem');
    pool.addTrigger(cognito.UserPoolOperation.POST_CONFIRMATION, postConfirm);
    // A standalone policy (not the function's default policy) can reference the pool ARN without a
    // circular dependency, so the trigger is limited to this pool instead of every pool in the account.
    new iam.Policy(this, 'PostConfirmationCognitoPolicy', {
      roles: [postConfirm.role!],
      statements: [new iam.PolicyStatement({ actions: ['cognito-idp:AdminAddUserToGroup'], resources: [pool.userPoolArn] })]
    });

    const preSignUpLogs = new logs.LogGroup(this, 'PreSignUpLogs', { retention: logs.RetentionDays.ONE_MONTH, removalPolicy });
    const preSignUp = new NodejsFunction(this, 'PreSignUp', {
      runtime: lambda.Runtime.NODEJS_24_X,
      entry: join(import.meta.dirname, '../../apps/api/src/pre-sign-up.ts'),
      handler: 'handler',
      logGroup: preSignUpLogs,
      environment: { USERS_TABLE: users.tableName },
      bundling: { minify: true, sourceMap: true }
    });
    users.grant(preSignUp, 'dynamodb:PutItem');
    pool.addTrigger(cognito.UserPoolOperation.PRE_SIGN_UP, preSignUp);

    const qrSecret = new secrets.Secret(this, 'QrSigningSecret', {
      generateSecretString: { passwordLength: 64, excludePunctuation: true }
    });
    const apiLogs = new logs.LogGroup(this, 'ApiLogs', { retention: logs.RetentionDays.ONE_MONTH, removalPolicy });
    const apiFunction = new NodejsFunction(this, 'Api', {
      runtime: lambda.Runtime.NODEJS_24_X,
      entry: join(import.meta.dirname, '../../apps/api/src/handler.ts'),
      handler: 'handler',
      logGroup: apiLogs,
      timeout: Duration.seconds(15),
      memorySize: 512,
      environment: {
        USERS_TABLE: users.tableName,
        COURSES_TABLE: courses.tableName,
        ENROLLMENTS_TABLE: enrollments.tableName,
        SESSIONS_TABLE: sessions.tableName,
        ATTENDANCE_TABLE: attendance.tableName,
        QR_SECRET_ARN: qrSecret.secretArn,
        USER_POOL_ID: pool.userPoolId
      },
      bundling: { minify: true, sourceMap: true }
    });
    [users, courses, enrollments, sessions, attendance].forEach((table) => table.grantReadWriteData(apiFunction));
    qrSecret.grantRead(apiFunction);
    apiFunction.addToRolePolicy(new iam.PolicyStatement({
      actions: ['cognito-idp:ListUsers', 'cognito-idp:AdminAddUserToGroup', 'cognito-idp:AdminRemoveUserFromGroup', 'cognito-idp:AdminUserGlobalSignOut'],
      resources: [pool.userPoolArn]
    }));

    const api = new apigwv2.HttpApi(this, 'HttpApi', {
      corsPreflight: {
        allowHeaders: ['authorization', 'content-type'],
        allowMethods: [apigwv2.CorsHttpMethod.GET, apigwv2.CorsHttpMethod.POST, apigwv2.CorsHttpMethod.PUT, apigwv2.CorsHttpMethod.DELETE, apigwv2.CorsHttpMethod.OPTIONS],
        allowOrigins: [`https://${distribution.domainName}`, ...(prod ? [] : ['http://localhost:5173'])],
        maxAge: Duration.hours(1)
      }
    });
    const apiAccessLogs = new logs.LogGroup(this, 'ApiAccessLogs', { retention: logs.RetentionDays.ONE_MONTH, removalPolicy });
    const stage = api.defaultStage!.node.defaultChild as apigwv2.CfnStage;
    stage.defaultRouteSettings = { throttlingBurstLimit: 200, throttlingRateLimit: 100 };
    stage.accessLogSettings = {
      destinationArn: apiAccessLogs.logGroupArn,
      format: JSON.stringify({ requestId: '$context.requestId', ip: '$context.identity.sourceIp', routeKey: '$context.routeKey', status: '$context.status', latency: '$context.responseLatency', error: '$context.error.message' })
    };
    const integration = new integrations.HttpLambdaIntegration('ApiIntegration', apiFunction);
    const jwt = new authorizers.HttpUserPoolAuthorizer('JwtAuth', pool, { userPoolClients: [client] });
    api.addRoutes({ path: '/{proxy+}', methods: [apigwv2.HttpMethod.ANY], integration, authorizer: jwt });
    api.addRoutes({ path: '/health', methods: [apigwv2.HttpMethod.GET], integration });

    new cloudwatch.Alarm(this, 'ApiErrorsAlarm', {
      metric: apiFunction.metricErrors({ period: Duration.minutes(5), statistic: 'sum' }),
      threshold: 1,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING
    });

    new CfnOutput(this, 'ApiUrl', { value: api.apiEndpoint });
    new CfnOutput(this, 'CloudFrontUrl', { value: `https://${distribution.domainName}` });
    new CfnOutput(this, 'UserPoolId', { value: pool.userPoolId });
    new CfnOutput(this, 'UserPoolClientId', { value: client.userPoolClientId });
    new CfnOutput(this, 'FrontendBucket', { value: frontend.bucketName });
    new CfnOutput(this, 'DistributionId', { value: distribution.distributionId });
  }

  private table(id: string, partitionKey: string, sortKey: string | undefined, removalPolicy: RemovalPolicy, prod: boolean) {
    return new dynamodb.Table(this, id, {
      partitionKey: { name: partitionKey, type: dynamodb.AttributeType.STRING },
      sortKey: sortKey ? { name: sortKey, type: dynamodb.AttributeType.STRING } : undefined,
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: prod },
      removalPolicy
    });
  }
}
