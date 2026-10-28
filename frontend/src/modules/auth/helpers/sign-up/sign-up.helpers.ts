import { z } from 'zod';

import {
  registerUserRequestSchema,
  type RegisterUserRequest,
} from '@airremote/contracts';

/** The two passwords are compared even when another field is invalid. */
function passwordsMatch({
  password,
  confirmPassword,
}: {
  password: string;
  confirmPassword: string;
}): boolean {
  return password === confirmPassword;
}

/** Zod skips object refinements once a field fails; this runs them anyway. */
const ALWAYS = () => true;

/**
 * The Sign up form: the contract's registration rules, plus a confirmation
 * that must equal the password. A mismatch marks both password rows, and is
 * checked even when another field is invalid, as V1's form did.
 */
export const signUpFormSchema = registerUserRequestSchema
  .extend({ confirmPassword: z.string() })
  .refine(passwordsMatch, { path: ['password'], when: ALWAYS })
  .refine(passwordsMatch, { path: ['confirmPassword'], when: ALWAYS });

export type SignUpForm = z.input<typeof signUpFormSchema>;

export const EMPTY_SIGN_UP_FORM: SignUpForm = Object.freeze({
  firstName: '',
  lastName: '',
  email: '',
  password: '',
  confirmPassword: '',
});

/** The registration request: everything but the confirmation. */
export function toRegisterUserRequest({
  firstName,
  lastName,
  email,
  password,
}: SignUpForm): RegisterUserRequest {
  return { firstName, lastName, email, password };
}
