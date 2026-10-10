const MESSAGES: Record<string, string> = {
  NotAuthorizedException: 'Incorrect email or password.',
  UserNotFoundException: 'Incorrect email or password.',
  UsernameExistsException: 'An account with this email already exists. Try signing in or resetting your password.',
  CodeMismatchException: 'That code is incorrect. Check the email and try again.',
  ExpiredCodeException: 'That code has expired. Request a new one.',
  LimitExceededException: 'Too many attempts. Wait a few minutes and try again.',
  TooManyRequestsException: 'Too many attempts. Wait a few minutes and try again.',
  TooManyFailedAttemptsException: 'Too many attempts. Wait a few minutes and try again.',
  InvalidPasswordException: 'That password does not meet the requirements.',
  NetworkError: 'We could not reach the sign-in service. Check your connection and try again.'
};

/** Converts Cognito / Amplify errors into short, user-facing text without leaking internals. */
export function authErrorMessage(error: unknown) {
  if (!(error instanceof Error)) return 'Something went wrong. Please try again.';
  if (error.name === 'UserLambdaValidationException') {
    // Cognito wraps trigger errors: "PreSignUp failed with error <message>."
    const match = /failed with error (.+?)\.?$/.exec(error.message);
    return match ? `${match[1].replace(/\.$/, '')}.` : 'Your details could not be accepted.';
  }
  if (error.name === 'NotAuthorizedException' && /revoked|expired/i.test(error.message)) return 'Your session has ended. Please sign in again.';
  if (error.name === 'NotAuthorizedException' && /attempts exceeded/i.test(error.message)) return MESSAGES.TooManyRequestsException;
  return MESSAGES[error.name] ?? (error.name === 'InvalidParameterException' ? error.message : 'Something went wrong. Please try again.');
}
