<p align="center">
  <img width="340" src="legacy/firmware/assets/logo-black.png#gh-light-mode-only" alt="AirRemote Logo">
  <img width="340" src="legacy/firmware/assets/logo-white.png#gh-dark-mode-only" alt="AirRemote Logo">
</p>
<h2 align="center">AirRemote V2 ⚡</h2>
<p align="center">
    <a href="/LICENSE"><img alt="GPL-V3.0 License" src="https://img.shields.io/badge/License-GPLv3-orange.svg"></a>
</p><br>

Turn your old remote-controlled devices into smart devices! AirRemote captures the infrared (IR) signals of any remote control and lets you replay them remotely, from a web interface or on a schedule.

## 🚧 Status

AirRemote V2 is being rewritten from scratch: the backend first, then the firmware, then the frontend. The new code lives in `backend/`, `firmware/` and `frontend/` as each part is built.

The original V1 code is kept for reference in [`legacy/`](legacy) until its V2 replacement is done, and is tagged [`v1-final`](https://github.com/jugeekuz/AirRemote-V2/tree/v1-final).

| Folder | What it is | Previously |
| --- | --- | --- |
| [`legacy/frontend/`](legacy/frontend) | The V1 web interface | [AirRemote-Frontend](https://github.com/jugeekuz/AirRemote-Frontend) |
| [`legacy/backend/`](legacy/backend) | The V1 serverless API | [AirRemote-Backend](https://github.com/jugeekuz/AirRemote-Backend) |
| [`legacy/firmware/`](legacy/firmware) | The V1 ESP32 PlatformIO firmware | [AirRemote-Embedded](https://github.com/jugeekuz/AirRemote-Embedded) |

The full commit history of all three repositories is preserved here.

## 📜 License

AirRemote is licensed under the [GNU General Public License v3.0](LICENSE).
