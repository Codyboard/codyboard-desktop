/// <reference types="vite/client" />

import type { CodyboardAPI } from "../shared/hid";

declare global {
  interface Window {
    codyboard: CodyboardAPI;
  }
}

export {};
