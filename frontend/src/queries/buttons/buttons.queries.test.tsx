import { useQuery } from '@tanstack/react-query';

import type { ButtonResponse } from '@airremote/contracts';

import type { ApiError } from '@app-types';
import { createQueryWrapper, renderHook, waitFor } from '@utils/tests';
import { buttonsApi } from '@api/buttons';

import { buttonKeys, buttonQueries } from './buttons.queries';

jest.mock('@api/buttons');

const api = jest.mocked(buttonsApi);
const remoteId = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';
const button: ButtonResponse = {
  id: '3c2b1a09-8f7e-4d6c-9b5a-4f3e2d1c0b9a',
  remoteId,
  name: 'Power',
};

beforeEach(() => {
  jest.resetAllMocks();
});

describe('buttonKeys', () => {
  it('nests every key under the domain, one list per remote', () => {
    expect(buttonKeys.all).toEqual(['buttons']);
    expect(buttonKeys.lists()).toEqual(['buttons', 'list']);
    expect(buttonKeys.list(remoteId)).toEqual(['buttons', 'list', remoteId]);
  });
});

describe('buttonQueries.list', () => {
  it("loads the remote's buttons, passing the cancellation signal on", async () => {
    api.list.mockResolvedValueOnce([button]);

    const { result } = await renderHook(
      () => useQuery(buttonQueries.list(remoteId)),
      { wrapper: createQueryWrapper() },
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(result.current.data).toEqual([button]);
    expect(api.list).toHaveBeenCalledWith(remoteId, {
      signal: expect.any(AbortSignal),
    });
  });

  it('exposes the ApiError of a failed load', async () => {
    api.list.mockRejectedValueOnce(notFound());

    const { result } = await renderHook(
      () => useQuery(buttonQueries.list(remoteId)),
      { wrapper: createQueryWrapper() },
    );

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
    expect(result.current.error?.code).toBe('NOT_FOUND');
  });
});

function notFound(): ApiError {
  return {
    status: 404,
    code: 'NOT_FOUND',
    message: 'Not found',
    isNetworkError: false,
  };
}
