// ═══════════════════════════════════════
// P2P
// ═══════════════════════════════════════
let peer = null,
  connections = [],
  sessionId = null,
  isHost = false,
  shareMode = "edit";
const NAMES = [
  "Ash",
  "Cedar",
  "Elm",
  "Fern",
  "Hazel",
  "Ivy",
  "Maple",
  "Oak",
  "Pine",
  "Rowan",
];
function randName() {
  return NAMES[Math.floor(Math.random() * NAMES.length)];
}
let peerLabels = {};

function startSession() {
  document.getElementById("share-generate-section").style.display =
    "none";
  isHost = true;
  peer = new Peer(undefined, { debug: 0 });
  peer.on("open", (id) => {
    sessionId = id;
    const link = buildShareLink(id, shareMode);
    document.getElementById("share-link-display").textContent = link;
    document.getElementById("share-link-section").style.display = "block";
    showSyncBar("Waiting for guests", "connecting");
  });
  peer.on("connection", (conn) => handleIncoming(conn));
  peer.on("error", (e) => showToast("Connection error: " + e.type));
}

function buildShareLink(id, mode) {
  return (
    window.location.href.split("?")[0] + "?join=" + id + "&mode=" + mode
  );
}

function handleIncoming(conn) {
  const label = randName();
  peerLabels[conn.peer] = label;
  conn.on("open", () => {
    connections.push(conn);
    conn.send({ type: "FULL_STATE", state, shareMode });
    updateSyncBar();
    showToast(label + " joined");
  });
  conn.on("data", (msg) => handleMessage(msg, conn));
  conn.on("close", () => {
    connections = connections.filter((c) => c !== conn);
    delete peerLabels[conn.peer];
    updateSyncBar();
    showToast(label + " left");
  });
}

function joinSession(hostId, mode) {
  shareMode = mode;
  showJoinScreen(
    "Connecting to tree",
    "Establishing a direct peer-to-peer connection. No server sees your family data.",
  );
  peer = new Peer(undefined, { debug: 0 });
  peer.on("open", () => {
    const conn = peer.connect(hostId, { reliable: true });
    conn.on("open", () => {
      connections.push(conn);
      conn.on("data", (msg) => handleMessage(msg, conn));
      conn.on("close", () => {
        connections = connections.filter((c) => c !== conn);
        showSyncBar(
          "Host ended the session — your copy is saved",
          "disconnected",
        );
        showToast("Session ended. Tree saved locally.");
      });
    });
    conn.on("error", () =>
      showJoinScreen(
        "Could not connect",
        "The session may have ended, or the link has expired.",
        true,
      ),
    );
  });
  peer.on("error", () =>
    showJoinScreen(
      "Could not connect",
      "The session may have ended, or the link has expired.",
      true,
    ),
  );
}

function handleMessage(msg, fromConn) {
  if (msg.type === "FULL_STATE") {
    state = msg.state;
    shareMode = msg.shareMode;
    saveState();
    render();
    const canEdit = shareMode === "edit";
    showSyncBar(
      canEdit ? "Connected — you can edit" : "Connected — view only",
      "connected",
    );
    updateSyncBar();
    updateEditAccess();
    hideJoinScreen();
    showToast("Tree loaded");
  } else if (msg.type === "STATE_UPDATE") {
    state = msg.state;
    saveState();
    render();
    if (currentView === "gen") renderGenView();
    if (currentView === "list") renderListView();
  }
}

function broadcast() {
  const msg = { type: "STATE_UPDATE", state };
  connections.forEach((c) => {
    if (c.open) c.send(msg);
  });
}

function stopSession() {
  if (peer) {
    peer.destroy();
    peer = null;
  }
  connections = [];
  sessionId = null;
  isHost = false;
  document.getElementById("sync-bar").classList.remove("visible");
  updateEditAccess();
  showToast("Session ended");
}

function showSyncBar(text, status) {
  const bar = document.getElementById("sync-bar");
  bar.classList.add("visible");
  document.getElementById("sync-status-text").textContent = text;
  const dot = document.getElementById("sync-dot");
  dot.className =
    "sync-dot" +
    (status === "connecting"
      ? " connecting"
      : status === "disconnected"
        ? " disconnected"
        : "");
  const badge = document.getElementById("sync-badge");
  badge.textContent = shareMode === "edit" ? "Edit" : "View only";
  badge.className =
    "sync-badge " + (shareMode === "edit" ? "edit" : "view");
}

function updateSyncBar() {
  const el = document.getElementById("sync-peers");
  el.innerHTML = "";
  Object.values(peerLabels).forEach((name) => {
    const chip = document.createElement("div");
    chip.className = "peer-chip";
    chip.textContent = name;
    el.appendChild(chip);
  });
  if (connections.length > 0) {
    const n = connections.length;
    showSyncBar(
      isHost
        ? n + " guest" + (n > 1 ? "s" : "") + " connected"
        : "Connected",
      "connected",
    );
  }
}

function updateEditAccess() {
  const canEdit = !peer || isHost || shareMode === "edit";
  const btn = document.getElementById("tb-add");
  btn.disabled = !canEdit;
}

function showJoinScreen(title, desc, error = false) {
  const s = document.getElementById("join-screen");
  s.classList.add("visible");
  document.getElementById("join-title").textContent = title;
  document.getElementById("join-desc").textContent = desc;
  document.getElementById("join-spinner").style.display = error
    ? "none"
    : "block";
  document.getElementById("join-actions").style.display = error
    ? "block"
    : "none";
}
function hideJoinScreen() {
  document.getElementById("join-screen").classList.remove("visible");
}
function dismissJoin() {
  hideJoinScreen();
}

// Share modal
let selectedShareMode = "edit";
function openShareModal() {
  document.getElementById("share-link-section").style.display = "none";
  document.getElementById("share-generate-section").style.display =
    "block";
  selectShareMode("edit");
  if (sessionId) {
    document.getElementById("share-link-display").textContent =
      buildShareLink(sessionId, shareMode);
    document.getElementById("share-link-section").style.display = "block";
    document.getElementById("share-generate-section").style.display =
      "none";
  }
  document.getElementById("modal-share").style.display = "flex";
}
function selectShareMode(m) {
  selectedShareMode = m;
  shareMode = m;
  document
    .getElementById("mode-edit-btn")
    .classList.toggle("selected", m === "edit");
  document
    .getElementById("mode-view-btn")
    .classList.toggle("selected", m === "view");
  document.getElementById("share-mode-warn").textContent =
    m === "edit" ? "edit" : "view";
}
function copyShareLink() {
  navigator.clipboard
    .writeText(document.getElementById("share-link-display").textContent)
    .then(() => showToast("Link copied"));
}

function checkJoinParam() {
  const params = new URLSearchParams(window.location.search);
  const joinId = params.get("join");
  const mode = params.get("mode") || "edit";
  if (joinId) {
    window.history.replaceState({}, "", window.location.pathname);
    joinSession(joinId, mode);
  }
}
