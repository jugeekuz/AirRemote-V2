import { logError } from './logger.utils';

describe('logError', () => {
  it('logs the context and the error', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const error = new Error('boom');

    logError('ctx', error);

    expect(spy).toHaveBeenCalledWith('[ctx]', error);
    spy.mockRestore();
  });
});
