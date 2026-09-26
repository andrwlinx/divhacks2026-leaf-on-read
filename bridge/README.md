# Arduino bridge

Forwards the tree's real soil readings from the Arduino (see `../leafonread_firmware_code/`) to the Leaf on Read API.

The firmware prints one JSON record per line over USB at 115200 baud: telemetry every 2 s with a calibrated
`moisture_avg` (0–100 from two soil sensors), plus events such as `gus_petted` and `watering_detected`. The bridge:

- posts each telemetry line to `POST /readings` as Gus's sensor (`gus-demo`), stamped with the laptop's clock
- posts events to `POST /sensors/gus-demo/events` (Gus tells his crew about a pat or a watering)
- auto-detects the Arduino's USB port and reconnects if it's unplugged

While real readings arrive, the API pauses its simulated sensor and the app shows **Live from the sensor**. If the
board goes quiet for ~10 s, the simulator (and the app's demo buttons) take over again.

```sh
npm install
npm start                                   # auto-detect the Arduino
SERIAL_PORT=/dev/cu.usbmodem1101 npm start  # or pick the port
LEAF_API_URL=https://<your-api> npm start   # default http://localhost:3000
npm run replay < recorded.jsonl             # replay recorded lines without hardware
```

Close the Arduino IDE's Serial Monitor first; only one program can hold the port.
