import { useRef } from 'react';
import { View } from 'react-native';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { ParseKeys } from 'i18next';
import { Controller, useForm, type FieldPath } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import type { AuthStackParamList } from '@app-types';
import { useRegisterMutation } from '@queries/users';
import AuthFooter from '@modules/auth/components/auth-footer';
import AuthHeader from '@modules/auth/components/auth-header';
import AuthPage from '@modules/auth/components/auth-page';
import StackedField, {
  type StackedFieldPosition,
} from '@modules/auth/components/stacked-field';
import SubmitButton from '@modules/auth/components/submit-button';
import {
  EMPTY_SIGN_UP_FORM,
  signUpFormSchema,
  toRegisterUserRequest,
  type SignUpForm,
} from '@modules/auth/helpers/sign-up';

type AuthKey = ParseKeys<'auth'>;

type FieldSpec = {
  name: FieldPath<SignUpForm>;
  position: StackedFieldPosition;
  label: AuthKey;
  placeholder: AuthKey;
  error: AuthKey;
  isSecure?: boolean;
  autoComplete: 'given-name' | 'family-name' | 'email' | 'new-password';
};

/** V1's four fields, with V2's first and last name in place of a username. */
const FIELDS: readonly FieldSpec[] = Object.freeze([
  {
    name: 'firstName',
    position: 'first',
    label: 'sign-up.first-name',
    placeholder: 'sign-up.first-name-placeholder',
    error: 'sign-up.first-name-invalid',
    autoComplete: 'given-name',
  },
  {
    name: 'lastName',
    position: 'middle',
    label: 'sign-up.last-name',
    placeholder: 'sign-up.last-name-placeholder',
    error: 'sign-up.last-name-invalid',
    autoComplete: 'family-name',
  },
  {
    name: 'email',
    position: 'middle',
    label: 'sign-up.email',
    placeholder: 'sign-up.email-placeholder',
    error: 'sign-up.email-invalid',
    autoComplete: 'email',
  },
  {
    name: 'password',
    position: 'middle',
    label: 'sign-up.password',
    placeholder: 'sign-up.password-placeholder',
    error: 'sign-up.password-invalid',
    isSecure: true,
    autoComplete: 'new-password',
  },
  {
    name: 'confirmPassword',
    position: 'last',
    label: 'sign-up.confirm-password',
    placeholder: 'sign-up.confirm-password-placeholder',
    error: 'sign-up.confirm-password-invalid',
    isSecure: true,
    autoComplete: 'new-password',
  },
]);

/** Keyboard and autofill hints per kind of field. */
function inputHints({ name, autoComplete }: FieldSpec) {
  if (name === 'email') {
    return {
      autoComplete,
      autoCapitalize: 'none',
      autoCorrect: false,
      inputMode: 'email',
      keyboardType: 'email-address',
      textContentType: 'emailAddress',
    } as const;
  }
  if (autoComplete === 'new-password') {
    return {
      autoComplete,
      autoCapitalize: 'none',
      autoCorrect: false,
      textContentType: 'newPassword',
    } as const;
  }
  return {
    autoComplete,
    autoCapitalize: 'words',
    textContentType: autoComplete === 'given-name' ? 'givenName' : 'familyName',
  } as const;
}

/**
 * V1's Sign up: first and last name, email, password and its confirmation
 * in the stacked fields. Checked on submit (the contract's rules, and the
 * two passwords must match); a field's red goes once it changes. A new
 * account goes to Login, as in V1; a taken email opens the Error dialog.
 */
export default function SignUpScreen() {
  const { t } = useTranslation('auth');
  const navigation =
    useNavigation<NativeStackNavigationProp<AuthStackParamList, 'SignUp'>>();
  const { mutate: register, isPending } = useRegisterMutation();
  const { control, handleSubmit, clearErrors } = useForm<SignUpForm>({
    resolver: zodResolver(signUpFormSchema),
    defaultValues: EMPTY_SIGN_UP_FORM,
    reValidateMode: 'onSubmit',
  });

  const goToLogin = () => {
    navigation.popTo('Login');
  };

  // Enter in a field works while the button is disabled, so a pending
  // request is checked here too; two submits in the same moment both pass
  // that check (`isPending` has not rendered yet), so the ref stops the
  // second one.
  const isInFlightRef = useRef(false);
  const registerOnce = (values: SignUpForm) => {
    if (isInFlightRef.current) {
      return;
    }
    isInFlightRef.current = true;
    register(toRegisterUserRequest(values), {
      onSuccess: goToLogin,
      onSettled: () => {
        isInFlightRef.current = false;
      },
    });
  };
  const submit = () => {
    if (isPending) {
      return;
    }
    void handleSubmit(registerOnce)();
  };

  return (
    <AuthPage>
      <AuthHeader subtitle={t('sign-up.subtitle')} />

      <View className="mt-5 w-full">
        {FIELDS.map((spec) => (
          <Controller
            key={spec.name}
            control={control}
            name={spec.name}
            render={({ field, fieldState }) => (
              <StackedField
                position={spec.position}
                isSecure={spec.isSecure}
                label={t(spec.label)}
                placeholder={t(spec.placeholder)}
                value={field.value}
                onChangeText={(text) => {
                  clearErrors(spec.name);
                  field.onChange(text);
                }}
                onBlur={field.onBlur}
                isInvalid={fieldState.invalid}
                errorMessage={t(spec.error)}
                onSubmitEditing={submit}
                {...inputHints(spec)}
              />
            )}
          />
        ))}

        <SubmitButton
          label={t('sign-up.submit')}
          isSubmitting={isPending}
          onPress={submit}
        />
      </View>

      <AuthFooter
        prompt={t('sign-up.have-account')}
        linkLabel={t('sign-up.log-in')}
        onPress={goToLogin}
      />
    </AuthPage>
  );
}
