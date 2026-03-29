const BOT_TOKEN = "8646916487:AAFrpg9SE2hggyNahjCpRM3aIQFSjOxw-0g";
const ADMIN_ID = 8692561961; // replace with your real Telegram numeric user id
const WEBHOOK_SECRET = ""; // optional
const API_BASE = `https://api.telegram.org/bot${BOT_TOKEN}`;

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

async function tg(method, payload = {}) {
  const res = await fetch(`${API_BASE}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  return await res.json().catch(() => ({}));
}

function isPrivateChat(msg) {
  return msg?.chat?.type === "private";
}

function isGroupChat(msg) {
  return msg?.chat?.type === "group" || msg?.chat?.type === "supergroup";
}

function getText(msg) {
  return String(msg?.text || msg?.caption || "").trim();
}

function isAdmin(msg) {
  return Number(msg?.from?.id) === Number(ADMIN_ID);
}

async function relayEnabled(env) {
  const v = await env.STATE_KV.get(`relay:${ADMIN_ID}`);
  return v === "1";
}

async function setRelayEnabled(env, enabled) {
  const key = `relay:${ADMIN_ID}`;
  if (enabled) await env.STATE_KV.put(key, "1");
  else await env.STATE_KV.delete(key);
}

async function handleSwitch(env, msg) {
  const on = await relayEnabled(env);
  const next = !on;
  await setRelayEnabled(env, next);

  await tg("sendMessage", {
    chat_id: msg.chat.id,
    text: next ? "Relay mode ON" : "Relay mode OFF",
    reply_to_message_id: msg.message_id,
  });
}

async function sendMediaByType(chatId, msg) {
  if (msg.photo && Array.isArray(msg.photo) && msg.photo.length) {
    return tg("sendPhoto", {
      chat_id: chatId,
      photo: msg.photo[msg.photo.length - 1].file_id,
      caption: msg.caption || "",
    });
  }

  if (msg.animation?.file_id) {
    return tg("sendAnimation", {
      chat_id: chatId,
      animation: msg.animation.file_id,
      caption: msg.caption || "",
    });
  }

  if (msg.document?.file_id) {
    return tg("sendDocument", {
      chat_id: chatId,
      document: msg.document.file_id,
      caption: msg.caption || "",
    });
  }

  if (msg.sticker?.file_id) {
    return tg("sendSticker", {
      chat_id: chatId,
      sticker: msg.sticker.file_id,
    });
  }

  if (msg.video?.file_id) {
    return tg("sendVideo", {
      chat_id: chatId,
      video: msg.video.file_id,
      caption: msg.caption || "",
    });
  }

  if (msg.audio?.file_id) {
    return tg("sendAudio", {
      chat_id: chatId,
      audio: msg.audio.file_id,
      caption: msg.caption || "",
    });
  }

  if (msg.voice?.file_id) {
    return tg("sendVoice", {
      chat_id: chatId,
      voice: msg.voice.file_id,
      caption: msg.caption || "",
    });
  }

  if (msg.video_note?.file_id) {
    return tg("sendVideoNote", {
      chat_id: chatId,
      video_note: msg.video_note.file_id,
    });
  }

  return null;
}

async function relayAdminMessage(env, msg) {
  const chatId = msg.chat.id;

  await tg("deleteMessage", {
    chat_id: chatId,
    message_id: msg.message_id,
  });

  const text = getText(msg);

  if (msg.text) {
    await tg("sendMessage", {
      chat_id: chatId,
      text: msg.text,
      reply_to_message_id: msg.reply_to_message?.message_id || undefined,
    });
    return;
  }

  const mediaResult = await sendMediaByType(chatId, msg);
  if (mediaResult?.ok) return;

  if (text) {
    await tg("sendMessage", {
      chat_id: chatId,
      text,
      reply_to_message_id: msg.reply_to_message?.message_id || undefined,
    });
  }
}

async function handleUpdate(env, update) {
  const msg = update.message || update.edited_message;
  if (!msg || !msg.from) return;

  const text = getText(msg).toLowerCase();

  if (isAdmin(msg) && isPrivateChat(msg) && text.startsWith("/switch")) {
    await handleSwitch(env, msg);
    return;
  }

  if (!isAdmin(msg)) return;
  if (!(await relayEnabled(env))) return;
  if (!isGroupChat(msg)) return;

  if (text.startsWith("/switch")) return;

  await relayAdminMessage(env, msg);
}

export default {
  async fetch(request, env) {
    if (request.method === "GET") {
      return jsonResponse({ ok: true, service: "telegram-worker-relay-bot" });
    }

    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    if (WEBHOOK_SECRET) {
      const url = new URL(request.url);
      if (url.searchParams.get("key") !== WEBHOOK_SECRET) {
        return new Response("Forbidden", { status: 403 });
      }
    }

    let update;
    try {
      update = await request.json();
    } catch {
      return new Response("Bad Request", { status: 400 });
    }

    try {
      await handleUpdate(env, update);
    } catch (err) {
      console.error(err);
    }

    return jsonResponse({ ok: true });
  },
};
