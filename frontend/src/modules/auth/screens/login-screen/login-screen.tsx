import { useCallback } from 'react';
import { View } from 'react-native';
import { zodResolver } from '@hookform/resolvers/zod';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { loginRequestSchema, type LoginRequest } from '@airremote/contracts';

import type { AuthStackParamList } from '@app-types';
import { useLogin } from '@hooks/use-login';
import AuthFooter from '@modules/auth/components/auth-footer';
import AuthHeader from '@modules/auth/components/auth-header';
import AuthPage from '@modules/auth/components/auth-page';
import GoogleButton from '@modules/auth/components/google-button';
import OrDivider from '@modules/auth/components/or-divider';
import StackedField from '@modules/auth/components/stacked-field';
import SubmitButton from '@modules/auth/components/submit-button';

const EMPTY_CREDENTIALS: LoginRequest = { email: '', password: '' };

/**
 * V1's Login: email and password in the stacked fields, the blue Log In
 * button, the inert Google button and the link to Sign up. Signing in swaps
 * to the signed-in app through the auth store; wrong credentials open the
 * Error dialog (the query client shows it).
 */
export default function LoginScreen() {
  const { t } = useTranslation('auth');
  const navigation =
    useNavigation<NativeStackNavigationProp<AuthStackParamList, 'Login'>>();
  const { login, isLoggingIn } = useLogin();
  // Checked on submit only; a field's red border goes as soon as it changes.
  const { control, handleSubmit, clearErrors } = useForm<LoginRequest>({
    resolver: zodResolver(loginRequestSchema),
    defaultValues: EMPTY_CREDENTIALS,
    reValidateMode: 'onSubmit',
  });
  // Login stays mounted under Sign up; coming back, it starts without red.
  useFocusEffect(useCallback(() => () => clearErrors(), [clearErrors]));

  // Validates first; on failure the fields turn red and describe their i18n
  // texts to screen readers (never the schema's own messages). Called
  // without the press event, which isn't a web form event. Enter in a field
  // still works while the button is disabled, so a pending sign-in is
  // checked here too.
  const validateAndLogin = handleSubmit(login);
  const submit = () => {
    if (isLoggingIn) {
      return;
    }
    void validateAndLogin();
  };

  return (
    <AuthPage>
      <AuthHeader subtitle={t('login.subtitle')} />

      <View className="my-5 w-full">
        <Controller
          control={control}
          name="email"
          render={({ field, fieldState }) => (
            <StackedField
              position="first"
              label={t('login.email')}
              placeholder={t('login.email-placeholder')}
              value={field.value}
              onChangeText={(text) => {
                clearErrors('email');
                field.onChange(text);
              }}
              onBlur={field.onBlur}
              isInvalid={fieldState.invalid}
              errorMessage={t('login.invalid-email')}
              onSubmitEditing={submit}
              autoCapitalize="none"
              autoComplete="email"
              autoCorrect={false}
              inputMode="email"
              keyboardType="email-address"
              textContentType="emailAddress"
            />
          )}
        />
        <Controller
          control={control}
          name="password"
          render={({ field, fieldState }) => (
            <StackedField
              position="last"
              isSecure
              label={t('login.password')}
              placeholder={t('login.password-placeholder')}
              value={field.value}
              onChangeText={(text) => {
                clearErrors('password');
                field.onChange(text);
              }}
              onBlur={field.onBlur}
              isInvalid={fieldState.invalid}
              errorMessage={t('login.password-required')}
              onSubmitEditing={submit}
              autoCapitalize="none"
              autoComplete="current-password"
              autoCorrect={false}
              textContentType="password"
            />
          )}
        />

        <SubmitButton
          label={t('login.submit')}
          isSubmitting={isLoggingIn}
          onPress={submit}
        />
      </View>

      <OrDivider />
      <GoogleButton />
      <AuthFooter
        prompt={t('login.no-account')}
        linkLabel={t('login.sign-up')}
        onPress={() => navigation.navigate('SignUp')}
      />
    </AuthPage>
  );
}
