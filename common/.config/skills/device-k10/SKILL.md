---
name: device-k10
description: UNIHIKER K10 (DFR0992, ESP32-S3) board reference — specs, limits, flashing, gotchas. Use ONLY when user mentions K10/UNIHIKER; do not re-research the board.
---

# UNIHIKER K10 Device Reference

All specs verified against DFRobot wiki + UNIHIKER docs (Aug 2026). Do not re-research.

## Identity

- **Board**: DFRobot UNIHIKER K10, SKU `DFR0992-EN`
- **Docs**: https://www.unihiker.com/wiki/K10/get-started/ - https://wiki.dfrobot.com/dfr0992-en/
- **Schematics**: https://dfimg.dfrobot.com/wiki/24709/DFR0992-EN_unihiker-k10_schematics_V1.0.pdf
- **STP/3D files**: DFRobot wiki Download page
- Owner has: bare board only. No TF card, no LiPo, no expansion board.

## Hardware

| Part | Detail |
|---|---|
| MCU | ESP32-S3 **N16R8**: dual-core Xtensa LX7 @ 240 MHz, 512 KB SRAM, 384 KB ROM, **16 MB flash, 8 MB PSRAM** |
| Display | 2.8" 240x320 ILI9341 color LCD, **NOT touch** - input = buttons A/B |
| Camera | GC2145, 2 MP, 80 deg FOV, **mounted on the BACK of the board** (BOOT button also on back) |
| Audio | 2x MEMS mics + 2 W speaker |
| Sensors | AHT20 temp/humidity (-40..85 C, +-0.3 C, 0-100%RH), LTR303ALS light (0-64k lux), SC7A20H accelerometer (+-2/4/8/16 g) |
| LEDs | 3x WS2812 RGB |
| Buttons | A, B, RST, BOOT |
| Radio | Wi-Fi **2.4 GHz only** (b/g/n, STA/AP/STA+AP) + Bluetooth 5 + BT mesh |
| Power | USB-C 5 V; PH2.0 2-pin battery in (3.0-6.0 V, 3.7 V LiPo or 3x AA); ~200 mA operating |
| Storage | Self-ejecting micro-TF slot (FAT32, <=32 GB, genuine SanDisk recommended) |
| Expansion | PH2.0: 2x 3-pin full-function GPIO, 1x 4-pin I2C. Edge connector: **micro:bit compatible** (2x full GPIO, I2C, 15 digital IO) - most micro:bit expansion boards fit |
| Size | 51.6 x 83 mm |

## Orientation fact (resolves recurring confusion)

Camera on back + screen on front = **phone layout**. Screen toward you -> camera sees scene ahead, screen shows live preview + overlays simultaneously (factory face-detection demo proves it). Camera "covered" only when board flat on desk - prop upright like phone.

## Programming platforms

| Platform | OS support | Notes |
|---|---|---|
| Mind+ (graphical, also trains TinyML models) | **Windows only** | factory restore flow lives here too |
| Arduino IDE | mac/linux/win | |
| PlatformIO | all | |
| MicroPython | all | docs have code examples |

## On-device AI - verified limits (don't re-derive)

**Memory wall**: 8 MB PSRAM / 512 KB SRAM / ~10 MB free flash.
- Whisper Tiny 39M params = ~42 MB int8. Moonshine Tiny 27M = ~27 MB. Neither fits. Checked HF: no transcription-grade model fits ESP32-S3. Compute ~100x short too (LX7 @ 240 MHz, low GOPS int8).
- **What DOES run on-device**: WakeNet wake words (WakeNet9/10), MultiNet command recognition (**up to 200 custom commands, English + Chinese, offline**), AFE (AEC/noise suppression/VAD, 2-mic), VAD, KWS/intent models (50-500 KB, e.g. Edge Impulse, microWakeWord, HF speech-commands class).
- **Free-form dictation = impossible on-device.** Every ESP32 assistant (xiaozhi, ESP-CLAW) does: wake word local -> stream Opus over WebSocket/MQTT+UDP -> server STT -> LLM -> server TTS -> speaker.

