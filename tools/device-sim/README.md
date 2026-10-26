# AirRemote mock device

An interactive stand-in for a real AirRemote. It does what the device does
against the device listener — asks for a pairing code, shows it, waits to be
enrolled, keeps its WebSocket open, answers pings, reconnects — and logs
everything it sends and receives. It never acts as the user: enrolling it is
up to you.

## Start

```sh
scripts/dev-certs.sh                          # once: CA and server certificate
scripts/dev-certs.sh device AA:BB:CC:DD:EE:01 # once per simulated device
pnpm dev                                      # with the DEVICE_TLS_* lines in .env
pnpm device-sim --mac AA:BB:CC:DD:EE:01
```

Options: `--server` (default `https://localhost:8443`) and `--certs`
(default `certs/` at the repository root).

## Commands

| Command            | Does                                                          |
| ------------------ | ------------------------------------------------------------- |
| `/help`            | Lists the commands.                                           |
| `/enroll`          | Gets a pairing code, shows it as a QR code, retries `/ws` every 5 s until enrolled or the code expires. |
| `/connect`         | Opens the WebSocket now.                                      |
| `/disconnect`      | Closes it and stops reconnecting, like unplugging the network. |
| `/send <text>`     | Sends `<text>` as is, unvalidated — to test the server's handling of bad frames. |
| `/error <code> [message]` | Sends a valid `{ "type": "error", "code": …, "message": … }`, e.g. `/error READ_TIMEOUT`. |
| `/pongs on\|off`   | Answers the server's pings or not; off gets it dropped by the heartbeat. |
| `/status`          | MAC, server, state, pending code, pongs.                      |
| `/quit`            | Disconnects and exits (also Ctrl+C, Ctrl+D).                  |

## Enrolling it

Run `/enroll`, then, as the owner, with the code it shows:

```sh
TOKEN=$(curl -s localhost:3000/auth/login -H 'content-type: application/json' \
  -d '{"email":"you@example.com","password":"…"}' | jq -r .accessToken)
curl -s localhost:3000/devices -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d '{"macAddress":"AA:BB:CC:DD:EE:01","pairingCode":"XXXX-XXXX","name":"Desk"}'
```

The device connects on its own at its next retry.
