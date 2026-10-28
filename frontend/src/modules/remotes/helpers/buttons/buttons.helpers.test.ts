import { BUTTON_NAME_MAX_LENGTH } from './buttons.constants';
import { isValidButtonName } from './buttons.helpers';

describe('isValidButtonName', () => {
  it.each(['Power', 'Temp +', 'Ψύξη 24°', ' x '])('takes %j', (name) => {
    expect(isValidButtonName(name)).toBe(true);
  });

  it.each(['', '   ', 'x'.repeat(101)])('refuses %j', (name) => {
    expect(isValidButtonName(name)).toBe(false);
  });

  it("takes the server's 100 characters", () => {
    expect(BUTTON_NAME_MAX_LENGTH).toBe(100);
    expect(isValidButtonName('x'.repeat(100))).toBe(true);
  });
});
