# Codyboard Desktop Agent Notes

## Tooling

- Use `pnpm` exclusively for JavaScript dependencies and scripts. Do not use npm or Yarn.
- Use `uv` instead of `pip` for Python work.

## Architecture

- The desktop shell is Electron + React + TypeScript.
- macOS keyboard capture and rewriting belongs in the Swift native helper.
- Keep native capture alive for the full Electron app lifecycle, including while the main window is hidden and only the system tray remains.
- The renderer API is shaped around `getHID(filter)` returning a scoped HID connection with `hid.on(...)`-style event subscription.
- `HIDFilter.type` currently means `CGEventField.keyboardEventKeyboardType`; Codyboard Presenter uses type `40` (`46` is the user's Magic Keyboard).
- A keyboard type cannot uniquely identify multiple physical devices. Future per-device selection must use IOHID identity such as registry ID, vendor/product IDs, or serial number.

## Current Experiment

- The current React + Tailwind + shadcn-style UI is a disposable diagnostic shell and will be rewritten. Keep it minimal.
- For keyboard type `40`, when the app with bundle identifier `com.openai.codex` is frontmost:
  - Left arrow (`123`) becomes Command-B (`11` + Command).
  - Down arrow (`125`) becomes Command-J (`38` + Command).
- For keyboard type `40` in other frontmost apps:
  - Left arrow (`123`) becomes L (`37`).
  - Right arrow (`124`) becomes R (`15`).
- All other events pass through unchanged.
