import { STATUS_CODES } from 'node:http';
import {
  deviceMessageSchema,
  pairingCodeResponseSchema,
} from '@airremote/contracts';
import { describeClose, pairingUri } from './format';

export type HttpResult = { status: number; body: unknown };

export type SocketEvents = {
  message(text: string): void;
  ping(): void;
  close(code: number, reason: string): void;
};

export type DeviceSocket = {
  send(text: string): void;
  pong(): void;
  close(code: number, reason: string): void;
};

export type OpenResult =
  | { ok: true; socket: DeviceSocket }
  /** The upgrade was refused over HTTP. */
  | { ok: false; status: number }
  /** A network or TLS failure, in plain words. */
  | { ok: false; error: string };

/** How the device reaches the device listener. `postPairingCode` rejects with a plain-words Error. */
export type Transport = {
  postPairingCode(): Promise<HttpResult>;
  openSocket(events: SocketEvents): Promise<OpenResult>;
};

export type Clock = {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
};

export type DeviceEvent =
  | { kind: 'sent'; text: string; dim?: boolean }
  | { kind: 'received'; text: string; dim?: boolean }
  | {
      kind: 'status';
      text: string;
      tone: 'info' | 'success' | 'error' | 'dim';
    }
  | { kind: 'pairing'; code: string; expiresAt: number; uri: string };

export type DeviceState =
  'offline' | 'connecting' | 'connected' | 'waiting-for-enrollment';

export type DeviceStatus = {
  mac: string;
  state: DeviceState;
  pongs: boolean;
  pendingCode: { code: string; expiresAt: number } | null;
};

export type Device = ReturnType<typeof createDevice>;

const FIRST_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 30_000;
const NORMAL_CLOSURE = 1000;

const httpStatus = (status: number) =>
  `${status} ${STATUS_CODES[status] ?? ''}`.trim();

/**
 * A simulated AirRemote: does what the real device does against the device
 * listener, and reports everything it sends, receives and decides as events.
 */
