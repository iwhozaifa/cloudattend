import * as cdk from 'aws-cdk-lib';
import { Duration, RemovalPolicy, CfnOutput, Tags } from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as authorizers from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as secrets from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';
import { join } from 'node:path';
export class CloudAttendStack extends cdk.Stack {
 constructor(scope: Construct, id: string, props?: cdk.StackProps) { super(scope,id,props); const prod=this.node.tryGetContext('environment')==='prod'; Tags.of(this).add('Project','CloudAttend'); Tags.of(this).add('Environment',prod?'prod':'dev'); Tags.of(this).add('ManagedBy','CDK'); const removal=prod?RemovalPolicy.RETAIN:RemovalPolicy.DESTROY;
  const users=this.table('Users','userId',undefined,removal); users.addGlobalSecondaryIndex({indexName:'email-index',partitionKey:{name:'email',type:dynamodb.AttributeType.STRING}}); users.addGlobalSecondaryIndex({indexName:'rollNo-index',partitionKey:{name:'rollNo',type:dynamodb.AttributeType.STRING}});
  const courses=this.table('Courses','courseId',undefined,removal); courses.addGlobalSecondaryIndex({indexName:'teacherId-index',partitionKey:{name:'teacherId',type:dynamodb.AttributeType.STRING}});
  const enrollments=this.table('Enrollments','courseId','studentId',removal); enrollments.addGlobalSecondaryIndex({indexName:'studentId-index',partitionKey:{name:'studentId',type:dynamodb.AttributeType.STRING},sortKey:{name:'courseId',type:dynamodb.AttributeType.STRING}});
  const sessions=this.table('Sessions','sessionId',undefined,removal); sessions.addGlobalSecondaryIndex({indexName:'courseId-index',partitionKey:{name:'courseId',type:dynamodb.AttributeType.STRING},sortKey:{name:'startTime',type:dynamodb.AttributeType.STRING}});
  const attendance=this.table('Attendance','sessionId','studentId',removal); attendance.addGlobalSecondaryIndex({indexName:'courseId-index',partitionKey:{name:'courseId',type:dynamodb.AttributeType.STRING},sortKey:{name:'checkInTime',type:dynamodb.AttributeType.STRING}});
  const reports=new s3.Bucket(this,'Reports',{blockPublicAccess:s3.BlockPublicAccess.BLOCK_ALL,enforceSSL:true,encryption:s3.BucketEncryption.S3_MANAGED,removalPolicy:removal,autoDeleteObjects:!prod}); const frontend=new s3.Bucket(this,'Frontend',{blockPublicAccess:s3.BlockPublicAccess.BLOCK_ALL,enforceSSL:true,encryption:s3.BucketEncryption.S3_MANAGED,removalPolicy:removal,autoDeleteObjects:!prod});
  const pool=new cognito.UserPool(this,'UserPool',{selfSignUpEnabled:true,signInAliases:{email:true},autoVerify:{email:true},standardAttributes:{fullname:{required:true,mutable:true},email:{required:true,mutable:true}},customAttributes:{rollNo:new cognito.StringAttribute({minLen:2,maxLen:64,mutable:false})},passwordPolicy:{minLength:12},removalPolicy:removal}); const client=pool.addClient('WebClient',{generateSecret:false,authFlows:{userSrp:true,userPassword:true}}); new cognito.CfnUserPoolGroup(this,'Students',{groupName:'STUDENT',userPoolId:pool.userPoolId}); new cognito.CfnUserPoolGroup(this,'Teachers',{groupName:'TEACHER',userPoolId:pool.userPoolId});
  const secret=new secrets.Secret(this,'QrSigningSecret',{generateSecretString:{passwordLength:64,excludePunctuation:true}});
  const fn=new NodejsFunction(this,'Api',{runtime:lambda.Runtime.NODEJS_22_X,entry:join(import.meta.dirname,'../../apps/api/src/handler.ts'),handler:'handler',timeout:Duration.seconds(15),memorySize:512,environment:{USERS_TABLE:users.tableName,COURSES_TABLE:courses.tableName,ENROLLMENTS_TABLE:enrollments.tableName,SESSIONS_TABLE:sessions.tableName,ATTENDANCE_TABLE:attendance.tableName,QR_SECRET:secret.secretValue.unsafeUnwrap()},bundling:{minify:true,sourceMap:true}}); [users,courses,enrollments,sessions,attendance].forEach(t=>t.grantReadWriteData(fn)); reports.grantReadWrite(fn); secret.grantRead(fn);
  const api=new apigwv2.HttpApi(this,'HttpApi',{corsPreflight:{allowHeaders:['authorization','content-type'],allowMethods:[apigwv2.CorsHttpMethod.ANY],allowOrigins:['*']}}); const auth=new authorizers.HttpUserPoolAuthorizer('JwtAuth',pool,{userPoolClients:[client]}); api.addRoutes({path:'/{proxy+}',methods:[apigwv2.HttpMethod.ANY],integration:new integrations.HttpLambdaIntegration('ApiIntegration',fn),authorizer:auth}); api.addRoutes({path:'/health',methods:[apigwv2.HttpMethod.GET],integration:new integrations.HttpLambdaIntegration('HealthIntegration',fn)});
  const distribution=new cloudfront.Distribution(this,'Distribution',{defaultBehavior:{origin:origins.S3BucketOrigin.withOriginAccessControl(frontend),viewerProtocolPolicy:cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS},defaultRootObject:'index.html',errorResponses:[{httpStatus:403,responseHttpStatus:200,responsePagePath:'/index.html',ttl:Duration.minutes(1)}]});
  new CfnOutput(this,'ApiUrl',{value:api.apiEndpoint}); new CfnOutput(this,'CloudFrontUrl',{value:`https://${distribution.domainName}`}); new CfnOutput(this,'UserPoolId',{value:pool.userPoolId}); new CfnOutput(this,'UserPoolClientId',{value:client.userPoolClientId}); new CfnOutput(this,'FrontendBucket',{value:frontend.bucketName}); new CfnOutput(this,'DistributionId',{value:distribution.distributionId});
 }
 private table(id:string, pk:string, sk:string|undefined, removal:RemovalPolicy){return new dynamodb.Table(this,id,{partitionKey:{name:pk,type:dynamodb.AttributeType.STRING},sortKey:sk?{name:sk,type:dynamodb.AttributeType.STRING}:undefined,billingMode:dynamodb.BillingMode.PAY_PER_REQUEST,pointInTimeRecoverySpecification:{pointInTimeRecoveryEnabled:removal===RemovalPolicy.RETAIN},removalPolicy:removal});}
}
