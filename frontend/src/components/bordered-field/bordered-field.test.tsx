import { useState } from 'react';

import { act, fireEvent, renderWithProviders, screen } from '@utils/tests';

import BorderedField from './bordered-field';

function Controlled({ onBlur }: { onBlur?: () => void }) {
  const [value, setValue] = useState('');
  return (
    <BorderedField
      label="Device Name"
      value={value}
      onChangeText={setValue}
      onBlur={onBlur}
    />
  );
}

describe('BorderedField', () => {
  it('is an input named by its label', async () => {
    await renderWithProviders(<Controlled />);

    expect(screen.getByLabelText('Device Name')).toBeOnTheScreen();
    // iOS reads `accessibilityLabel`; `aria-labelledby` reaches Android and web.
    expect(screen.getByLabelText('Device Name')).toHaveProp(
      'accessibilityLabel',
      'Device Name',
    );
  });

  it('takes what is typed and reports leaving the field', async () => {
    const onBlur = jest.fn();
    await renderWithProviders(<Controlled onBlur={onBlur} />);
    const input = screen.getByLabelText('Device Name');

    await act(async () => {
      fireEvent(input, 'focus');
      fireEvent.changeText(input, 'Living room');
      fireEvent(input, 'blur');
    });

    expect(input).toHaveDisplayValue('Living room');
    expect(onBlur).toHaveBeenCalledTimes(1);
  });

  it('says what is wrong only while invalid', async () => {
    const props = {
      label: 'Device Name',
      value: '',
      onChangeText: jest.fn(),
      errorMessage: 'Enter a name',
    };
    const { rerender } = await renderWithProviders(
      <BorderedField {...props} />,
    );
    expect(screen.queryByText('Enter a name')).not.toBeOnTheScreen();

    await rerender(<BorderedField {...props} isInvalid />);

    expect(screen.getByText('Enter a name')).toBeOnTheScreen();
  });

  it('marks a required field with a red asterisk', async () => {
    await renderWithProviders(
      <BorderedField
        label="MAC address"
        value=""
        onChangeText={jest.fn()}
        isRequired
      />,
    );

    expect(
      screen.getByText('*', { includeHiddenElements: true }),
    ).toBeOnTheScreen();
  });
});
