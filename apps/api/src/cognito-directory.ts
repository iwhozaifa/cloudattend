import {
  AdminAddUserToGroupCommand,
  AdminRemoveUserFromGroupCommand,
  AdminUserGlobalSignOutCommand,
  CognitoIdentityProviderClient,
  ListUsersCommand
} from '@aws-sdk/client-cognito-identity-provider';
import type { UserDirectory } from './core.js';

export function createCognitoDirectory(userPoolId: string, cognito = new CognitoIdentityProviderClient({})): UserDirectory {
  return {
    async setRole(userId, role) {
      const listed = await cognito.send(new ListUsersCommand({ UserPoolId: userPoolId, Filter: `sub = "${userId.replace(/"/g, '')}"`, Limit: 1 }));
      const username = listed.Users?.[0]?.Username;
      if (!username) throw new Error('Cognito user not found');
      const previous = role === 'TEACHER' ? 'STUDENT' : 'TEACHER';
      await cognito.send(new AdminAddUserToGroupCommand({ UserPoolId: userPoolId, Username: username, GroupName: role }));
      await cognito.send(new AdminRemoveUserFromGroupCommand({ UserPoolId: userPoolId, Username: username, GroupName: previous }));
      // Group membership is baked into issued tokens; revoke them so the new role applies on next sign-in.
      await cognito.send(new AdminUserGlobalSignOutCommand({ UserPoolId: userPoolId, Username: username }));
    }
  };
}
