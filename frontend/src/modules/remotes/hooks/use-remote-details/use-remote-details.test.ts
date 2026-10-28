import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { onlineManager } from '@tanstack/react-query';

import type {
  ButtonResponse,
  DeviceResponse,
  RemoteResponse,
} from '@airremote/contracts';

import type { ApiError } from '@app-types';
import {
  act,
  createQueryWrapper,
  createTestQueryClient,
  renderHook,
  waitFor,
} from '@utils/tests';
import { buttonsApi } from '@api/buttons';
import { devicesApi } from '@api/devices';
import { remotesApi } from '@api/remotes';
import { DEVICE_LIST_REFETCH_MS } from '@queries/devices';
import { remoteKeys } from '@queries/remotes';

import { useRemoteDetails } from './use-remote-details';

jest.mock('@api/buttons');
jest.mock('@api/devices');
jest.mock('@api/remotes');
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: jest.fn(),
  useIsFocused: jest.fn(),
}));

const buttons = jest.mocked(buttonsApi);
const devices = jest.mocked(devicesApi);
const remotes = jest.mocked(remotesApi);
const desk: DeviceResponse = {
  id: '6f1c0d4e-9a43-4c1b-8d4e-2f0a1b2c3d4e',
  macAddress: 'aa:bb:cc:dd:ee:01',
  name: 'Desk',
  online: true,
};
const ac: RemoteResponse = {
  id: '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d',
  deviceId: desk.id,
  name: 'AC',
  type: 'air_conditioner',
};
const power: ButtonResponse = {
  id: '3c2b1a09-8f7e-4d6c-9b5a-4f3e2d1c0b9a',
  remoteId: ac.id,
  name: 'Power',
};
const offline: ApiError = {
  code: 'NETWORK_ERROR',
  message: 'Network Error',
  isNetworkError: true,
};

// The mock keeps the latest focus callback; `focus()` stands in for the
// screen gaining focus.
let focusCallback: () => void = () => {};

async function focus() {
  await act(async () => {
    focusCallback();
  });
}

/** The hook on a screen that has just gained focus (its mount). */
async function renderDetails(
  remoteId = ac.id,
  queryClient = createTestQueryClient(),
) {
  const rendered = await renderHook(() => useRemoteDetails(remoteId), {
    wrapper: createQueryWrapper(queryClient),
  });
  await focus();
  return rendered;
}

beforeEach(() => {
  jest.resetAllMocks();
  jest.mocked(useIsFocused).mockReturnValue(true);
  jest.mocked(useFocusEffect).mockImplementation((callback) => {
    focusCallback = () => {
      callback();
    };
  });
  devices.list.mockResolvedValue([desk]);
  remotes.list.mockResolvedValue([ac]);
  buttons.list.mockResolvedValue([power]);
});

