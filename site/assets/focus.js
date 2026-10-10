// Shared behaviour for the single-figure screens (/raffle, /live).
import { CATEGORIES, TICKET_PRICE, money, timeOf, ticketsFor } from "/assets/shared.js";

const POLL_MS = 3000;
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const $ = (id) => document.getElementById(id);

/**
 * @param {object} opts
 * @param {string}   opts.title   heading above the figure
 * @param {string[]} opts.keys    category keys to add together
 * @param {boolean}  opts.tickets show a per-raffle ticket breakdown
 */
export function startFocusScreen({ title, keys, tickets = false }) {
  document.getElementById("heading").textContent = title;

  let shown = 0;
  let anim = null;

  function animate(to) {
    cancelAnimationFrame(anim);
    const from = shown;
    if (reduceMotion || from === to) {
      shown = to;
      $("figure").textContent = money(to);
      return;
    }
    const start = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - start) / 1400);
      shown = from + (to - from) * (1 - Math.pow(1 - t, 3));
      $("figure").textContent = money(shown);
      if (t < 1) anim = requestAnimationFrame(step);
      else shown = to;
    };
    anim = requestAnimationFrame(step);
  }

  function render(state) {
    const total = keys.reduce((sum, k) => sum + (state.amounts[k] || 0), 0);
    animate(total);
    document.title = `${money(total)} · ${title}`;

    if (!tickets) return;
    const parts = [];
    for (const key of keys) {
      const sold = ticketsFor(key, state.amounts[key] || 0);
      if (!sold) continue;
      const name = CATEGORIES.find((c) => c.key === key)?.name ?? key;
      parts.push(`${name}: ${sold} at ${money(TICKET_PRICE[key])}`);
    }
    $("detail").textContent = parts.join("   ·   ");
  }

  async function poll() {
    try {
      const res = await fetch("/api/totals", { cache: "no-store" });
      if (!res.ok) throw new Error(res.status);
      const state = await res.json();
      render(state);
      $("status").classList.remove("offline");
      $("statusText").textContent = state.updatedAt ? `Updated ${timeOf(state.updatedAt)}` : "Live";
    } catch {
      $("status").classList.add("offline");
      $("statusText").textContent = "Reconnecting…";
    } finally {
      setTimeout(poll, POLL_MS);
    }
  }
  poll();

  // Full screen, wake lock, and hiding the pointer when left alone.
  const fsBtn = $("fsBtn");
  let wakeLock = null;

  async function enterFullscreen() {
    try {
      await document.documentElement.requestFullscreen({ navigationUI: "hide" });
    } catch {
      fsBtn.textContent = "Press F11 for full screen";
      return;
    }
    try { wakeLock = await navigator.wakeLock?.request("screen"); } catch {}
  }

  fsBtn.addEventListener("click", () =>
    document.fullscreenElement ? document.exitFullscreen() : enterFullscreen()
  );
  document.addEventListener("keydown", (e) => {
    if (e.key.toLowerCase() === "f" && !e.metaKey && !e.ctrlKey) fsBtn.click();
  });
  document.addEventListener("dblclick", () => fsBtn.click());
  document.addEventListener("fullscreenchange", () => {
    document.body.classList.toggle("fullscreen", Boolean(document.fullscreenElement));
    if (!document.fullscreenElement) { wakeLock?.release?.(); wakeLock = null; }
  });
  document.addEventListener("visibilitychange", async () => {
    if (!document.hidden && document.fullscreenElement && !wakeLock) {
      try { wakeLock = await navigator.wakeLock?.request("screen"); } catch {}
    }
  });

  let idle;
  const wake = () => {
    document.body.classList.remove("idle");
    clearTimeout(idle);
    idle = setTimeout(() => document.body.classList.add("idle"), 4000);
  };
  ["mousemove", "mousedown", "keydown", "touchstart"].forEach((ev) => document.addEventListener(ev, wake));
  wake();
}
