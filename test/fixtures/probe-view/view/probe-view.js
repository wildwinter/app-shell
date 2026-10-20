// The probe view: app-shell's test view for hosts (README v0.58). Plain JS that
// speaks the view protocol itself, so it needs no bundle: it shows the
// selection's innermost node and its `note`, and a button writes the note.
const API = 1;
const PORT = "wildwinter-view:port";
let port = null;
let nextId = 1;
const waiting = new Map();

const request = (op, args) => new Promise((resolve, reject) => {
  const id = nextId++;
  waiting.set(id, { resolve, reject });
  port.postMessage({ t: "request", id, op, args });
});

class ProbeView extends HTMLElement {
  connectedCallback() {
    this.innerHTML = "<p data-probe=\"status\">Waiting for the app...</p>"
      + "<p data-probe=\"label\"></p><p data-probe=\"note\"></p>"
      + "<button data-probe=\"write\" disabled>Write a note</button>";
    this.querySelector("[data-probe=write]").addEventListener("click", () => void this.write());
  }

  set(name, text) { this.querySelector(`[data-probe=${name}]`).textContent = text; }

  async show() {
    const sel = await request("selection", {});
    this.node = sel.path[0] ?? null;
    if (!this.node) { this.set("label", "Nothing selected"); this.set("note", ""); return; }
    const node = await request("node", { id: this.node.id });
    this.set("label", node ? node.label : "Gone");
    this.set("note", node?.ext?.probe?.note ?? "");
  }

  async write() {
    if (!this.node) return;
    try {
      await request("write", { label: "Probe note", edits: [{ node: this.node.id, field: "note", value: `probed ${new Date().toISOString()}` }] });
    } catch (e) { this.set("status", e.message); }
  }

  welcome(msg) {
    this.set("status", `${msg.host}: ${msg.extension.id} ${msg.extension.version}`);
    this.querySelector("[data-probe=write]").disabled = msg.writable.readOnly;
    for (const [k, v] of Object.entries(msg.theme.tokens)) document.documentElement.style.setProperty(k, v);
    void this.show();
  }
}
customElements.define("probe-view", ProbeView);

window.addEventListener("message", (e) => {
  const ours = e.data === PORT || (e.data && e.data.type === PORT);
  if (e.source !== window || !ours || !e.ports[0]) return;
  port = e.ports[0];
  port.onmessage = ({ data }) => {
    const view = document.querySelector("probe-view");
    if (data.t === "welcome") view.welcome(data);
    else if (data.t === "refused") view.set("status", data.message);
    else if (data.t === "reply") {
      const p = waiting.get(data.id);
      waiting.delete(data.id);
      if (p) data.ok ? p.resolve(data.value) : p.reject(new Error(data.refusal.message));
    } else if (data.t === "event" && (data.name === "changed" || data.name === "selection")) void view.show();
    else if (data.t === "event" && data.name === "writable") view.querySelector("[data-probe=write]").disabled = data.value.readOnly;
  };
  port.postMessage({ t: "hello", api: API });
});
