import { renderWithProviders, screen, userEvent } from '@utils/tests';

import StackedField from './stacked-field';

type Overrides = Partial<Parameters<typeof StackedField>[0]>;

async function renderField(overrides: Overrides = {}) {
  const onChangeText = jest.fn();
  await renderWithProviders(
    <StackedField
      label="Email"
      placeholder="Enter your email"
      value=""
      onChangeText={onChangeText}
      position="first"
      {...overrides}
    />,
  );
  return { onChangeText };
}

describe('StackedField', () => {
  it('is named by its label and reports what is typed', async () => {
    const { onChangeText } = await renderField();

    await userEvent.type(screen.getByLabelText('Email'), 'a');

    expect(onChangeText).toHaveBeenLastCalledWith('a');
    expect(screen.getByPlaceholderText('Enter your email')).toBeOnTheScreen();
  });

  it('is not marked invalid by default', async () => {
    await renderField({ errorMessage: 'Enter a valid email address.' });

    const input = screen.getByLabelText('Email');
    expect(input.props['aria-invalid']).toBe(false);
    expect(input.props.accessibilityHint).toBeUndefined();
  });

  it('marks an invalid field and describes the error without showing it', async () => {
    await renderField({
      isInvalid: true,
      errorMessage: 'Enter a valid email address.',
    });

    const input = screen.getByLabelText('Email');
    expect(input.props['aria-invalid']).toBe(true);
    expect(input.props.accessibilityHint).toBe('Enter a valid email address.');
    expect(
      screen.queryByText('Enter a valid email address.'),
    ).not.toBeOnTheScreen();
  });

  it('hides a password until the eye is pressed, then hides it again', async () => {
    await renderField({ label: 'Password', isSecure: true });
    const input = screen.getByLabelText('Password');
    expect(input.props.secureTextEntry).toBe(true);

    await userEvent.press(
      screen.getByRole('button', { name: 'fields.show-password' }),
    );
    expect(screen.getByLabelText('Password').props.secureTextEntry).toBe(false);

    await userEvent.press(
      screen.getByRole('button', { name: 'fields.hide-password' }),
    );
    expect(screen.getByLabelText('Password').props.secureTextEntry).toBe(true);
  });

  it('has no eye on a field that is not secret', async () => {
    await renderField();

    expect(screen.queryByRole('button')).not.toBeOnTheScreen();
    expect(screen.getByLabelText('Email').props.secureTextEntry).toBe(false);
  });

  it('submits on Enter', async () => {
    const onSubmitEditing = jest.fn();
    await renderField({ onSubmitEditing });

    await userEvent.type(screen.getByLabelText('Email'), 'a', {
      submitEditing: true,
    });

    expect(onSubmitEditing).toHaveBeenCalledTimes(1);
  });
});
