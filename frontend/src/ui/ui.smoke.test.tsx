import { act, render, screen, userEvent } from '@testing-library/react-native';

import { Button, Input, Label, TextField, UiProvider, useToast } from '@ui';

function ShowToast() {
  const { toast } = useToast();
  return (
    <Button
      onPress={() => {
        toast.show({ variant: 'danger', label: 'Boom' });
      }}
    >
      <Button.Label>Show</Button.Label>
    </Button>
  );
}

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

  // VENDOR.md change 1: the kit's hidden measuring copy of a toast is
  // hidden from screen readers, so the message is there once.
  it("shows a kit toast's message once", async () => {
    await render(
      <UiProvider>
        <ShowToast />
      </UiProvider>,
    );

    await act(async () => {
      await userEvent.press(screen.getByRole('button', { name: 'Show' }));
    });

    expect(screen.getByText('Boom')).toBeOnTheScreen();
  });
});