afterEach(() => {
  onlineManager.setOnline(true);
});
describe('useRemoteDetails', () => {
  it('knows nothing while the lists load', async () => {
    remotes.list.mockReturnValue(new Promise(() => {}));
    devices.list.mockReturnValue(new Promise(() => {}));

    const { result } = await renderDetails();

    expect(result.current.remote).toBeUndefined();
    expect(result.current.device).toBeUndefined();
    expect(result.current.buttons).toEqual([]);
    expect(result.current.isLoaded).toBe(false);
    expect(result.current.isMissing).toBe(false);
    expect(result.current.loadFailure).toBeNull();
  });

  // Paused until the network is back: the screen says why it is empty.
  it('says when the first load waits for the network', async () => {
    onlineManager.setOnline(false);

    const { result } = await renderDetails();

    expect(result.current.isOffline).toBe(true);
    expect(result.current.isLoaded).toBe(false);
    expect(remotes.list).not.toHaveBeenCalled();

    await act(async () => {
      onlineManager.setOnline(true);
    });

    await waitFor(() => {
      expect(result.current.isLoaded).toBe(true);
    });
    expect(result.current.isOffline).toBe(false);
  });

  it('says so when the remote is known but its buttons wait for the network', async () => {
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(remoteKeys.lists(), [ac]);
    onlineManager.setOnline(false);

    const { result } = await renderDetails(ac.id, queryClient);

    expect(result.current.remote).toEqual(ac);
    expect(result.current.isOffline).toBe(true);
    expect(buttons.list).not.toHaveBeenCalled();
  });

  it('finds the remote, its device and its buttons', async () => {
    const { result } = await renderDetails();

    await waitFor(() => {
      expect(result.current.isLoaded).toBe(true);
    });
    expect(result.current.remote).toEqual(ac);
    expect(result.current.device).toEqual(desk);
    expect(result.current.buttons).toEqual([power]);
    expect(result.current.isMissing).toBe(false);
    expect(buttons.list).toHaveBeenCalledWith(ac.id, {
      signal: expect.any(AbortSignal),
    });
  });

  // A deleted remote, or a link with an id that was never one.
  it("is missing once the remotes are known and it isn't among them", async () => {
    const { result } = await renderDetails('not-a-remote');

    await waitFor(() => {
      expect(result.current.isMissing).toBe(true);
    });
    expect(result.current.remote).toBeUndefined();
    expect(buttons.list).not.toHaveBeenCalled();
  });

  it('is missing after the user comes back to a remote deleted meanwhile', async () => {
    const { result } = await renderDetails();
    await waitFor(() => {
      expect(result.current.isLoaded).toBe(true);
    });
    remotes.list.mockResolvedValue([]);

    await focus();

    await waitFor(() => {
      expect(result.current.isMissing).toBe(true);
    });
    expect(buttons.list).toHaveBeenCalledTimes(1);
  });

  // The server deletes a device's remotes with it.
  it('asks for the remotes again when its device leaves the device list', async () => {
    jest.useFakeTimers();
    try {
      const { result } = await renderDetails();
      await waitFor(() => {
        expect(result.current.isLoaded).toBe(true);
      });
      devices.list.mockResolvedValue([]);
      remotes.list.mockResolvedValue([]);

      await act(async () => {
        jest.advanceTimersByTime(DEVICE_LIST_REFETCH_MS);
      });

      await waitFor(() => {
        expect(result.current.isMissing).toBe(true);
      });
      expect(remotes.list).toHaveBeenCalledTimes(2);
    } finally {
      jest.useRealTimers();
    }
  });

  it('asks for the remotes, devices and buttons again on focus', async () => {
    const { result } = await renderDetails();
    await waitFor(() => {
      expect(result.current.isLoaded).toBe(true);
    });

    await focus();

    await waitFor(() => {
      expect(buttons.list).toHaveBeenCalledTimes(2);
    });
    expect(remotes.list).toHaveBeenCalledTimes(2);
    expect(devices.list).toHaveBeenCalledTimes(2);
  });

  it('offers to try again when the buttons failed to load', async () => {
    buttons.list.mockRejectedValueOnce(offline);
    const { result } = await renderDetails();
    await waitFor(() => {
      expect(result.current.loadFailure).toBe('buttons');
    });
    expect(result.current.isLoaded).toBe(false);

    await act(async () => {
      result.current.retry();
    });

    await waitFor(() => {
      expect(result.current.isLoaded).toBe(true);
    });
    expect(result.current.loadFailure).toBeNull();
    expect(result.current.buttons).toEqual([power]);
  });

  it('offers to try again when the remotes failed to load', async () => {
    remotes.list.mockRejectedValueOnce(offline);
    const { result } = await renderDetails();
    await waitFor(() => {
      expect(result.current.loadFailure).toBe('remote');
    });
    expect(result.current.isMissing).toBe(false);

    await act(async () => {
      result.current.retry();
    });

    await waitFor(() => {
      expect(result.current.isLoaded).toBe(true);
    });
    expect(result.current.remote).toEqual(ac);
  });

  it('deletes a button; the list drops it once the server agrees', async () => {
    buttons.delete.mockResolvedValueOnce(undefined);
    const { result } = await renderDetails();
    await waitFor(() => {
      expect(result.current.isLoaded).toBe(true);
    });
    buttons.list.mockResolvedValue([]);

    await act(async () => {
      result.current.deleteButton(power.id);
    });

    await waitFor(() => {
      expect(result.current.buttons).toEqual([]);
    });
    expect(buttons.delete).toHaveBeenCalledWith(power.id);
  });

  it('polls the devices every 30 seconds while shown, not after', async () => {
    jest.useFakeTimers();
    try {
      const { result, rerender } = await renderDetails();
      await waitFor(() => {
        expect(result.current.device).toEqual(desk);
      });
      await act(async () => {
        jest.advanceTimersByTime(DEVICE_LIST_REFETCH_MS);
      });
      await waitFor(() => {
        expect(devices.list).toHaveBeenCalledTimes(2);
      });

      jest.mocked(useIsFocused).mockReturnValue(false);
      await rerender({});
      await act(async () => {
        jest.advanceTimersByTime(DEVICE_LIST_REFETCH_MS * 3);
      });

      expect(devices.list).toHaveBeenCalledTimes(2);
    } finally {
      jest.useRealTimers();
    }
  });
});
