import { useState } from 'react';

import {
  act,
  fireEvent,
  mockViewMeasure,
  openSelect,
  renderWithProviders,
  screen,
} from '@utils/tests';

import FlatSelect, { type FlatSelectOption } from './flat-select';

const OPTIONS: readonly FlatSelectOption[] = [
  { value: 'heater', label: 'Heater' },
  { value: 'smart_tv', label: 'Smart TV' },
];

function Controlled({ onChange }: { onChange?: (value: string) => void }) {
  const [value, setValue] = useState<string | null>(null);
  return (
    <FlatSelect
      label="Select an option"
      options={OPTIONS}
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange?.(next);
      }}
    />
  );
}

beforeEach(() => {
  mockViewMeasure();
});

afterEach(() => {
  jest.restoreAllMocks();
});

async function open() {
  await openSelect('Select an option');
}

describe('FlatSelect', () => {
  it('is a combobox named by its label, with nothing picked yet', async () => {
    await renderWithProviders(<Controlled />);

    expect(
      screen.getByRole('combobox', { name: 'Select an option' }),
    ).toBeOnTheScreen();
    expect(screen.getByText('Select an option')).toBeOnTheScreen();
    expect(screen.queryByRole('option')).not.toBeOnTheScreen();
  });

  it('lists the options in their order when opened', async () => {
    await renderWithProviders(<Controlled />);

    await open();

    const options = await screen.findAllByRole('option');
    expect(options.map((option) => option.props['aria-valuetext'])).toEqual([
      'Heater',
      'Smart TV',
    ]);
  });

  it('reports the picked value, closes and shows its label', async () => {
    const onChange = jest.fn();
    await renderWithProviders(<Controlled onChange={onChange} />);
    await open();

    await act(async () => {
      fireEvent.press(await screen.findByRole('option', { name: 'Smart TV' }));
    });

    expect(onChange).toHaveBeenCalledWith('smart_tv');
    expect(screen.queryByRole('option')).not.toBeOnTheScreen();
    expect(screen.getByText('Smart TV')).toBeOnTheScreen();
    expect(screen.getByText('Select an option')).toBeOnTheScreen();
  });

  it('shows the label of a value set from outside', async () => {
    await renderWithProviders(
      <FlatSelect
        label="Select an option"
        options={OPTIONS}
        value="heater"
        onChange={jest.fn()}
      />,
    );

    expect(screen.getByText('Heater')).toBeOnTheScreen();
  });
});
