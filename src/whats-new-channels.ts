// What's New's channels and launch state, shared by its two halves (whats-new.ts, whats-new-main.ts). Kept
// apart from both so main imports no DOM code and the renderer no electron.

/** The channels between the two halves. */
export const WHATS_NEW_CHANNELS = {
  /** renderer -> main (invoke): `WhatsNewState`. */
  state: "whatsNew:state",
  /** renderer -> main (send): the tickbox, true to show after updates. */
  setShow: "whatsNew:setShow",
  /** renderer -> main (send): the launch dialog was closed, so this update has been seen. */
  seen: "whatsNew:seen",
} as const;

/** What main knows at launch: this version, the one that ran before it, and the tickbox. With no `previous`,
 *  `existing` says whether this machine ran the app before What's New began remembering versions: then the
 *  update is this version's, so its notes show; otherwise it's a fresh install, and nothing does. */
export interface WhatsNewState {
  version: string;
  previous?: string;
  existing?: boolean;
  show: boolean;
}
