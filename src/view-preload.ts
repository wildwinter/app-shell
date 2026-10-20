// ---------------------------------------------------------------------------
// The view preload (tier 2 view extensions): the one preload a view window
// gets, built to dist/view-preload.cjs. It hands the view's MessagePort from
// main to the page and does nothing else: no bridge, no ipc a page can call.
// A sandboxed preload can require only electron, so the constants from
// view-protocol are inlined by the build.
// ---------------------------------------------------------------------------

import { ipcRenderer } from "electron";
import { VIEW_PORT_CHANNEL, VIEW_PORT_MESSAGE } from "./view-protocol.js";

ipcRenderer.on(VIEW_PORT_CHANNEL, (event) => {
  window.postMessage({ type: VIEW_PORT_MESSAGE }, "*", event.ports);
});
