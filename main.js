// main.js

const messagesEl = document.getElementById("messages");
const chatRootEl = document.getElementById("chat-root");
const authOverlayEl = document.getElementById("auth-overlay");
const usernameInput = document.getElementById("username-input");

const enterChatBtn = document.getElementById("enter-chat-btn");
const selfNameEl = document.getElementById("self-name");
const selfSigmaTagEl = document.getElementById("self-sigma-tag");
const messageInput = document.getElementById("message-input");
const sendBtn = document.getElementById("send-btn");
const imageInput = document.getElementById("image-input");
const mutedBannerEl = document.getElementById("muted-banner");

let room = null;
let displayName = "";
let isSigma = false;
let messages = [];
let isMuted = false;

function nowTime() {
  const d = new Date();
  const hh = d.getHours().toString().padStart(2, "0");
  const mm = d.getMinutes().toString().padStart(2, "0");
  return `${hh}:${mm}`;
}

function addMessage(msg) {
  messages.push(msg);

  const row = document.createElement("div");
  row.classList.add("message-row");
  if (msg.type === "system") {
    row.classList.add("system");
  } else if (msg.own) {
    row.classList.add("own");
  }

  const bubble = document.createElement("div");
  bubble.classList.add("bubble");

  if (msg.type === "system") {
    const span = document.createElement("span");
    span.textContent = msg.text;
    bubble.appendChild(span);
    row.appendChild(bubble);
  } else {
    const header = document.createElement("div");
    header.classList.add("bubble-header");

    const nameEl = document.createElement("span");
    nameEl.classList.add("username");
    nameEl.textContent = msg.username;
    header.appendChild(nameEl);

    if (msg.isSigma) {
      const sigmaTag = document.createElement("span");
      sigmaTag.classList.add("sigma-tag");
      sigmaTag.textContent = "SIGMA";
      header.appendChild(sigmaTag);
    }

    const meta = document.createElement("div");
    meta.classList.add("meta");
    const timeEl = document.createElement("span");
    timeEl.classList.add("timestamp");
    timeEl.textContent = msg.time || nowTime();
    meta.appendChild(timeEl);

    header.appendChild(meta);
    bubble.appendChild(header);

    if (msg.text && msg.text.trim() !== "") {
      const textEl = document.createElement("div");
      textEl.classList.add("text");
      textEl.textContent = msg.text;
      bubble.appendChild(textEl);
    }

    if (msg.imageUrl) {
      const wrap = document.createElement("div");
      wrap.classList.add("image-wrapper");
      const img = document.createElement("img");
      img.src = msg.imageUrl;
      img.alt = "image";
      wrap.appendChild(img);
      bubble.appendChild(wrap);
    }

    row.appendChild(bubble);
  }

  messagesEl.appendChild(row);
  messagesEl.parentElement.scrollTop = messagesEl.parentElement.scrollHeight;
}

function setMutedState(muted) {
  isMuted = !!muted;
  if (isMuted) {
    messageInput.disabled = true;
    sendBtn.disabled = true;
    mutedBannerEl.classList.remove("hidden");
  } else {
    messageInput.disabled = false;
    sendBtn.disabled = false;
    mutedBannerEl.classList.add("hidden");
  }
}

async function initRoom() {
  room = new WebsimSocket();
  await room.initialize();

  // Ensure muted state container exists
  if (!room.roomState.muted) {
    room.updateRoomState({ muted: {} });
  }

  room.subscribeRoomState((state) => {
    const mutedMap = state.muted || {};
    const myMuted = !!mutedMap[displayName];
    setMutedState(myMuted);
  });

  room.onmessage = (event) => {
    const data = event.data;
    switch (data.type) {
      case "connected":
      case "disconnected":
        // optional system messages, but keep quiet to reduce noise
        break;
      case "chat-text": {
        if (!data.username) return;
        addMessage({
          type: "user",
          username: data.username,
          isSigma: !!data.isSigma,
          text: data.text,
          time: data.time,
          own: data.clientId === room.clientId,
        });
        break;
      }
      case "chat-image": {
        if (!data.username || !data.url) return;
        addMessage({
          type: "user",
          username: data.username,
          isSigma: !!data.isSigma,
          imageUrl: data.url,
          text: data.caption || "",
          time: data.time,
          own: data.clientId === room.clientId,
        });
        break;
      }
      case "system": {
        if (!data.text) return;
        addMessage({
          type: "system",
          text: data.text,
          time: data.time,
        });
        break;
      }
      default:
        break;
    }
  };

  // Broadcast presence with name & role
  room.updatePresence({
    username: displayName,
    isSigma,
  });

  // Show a small system join notice
  room.send({
    type: "system",
    text: `${displayName} joined`,
    time: nowTime(),
  });
}

async function handleSendText() {
  if (!room || isMuted) return;
  const raw = messageInput.value.trim();
  if (!raw) return;

  // Secret code: grant SIGMA role locally (no message sent)
  if (raw === "code6766") {
    if (!isSigma) {
      isSigma = true;
      selfSigmaTagEl.classList.remove("hidden");
      // Update presence so others know you are SIGMA (but they never see the code message)
      room.updatePresence({
        username: displayName,
        isSigma: true,
      });
      // Optional local-only notice
      addMessage({
        type: "system",
        text: "You are now SIGMA.",
        time: nowTime(),
      });
    }
    messageInput.value = "";
    return;
  }

  // Command: mute [user]
  if (isSigma && raw.toLowerCase().startsWith("mute ")) {
    const targetName = raw.slice(5).trim();
    if (!targetName) {
      messageInput.value = "";
      return;
    }

    const currentMuted = room.roomState.muted || {};
    if (!currentMuted[targetName]) {
      room.updateRoomState({
        muted: {
          ...currentMuted,
          [targetName]: true,
        },
      });

      room.send({
        type: "system",
        text: `${targetName} was muted by ${displayName}`,
        time: nowTime(),
      });
    }

    messageInput.value = "";
    return;
  }

  const payload = {
    type: "chat-text",
    username: displayName,
    isSigma,
    text: raw,
    time: nowTime(),
    clientId: room.clientId,
  };

  room.send(payload);
  messageInput.value = "";
}

async function handleSendImage(file) {
  if (!room || isMuted || !file) return;
  try {
    const url = await window.websim.upload(file);
    room.send({
      type: "chat-image",
      username: displayName,
      isSigma,
      url,
      time: nowTime(),
      clientId: room.clientId,
    });
  } catch (e) {
    console.error("Image upload failed", e);
  }
}

// UI bindings

enterChatBtn.addEventListener("click", async () => {
  const name = (usernameInput.value || "").trim();
  if (!name) return;
  displayName = name;
  isSigma = false;

  selfNameEl.textContent = displayName;
  selfSigmaTagEl.classList.add("hidden");

  authOverlayEl.classList.add("hidden");
  chatRootEl.classList.remove("hidden");

  await initRoom();
  messageInput.focus();
});

usernameInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    enterChatBtn.click();
  }
});

sendBtn.addEventListener("click", () => {
  handleSendText();
});

messageInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    handleSendText();
  }
});

imageInput.addEventListener("change", () => {
  const file = imageInput.files && imageInput.files[0];
  if (!file) return;
  handleSendImage(file);
  imageInput.value = "";
});

