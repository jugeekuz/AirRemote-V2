import {
  EMPTY_SIGN_UP_FORM,
  signUpFormSchema,
  toRegisterUserRequest,
  type SignUpForm,
} from './sign-up.helpers';

const valid: SignUpForm = {
  firstName: 'Ada',
  lastName: 'Lovelace',
  email: 'ada@example.com',
  password: 'password123',
  confirmPassword: 'password123',
};

function invalidFields(values: SignUpForm): string[] {
  const result = signUpFormSchema.safeParse(values);
  return result.success
    ? []
    : [...new Set(result.error.issues.map(({ path }) => String(path[0])))];
}

describe('signUpFormSchema', () => {
  it('accepts a complete form whose passwords match', () => {
    expect(invalidFields(valid)).toEqual([]);
  });

  it('flags every empty field of an empty form', () => {
    expect(invalidFields(EMPTY_SIGN_UP_FORM).sort()).toEqual(
      ['email', 'firstName', 'lastName', 'password'].sort(),
    );
  });

  it('uses the contract rules: a real email and at least 8 characters', () => {
    expect(
      invalidFields({
        ...valid,
        email: 'not-an-email',
        password: 'short',
        confirmPassword: 'short',
      }).sort(),
    ).toEqual(['email', 'password']);
  });

  it('flags both password fields when they differ', () => {
    expect(
      invalidFields({ ...valid, confirmPassword: 'password124' }).sort(),
    ).toEqual(['confirmPassword', 'password']);
  });

  it('checks the match even when another field is invalid', () => {
    expect(
      invalidFields({
        ...valid,
        firstName: '',
        confirmPassword: 'different1',
      }).sort(),
    ).toEqual(['confirmPassword', 'firstName', 'password']);
  });

  it('trims the names, as the server does', () => {
    const result = signUpFormSchema.parse({ ...valid, firstName: '  Ada ' });

    expect(result.firstName).toBe('Ada');
  });
});

describe('toRegisterUserRequest', () => {
  it('sends everything but the confirmation', () => {
    expect(toRegisterUserRequest(valid)).toEqual({
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'ada@example.com',
      password: 'password123',
    });
  });
});