**K10 angle**: on-board STT = wake words + <=200 fixed commands (already in factory firmware). Conversational = needs server (cloud or LAN self-host).

## Firmware options

1. **Factory firmware** (preinstalled, non-destructive to keep): button B cycles modes - face detection (camera+screen live), voice recognition (wake "Jarvis"/"Hi Telly", commands like "turn on the light"), sensor plant demo, QR tutorial. Music playback mode needs TF card with `music.wav`.
2. **xiaozhi AI voice assistant** - best quick win, zero code:
   - Project: https://github.com/78/xiaozhi-esp32 (ESP-IDF). K10 support by @HonestQiao.
   - DFRobot prebuilt English firmware V2.1.0 + flash instructions: https://www.unihiker.com/wiki/K10/Playground/XiaozhiAI/
   - Flash: hold BOOT (back) while plugging USB-C -> flash bin at address **0x00**. Mac/Linux: web tool https://igrr.github.io/esp-launchpad/ (DIY page). Windows: ESP Flash Download Tool (ERASE then START).
   - Config: connect to board's Wi-Fi hotspot -> set SSID -> device shows 6-digit code -> bind at https://xiaozhi.me/ -> pick LLM (DeepSeek etc.). Wake words "Jarvis"/"Hi Telly".
   - Buttons in xiaozhi: A short = interrupt/wake, long 1 s = volume up; B short = interrupt/wake, long = volume down.
   - v2.x: custom wake word/theme/face via xiaozhi.me "Customize" -> generates `assets.bin` (hardware profile: ESP32-S3, 240x320).
   - Self-host server option (privacy, LAN-only): https://github.com/xinnan-tech/xiaozhi-esp32-server - pair with faster-whisper/Moonshine + Ollama + Piper on a Mac.
3. **ESP-CLAW AI agent** - Espressif agent firmware, K10 is official reference hardware. More experimental.
4. **Custom Arduino/PlatformIO/MicroPython** - full control; ESP-SR for offline voice, ESP-WHO/Edge Impulse for vision, custom TinyML.
5. **Card-reader firmware** - special bin turns K10 into USB mass-storage for TF card (wiki get-started).

## Flashing procedure (generic)

1. Hold **BOOT** (back of board), plug USB-C, release after port appears.
2. Flash at address `0x00` (prebuilt bins) or via IDE (Arduino/PlatformIO handle bootloader).
3. RST to boot.
4. **Nothing here is destructive to hardware** - factory firmware restorable via Mind+ "Restore Initial Settings" (hold BOOT while connecting, then RST).

## Gotchas

- Wi-Fi 2.4 GHz only - won't join 5 GHz SSIDs (common first-failure cause).
- Screen not touch. All UI interaction = 2 buttons or voice.
- TF card: >32 GB must be reformatted FAT32; no-name cards cause crashes.
- Camera fixed-focus 2 MP - fine for QR/face/color, not fine text at distance.
- PSRAM 8 MB = AI ceiling - do not port "run Whisper on ESP32" ideas; they don't exist for a reason.
- Flashing overwrites firmware; keep factory-firmware restore instructions handy (Mind+ required).

## Project ideas already vetted (ranked)

1. xiaozhi voice assistant (flash prebuilt, ~15 min) -> later self-host server
2. TinyML vision: face detect (built-in), custom classifier via Edge Impulse/Mind+ (pet/plant/gesture)
3. Offline MultiNet voice controller (200 commands -> GPIO/screen/LED, no network)
4. IoT env node: AHT20+light -> MQTT -> Home Assistant/Grafana
5. Accelerometer games/pedometer
6. Web radio / audio player (needs TF for files)
7. ESP-CLAW agent experiments
