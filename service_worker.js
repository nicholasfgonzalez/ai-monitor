// AI ME service worker (MV3)
// Single-writer for "Today" aggregation across tabs.

const DAILY_PREFIX = "ai-me-daily"; // stored as an object map under this key

async function getDailyMap() {
  const r = await chrome.storage.local.get(DAILY_PREFIX);
  return (r && r[DAILY_PREFIX]) || {};
}

async function setDailyMap(map) {
  await chrome.storage.local.set({ [DAILY_PREFIX]: map });
}

function safeNum(n) {
  return Number.isFinite(n) ? n : 0;
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    try {
      if (!msg || typeof msg !== "object") return;

      if (msg.type === "AI_METER_DAILY_GET") {
        const day = String(msg.day || "");
        const map = await getDailyMap();
        const today = map[day] || { prompts: 0, wh: 0, co2: 0 };
        sendResponse({ ok: true, today });
        return;
      }

      if (msg.type === "AI_METER_DAILY_DELTA") {
        const day = String(msg.day || "");
        const d = msg.delta || {};
        const dPrompts = safeNum(d.prompts);
        const dWh = safeNum(d.wh);
        const dCo2 = safeNum(d.co2);

        const map = await getDailyMap();
        const cur = map[day] || { prompts: 0, wh: 0, co2: 0 };

        const next = {
          prompts: safeNum(cur.prompts) + dPrompts,
          wh: safeNum(cur.wh) + dWh,
          co2: safeNum(cur.co2) + dCo2,
          updatedAt: Date.now()
        };

        map[day] = next;
        await setDailyMap(map);

        sendResponse({ ok: true, today: next });
        return;
      }
    } catch (e) {
      sendResponse({ ok: false, error: String(e && e.message ? e.message : e) });
    }
  })();

  // Keep the message channel open for async response
  return true;
});

chrome.runtime.onInstalled.addListener(() => {});
