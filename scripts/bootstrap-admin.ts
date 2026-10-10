/**
 * Grants the ADMIN group to an existing, confirmed CloudAttend account so it can promote teachers
 * from the web app. The person must register (or be created) first.
 *
 *   npx tsx scripts/bootstrap-admin.ts admin@university.edu [infra/cdk-outputs.json]
 */
import { readFile } from 'node:fs/promises';
import { AdminAddUserToGroupCommand, CognitoIdentityProviderClient, ListUsersCommand } from '@aws-sdk/client-cognito-identity-provider';

const [email, outputsFile = 'infra/cdk-outputs.json'] = process.argv.slice(2);
if (!email || !/^[^\s@"]+@[^\s@"]+$/.test(email)) throw new Error('Usage: tsx scripts/bootstrap-admin.ts <email> [cdk-outputs.json]');

const outputs = JSON.parse(await readFile(outputsFile, 'utf8')) as Record<string, Record<string, string>>;
const userPoolId = process.env.USER_POOL_ID ?? Object.values(outputs)[0]?.UserPoolId;
if (!userPoolId) throw new Error(`No UserPoolId in ${outputsFile}; set USER_POOL_ID instead.`);

const cognito = new CognitoIdentityProviderClient({});
const listed = await cognito.send(new ListUsersCommand({ UserPoolId: userPoolId, Filter: `email = "${email.toLowerCase()}"`, Limit: 1 }));
const user = listed.Users?.[0];
if (!user?.Username) throw new Error(`No account found for ${email}. Register it first.`);
if (user.UserStatus !== 'CONFIRMED') throw new Error(`${email} is ${user.UserStatus}; confirm the account first.`);
await cognito.send(new AdminAddUserToGroupCommand({ UserPoolId: userPoolId, Username: user.Username, GroupName: 'ADMIN' }));
console.log(`${email} is now an administrator. Sign out and back in for the change to take effect.`);
