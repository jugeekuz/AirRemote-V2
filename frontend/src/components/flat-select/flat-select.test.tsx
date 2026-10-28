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

// Native unless a test says otherwise.
let mockIsWeb = false;
jest.mock('@utils/platform', () => ({
  get isWebPlatform() {
    return mockIsWeb;
  },
}));

const OPTIONS: readonly FlatSelectOption[] = [
  { value: 'heater', label: 'Heater' },
  { value: 'smart_tv', label: 'Smart TV' },
];
const MANY_OPTIONS: readonly FlatSelectOption[] = Array.from(
  { length: 12 },
  (_, index) => ({ value: `d${index + 1}`, label: `Device ${index + 1}` }),
);

type ControlledProps = {
  options?: readonly FlatSelectOption[];
  accessibilityLabel?: string;
  onChange?: (value: string) => void;
};

function Controlled({
  options = OPTIONS,
  accessibilityLabel,
  onChange,
}: ControlledProps) {
  const [value, setValue] = useState<string | null>(null);
  return (
    <FlatSelect
      label="Select an option"
      accessibilityLabel={accessibilityLabel}
      options={options}
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange?.(next);
      }}
    />
  );
}

beforeEach(() => {
  mockIsWeb = false;
  mockViewMeasure();
});

afterEach(() => {
  jest.restoreAllMocks();
});

async function open(name = 'Select an option') {
  await openSelect(name);
}

async function pick(option: string) {
  await act(async () => {
    fireEvent.press(screen.getByRole('option', { name: option }));
  });
}

describe('FlatSelect', () => {
  it('is a collapsed combobox named by its label, with nothing picked yet', async () => {
    await renderWithProviders(<Controlled />);

    const combobox = screen.getByRole('combobox', { name: 'Select an option' });
    expect(combobox).toBeOnTheScreen();
    expect(combobox).toBeCollapsed();
    expect(screen.getByText('Select an option')).toBeOnTheScreen();
    expect(screen.queryByRole('option')).not.toBeOnTheScreen();
  });

  it('takes its accessible name from the question it answers', async () => {
    await renderWithProviders(
      <Controlled accessibilityLabel="Select remote category:" />,
    );

    expect(
      screen.getByRole('combobox', { name: 'Select remote category:' }),
    ).toBeOnTheScreen();
    expect(screen.getByText('Select an option')).toBeOnTheScreen();
  });

  it('lists the options in their order, expanded, when opened', async () => {
    await renderWithProviders(<Controlled />);

    await open();

    const options = await screen.findAllByRole('option');
    expect(options.map((option) => option.props['aria-valuetext'])).toEqual([
      'Heater',
      'Smart TV',
    ]);
    expect(
      screen.getByRole('combobox', { name: 'Select an option' }),
    ).toBeExpanded();
  });

  it('reports the picked value, closes and shows it as its value', async () => {
    const onChange = jest.fn();
    await renderWithProviders(<Controlled onChange={onChange} />);
    await open();

    await pick('Smart TV');

    expect(onChange).toHaveBeenCalledWith('smart_tv');
    expect(screen.queryByRole('option')).not.toBeOnTheScreen();
    expect(screen.getByText('Smart TV')).toBeOnTheScreen();
    const combobox = screen.getByRole('combobox', { name: 'Select an option' });
    expect(combobox).toHaveAccessibilityValue({ text: 'Smart TV' });
    expect(combobox).toBeCollapsed();
  });

  // Browsers read a combobox's name, not `aria-valuetext`.
  it('names the picked value too on web', async () => {
    mockIsWeb = true;
    await renderWithProviders(
      <Controlled accessibilityLabel="Select remote category:" />,
    );
    await open('Select remote category:');

    await pick('Smart TV');

    expect(
      screen.getByRole('combobox', {
        name: 'flat-select.label-with-value | name: Select remote category: | value: Smart TV',
      }),
    ).toBeOnTheScreen();
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

  // The list is at most 256 px tall, like V1's; a long one scrolls.
  it('scrolls a long list, so its last option can be picked', async () => {
    const onChange = jest.fn();
    await renderWithProviders(
      <Controlled options={MANY_OPTIONS} onChange={onChange} />,
    );
    await open();

    const list = screen.getByTestId('flat-select-options');
    const last = screen.getByRole('option', { name: 'Device 12' });
    expect(list).toContainElement(last);
    expect(list.type).toBe('RCTScrollView');

    await pick('Device 12');

    expect(onChange).toHaveBeenCalledWith('d12');
  });
});
