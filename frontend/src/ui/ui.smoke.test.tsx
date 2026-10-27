import { render, screen, userEvent } from '@testing-library/react-native';

import { Button, Input, Label, TextField, UiProvider } from '@ui';

describe('@ui', () => {
  it('renders a button and a text field from @ui', async () => {
    const onPress = jest.fn();
    await render(
      <UiProvider>
        <TextField>
          <Label nativeID="email-label">Email</Label>
          <Input aria-labelledby="email-label" />
        </TextField>
        <Button onPress={onPress}>
          <Button.Label>Go</Button.Label>
        </Button>
      </UiProvider>,
    );

    await userEvent.press(screen.getByRole('button', { name: 'Go' }));

    expect(onPress).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('Email')).toBeOnTheScreen();
  });
});
