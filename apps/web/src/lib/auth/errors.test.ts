import { describe, expect, it } from 'vitest';
import { authErrorMessage } from './errors';

const named = (name: string, message = name) => Object.assign(new Error(message), { name });

describe('authErrorMessage', () => {
  it.each([
    [named('NotAuthorizedException', 'Incorrect username or password.'), 'Incorrect email or password.'],
    [named('UserNotFoundException'), 'Incorrect email or password.'],
    [named('CodeMismatchException'), 'That code is incorrect. Check the email and try again.'],
    [named('LimitExceededException'), 'Too many attempts. Wait a few minutes and try again.'],
    [named('UserLambdaValidationException', 'PreSignUp failed with error This roll number is already registered..'), 'This roll number is already registered.'],
    [named('NotAuthorizedException', 'Password attempts exceeded'), 'Too many attempts. Wait a few minutes and try again.'],
    [named('SomethingInternal', 'arn:aws:secret detail'), 'Something went wrong. Please try again.'],
    ['not an error', 'Something went wrong. Please try again.']
  ])('maps %s', (error, message) => expect(authErrorMessage(error)).toBe(message));
});
