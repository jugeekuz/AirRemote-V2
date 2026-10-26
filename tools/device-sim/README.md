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
| `/press [t1,t2,…]` | Answers a read in progress with a sample NEC-shaped IR code, or with the given timings in µs (comma-separated integers). |
| `/pongs on\|off`   | Answers the server's pings or not; off gets it dropped by the heartbeat. |
| `/send-fails on\|off` | Makes the device answer a `sendIr` with `SEND_FAILED` instead of confirming it. |
| `/status`          | MAC, server, state, pending code, pending read, pongs, send failures.       |
| `/quit`            | Disconnects and exits (also Ctrl+C, Ctrl+D).                  |

## Enrolling it

Run `/enroll`, then, as the owner, with the code it shows:

```sh
TOKEN=$(curl -s localhost:3000/auth/login -H 'content-type: application/json' \
  -d '{"email":"you@example.com","password":"…"}' | jq -r .accessToken)
DEVICE_ID=$(curl -s localhost:3000/devices -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d '{"macAddress":"AA:BB:CC:DD:EE:01","pairingCode":"XXXX-XXXX","name":"Desk"}' | jq -r .id)
```

The device connects on its own at its next retry (within 5 s); wait for
`enrolled ✓ connected` before learning a button.

## Learning a button

The backend sends a connected device `readIr`; the mock logs `listening for
an IR code (15 s)` and waits, as a real device would. With the device
enrolled and connected (`$TOKEN` and `$DEVICE_ID` come from the enrolling
commands above):

```sh
REMOTE=$(curl -s localhost:3000/devices/$DEVICE_ID/remotes -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' -d '{"name":"TV","type":"smart_tv"}' | jq -r .id)
LOCATION=$(curl -si localhost:3000/remotes/$REMOTE/buttons -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' -d '{"name":"Power"}' | tr -d '\r' | awk 'tolower($1)=="location:" {print $2}')
echo $LOCATION   # 202, /device-commands/<id>
# type /press in the simulator, then:
curl -s localhost:3000$LOCATION -H "authorization: Bearer $TOKEN"
```

Type `/press` in the simulator to send the code (or `/press 9000,4500,560`
for your own timings); polling then answers `succeeded` with the button. If
you do nothing for 15 s the mock sends `READ_TIMEOUT` itself and the poll
answers `failed` (`IR_READ_TIMEOUT`). A second read while one is pending is
answered `BUSY`; `/status` shows the pending read and its time left.

## Listing and pressing a button

Pressing sends the button's saved code to the device: the mock logs `sending
an IR code (N timings)` and confirms after 100 ms. With the button learned
above (`$TOKEN` and `$REMOTE` are set):

```sh
curl -s localhost:3000/devices -H "authorization: Bearer $TOKEN"
curl -s localhost:3000/remotes -H "authorization: Bearer $TOKEN"
BUTTON=$(curl -s localhost:3000/remotes/$REMOTE/buttons -H "authorization: Bearer $TOKEN" | jq -r '.[0].id')
PRESS=$(curl -si -X POST localhost:3000/buttons/$BUTTON/press -H "authorization: Bearer $TOKEN" \
  | tr -d '\r' | awk 'tolower($1)=="location:" {print $2}')
echo $PRESS   # 202, /device-commands/<id>
curl -s localhost:3000$PRESS -H "authorization: Bearer $TOKEN"
```

The poll answers `succeeded` once the device has confirmed (poll again if it
still says `pending`). Type `/send-fails on` in the simulator and press again:
the device answers `SEND_FAILED` and the poll answers `failed`
(`IR_SEND_FAILED`). `/send-fails off` restores normal behaviour. A press
while the device is listening for a read is answered `BUSY`.