export function createDevice({
  mac,
  transport,
  clock,
  onEvent,
  enrollRetryMs = 5_000,
}: {
  mac: string;
  transport: Transport;
  clock: Clock;
  onEvent(event: DeviceEvent): void;
  enrollRetryMs?: number;
}) {
  let socket: DeviceSocket | null = null;
  let state: DeviceState = 'offline';
  let pongs = true;
  let pending: { code: string; expiresAt: number } | null = null;
  /** Whether an unexpected close or failed open schedules another attempt. */
  let reconnecting = false;
  let backoffMs = FIRST_BACKOFF_MS;
  /** Bumped whenever the plan changes, so in-flight opens from before are dropped. */
  let generation = 0;
  let reconnectTimer: unknown = null;
  let retryTimer: unknown = null;
  let expiryTimer: unknown = null;

  const status = (
    text: string,
    tone: 'info' | 'success' | 'error' | 'dim' = 'info',
  ) => onEvent({ kind: 'status', text, tone });

  function clearTimer(timer: unknown) {
    if (timer !== null) clock.clearTimeout(timer);
  }

  function clearTimers() {
    clearTimer(reconnectTimer);
    clearTimer(retryTimer);
    clearTimer(expiryTimer);
    reconnectTimer = retryTimer = expiryTimer = null;
  }

  function cancelEnrollment() {
    clearTimer(retryTimer);
    clearTimer(expiryTimer);
    retryTimer = expiryTimer = null;
    pending = null;
  }

  function scheduleReconnect() {
    if (!reconnecting) return;
    const delay = backoffMs;
    backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS);
    state = 'offline';
    status(`reconnecting in ${delay / 1000}s …`, 'dim');
    reconnectTimer = clock.setTimeout(() => {
      reconnectTimer = null;
      void open('reconnect');
    }, delay);
  }

  function notEnrolled() {
    reconnecting = false;
    state = 'offline';
    status('not enrolled — run /enroll', 'error');
  }

  /** Opens `/ws`. `enroll` attempts are quiet and never reconnect on failure. */
  async function open(
    mode: 'connect' | 'reconnect' | 'enroll',
  ): Promise<boolean> {
    const mine = generation;
    if (mode !== 'enroll') {
      state = 'connecting';
      status('connecting to /ws …', 'dim');
    }

    let current: DeviceSocket | null = null;
    const events: SocketEvents = {
      message(text) {
        if (current && socket === current) onEvent({ kind: 'received', text });
      },
      ping() {
        if (!current || socket !== current) return;
        onEvent({ kind: 'received', text: 'ping', dim: true });
        if (!pongs) return;
        current.pong();
        onEvent({ kind: 'sent', text: 'pong', dim: true });
      },
      close(code) {
        if (!current || socket !== current) return;
        socket = null;
        onEvent({ kind: 'received', text: `close ${describeClose(code)}` });
        scheduleReconnect();
      },
    };

    const result = await transport.openSocket(events);
    if (mine !== generation) {
      if (result.ok) result.socket.close(NORMAL_CLOSURE, 'superseded');
      return false;
    }

    if (result.ok) {
      current = socket = result.socket;
      state = 'connected';
      backoffMs = FIRST_BACKOFF_MS;
      reconnecting = true;
      if (mode === 'enroll') {
        cancelEnrollment();
        status('enrolled ✓ connected', 'success');
      } else {
        status('connected', 'success');
      }
      return true;
    }

    if ('status' in result) {
      onEvent({
        kind: 'received',
        text: httpStatus(result.status),
        ...(mode === 'enroll' ? { dim: true } : {}),
      });
      if (mode === 'enroll') return false;
      if (result.status === 403) {
        notEnrolled();
        return false;
      }
    } else {
      status(result.error, mode === 'enroll' ? 'dim' : 'error');
      if (mode === 'enroll') return false;
    }
    scheduleReconnect();
    return false;
  }

  function scheduleEnrollRetry() {
    retryTimer = clock.setTimeout(async () => {
      retryTimer = null;
      const mine = generation;
      const accepted = await open('enroll');
      if (!accepted && pending && mine === generation) scheduleEnrollRetry();
    }, enrollRetryMs);
  }

  /** A failed `/enroll` leaves the device as it was: connected, or reconnecting if it was. */
  function resumeAfterFailedEnroll() {
    if (socket) {
      state = 'connected';
      return;
    }
    state = 'offline';
    scheduleReconnect();
  }

  function closeSocket(reason: string) {
    const closing = socket;
    socket = null;
    closing?.close(NORMAL_CLOSURE, reason);
  }

  const device = {
    /** Powers up: tries `/ws` once, reconnecting with backoff unless refused. */
    start() {
      generation += 1;
      reconnecting = true;
      void open('connect');
    },

    /** Gets a pairing code, shows it, and waits until the owner has enrolled the device. */
    async enroll() {
      generation += 1;
      cancelEnrollment();
      clearTimer(reconnectTimer);
      reconnectTimer = null;
      const mine = generation;

      onEvent({ kind: 'sent', text: 'POST /pairing-code' });
      let response: HttpResult;
      try {
        response = await transport.postPairingCode();
      } catch (error) {
        if (mine !== generation) return;
        status((error as Error).message, 'error');
        resumeAfterFailedEnroll();
        return;
      }
      if (mine !== generation) return;
      onEvent({
        kind: 'received',
        text: `${httpStatus(response.status)} ${JSON.stringify(response.body)}`,
      });

      if (response.status === 409) {
        status('already enrolled');
        device.connect();
        return;
      }
      const issued = pairingCodeResponseSchema.safeParse(response.body);
      if (response.status !== 201 || !issued.success) {
        status('could not get a pairing code', 'error');
        resumeAfterFailedEnroll();
        return;
      }

      const { pairingCode, expiresAt } = issued.data;
      pending = { code: pairingCode, expiresAt: Date.parse(expiresAt) };
      reconnecting = false;
      if (!socket) state = 'waiting-for-enrollment';
      onEvent({
        kind: 'pairing',
        code: pairingCode,
        expiresAt: pending.expiresAt,
        uri: pairingUri(mac, pairingCode),
      });
      status(
        `waiting for enrollment, retrying /ws every ${enrollRetryMs / 1000}s …`,
        'dim',
      );

      expiryTimer = clock.setTimeout(
        () => {
          expiryTimer = null;
          generation += 1;
          cancelEnrollment();
          state = 'offline';
          status('pairing code expired — run /enroll again', 'error');
        },
        Math.max(0, pending.expiresAt - clock.now()),
      );
      scheduleEnrollRetry();
    },

    /** Opens `/ws` now and goes back to reconnecting on its own. */
    connect() {
      generation += 1;
      cancelEnrollment();
      clearTimer(reconnectTimer);
      reconnectTimer = null;
      if (socket) {
        status('already connected');
        return;
      }
      reconnecting = true;
      backoffMs = FIRST_BACKOFF_MS;
      void open('connect');
    },

    /** Like unplugging the network: closes and stops every retry. */
    disconnect() {
      generation += 1;
      reconnecting = false;
      clearTimers();
      pending = null;
      const wasConnected = socket !== null;
      closeSocket('disconnect');
      state = 'offline';
      status(wasConnected ? 'disconnected' : 'offline');
    },

    send(text: string) {
      if (!socket) {
        status('not connected', 'error');
        return;
      }
      onEvent({ kind: 'sent', text });
      socket.send(text);
    },

    /** Sends `{ type: 'error', code, message? }`, refused locally if the protocol would reject it. */
    sendError(code: string, message?: string) {
      const result = deviceMessageSchema.safeParse({
        type: 'error',
        code,
        ...(message === undefined ? {} : { message }),
      });
      if (!result.success) {
        const [issue] = result.error.issues;
        status(`invalid message: ${issue?.message ?? 'rejected'}`, 'error');
        return;
      }
      device.send(JSON.stringify(result.data));
    },

    setPongs(on: boolean) {
      pongs = on;
      status(`pongs ${on ? 'on' : 'off'}`);
    },

    status(): DeviceStatus {
      return { mac, state, pongs, pendingCode: pending };
    },

    /** Closes with 1000 and leaves nothing running, so the process can exit. */
    stop() {
      generation += 1;
      reconnecting = false;
      clearTimers();
      pending = null;
      closeSocket('quit');
      state = 'offline';
    },
  };
  return device;
}
