import { request } from 'node:https';
import { DEVICE_SUBPROTOCOL } from '@airremote/contracts';
import WebSocket from 'ws';
import type { Clock, OpenResult, Transport } from './device';
import { describeTransportError } from './format';
import type { Identity } from './identity';

export const systemClock: Clock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (handle) => clearTimeout(handle as NodeJS.Timeout),
};

function parseBody(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** The device listener over real mTLS: `node:https` for pairing, `ws` for the socket. */
export function createNodeTransport({
  server,
  identity,
}: {
  server: string;
  identity: Identity;
}): Transport {
  const { ca, cert, key } = identity;
  const socketUrl = new URL('/ws', server);
  socketUrl.protocol = 'wss:';

  return {
    postPairingCode() {
      return new Promise((resolve, reject) => {
        // No body and no Content-Type: the listener refuses an empty JSON body.
        const outgoing = request(
          new URL('/pairing-code', server),
          { method: 'POST', ca, cert, key, agent: false },
          (response) => {
            const chunks: Buffer[] = [];
            response.on('data', (chunk: Buffer) => chunks.push(chunk));
            response.on('error', (error) =>
              reject(new Error(describeTransportError(error))),
            );
            response.on('end', () =>
              resolve({
                status: response.statusCode ?? 0,
                body: parseBody(Buffer.concat(chunks).toString('utf8')),
              }),
            );
          },
        );
        outgoing.on('error', (error) =>
          reject(new Error(describeTransportError(error))),
        );
        outgoing.end();
      });
    },

    openSocket(events) {
      return new Promise<OpenResult>((resolve) => {
        const socket = new WebSocket(socketUrl, [DEVICE_SUBPROTOCOL], {
          ca,
          cert,
          key,
          // The device decides whether to answer pings (`/pongs`).
          autoPong: false,
        });
        let opened = false;
        let settled = false;
        const settle = (result: OpenResult) => {
          if (settled) return;
          settled = true;
          resolve(result);
        };

        socket.once('open', () => {
          opened = true;
          settle({
            ok: true,
            socket: {
              send: (text) => socket.send(text),
              pong: () => socket.pong(),
              close: (code, reason) => socket.close(code, reason),
            },
          });
        });
        socket.once('unexpected-response', (_request, response) => {
          settle({ ok: false, status: response.statusCode ?? 0 });
          response.resume();
          socket.terminate();
        });
        // After `open`, errors end in a `close`, which the device reports.
        socket.on('error', (error: NodeJS.ErrnoException) => {
          if (!opened)
            settle({ ok: false, error: describeTransportError(error) });
        });
        socket.on('message', (data, isBinary) => {
          const buffer = Array.isArray(data)
            ? Buffer.concat(data)
            : Buffer.from(data as ArrayBuffer);
          events.message(
            isBinary
              ? `<binary frame, ${buffer.length} bytes>`
              : buffer.toString('utf8'),
          );
        });
        socket.on('ping', () => events.ping());
        socket.on('close', (code, reason) => {
          if (opened) events.close(code, reason.toString('utf8'));
        });
      });
    },
  };
}
