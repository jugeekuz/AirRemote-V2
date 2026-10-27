import { useId } from 'react';
import { View } from 'react-native';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { loginRequestSchema, type LoginRequest } from '@airremote/contracts';

import { useLogin } from '@hooks/use-login';
import { Button, FieldError, Input, Label, Text, TextField } from '@ui';

const EMPTY_CREDENTIALS: LoginRequest = { email: '', password: '' };

/** Email and password sign-in. Signing in swaps to Home through the auth store. */
export default function LoginScreen() {
  const { t } = useTranslation('auth');
  const { login, isLoggingIn } = useLogin();
  const emailLabelId = useId();
  const passwordLabelId = useId();
  const { control, handleSubmit } = useForm<LoginRequest>({
    resolver: zodResolver(loginRequestSchema),
    defaultValues: EMPTY_CREDENTIALS,
  });

  // Validates first; on failure the fields show their i18n texts (never the
  // schema's own messages). Called without the press event, which isn't a
  // web form event.
  const validateAndLogin = handleSubmit(login);
  const submit = () => {
    void validateAndLogin();
  };

  return (
    <View className="flex-1 items-center justify-center bg-background px-6">
      <View className="w-full max-w-sm gap-6">
        <Text.Heading type="h3" align="center">
          {t('login.title')}
        </Text.Heading>

        <Controller
          control={control}
          name="email"
          render={({ field, fieldState }) => (
            <TextField isInvalid={fieldState.invalid}>
              <Label nativeID={emailLabelId}>{t('login.email')}</Label>
              <Input
                aria-labelledby={emailLabelId}
                value={field.value}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                autoCapitalize="none"
                autoComplete="email"
                autoCorrect={false}
                inputMode="email"
                keyboardType="email-address"
                textContentType="emailAddress"
              />
              <FieldError>{t('login.invalid-email')}</FieldError>
            </TextField>
          )}
        />

        <Controller
          control={control}
          name="password"
          render={({ field, fieldState }) => (
            <TextField isInvalid={fieldState.invalid}>
              <Label nativeID={passwordLabelId}>{t('login.password')}</Label>
              <Input
                aria-labelledby={passwordLabelId}
                value={field.value}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                autoCapitalize="none"
                autoComplete="current-password"
                secureTextEntry
                textContentType="password"
                onSubmitEditing={submit}
              />
              <FieldError>{t('login.password-required')}</FieldError>
            </TextField>
          )}
        />

        <Button
          onPress={submit}
          isDisabled={isLoggingIn}
          accessibilityState={{ disabled: isLoggingIn, busy: isLoggingIn }}
        >
          <Button.Label>{t('login.submit')}</Button.Label>
        </Button>
      </View>
    </View>
  );
}
