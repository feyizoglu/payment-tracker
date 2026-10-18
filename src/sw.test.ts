import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const source = readFileSync(fileURLToPath(new URL("../public/sw.js", import.meta.url)), "utf8");
const ORIGIN = "https://paytrack.example";

type Handler = (event: unknown) => void;

function loadWorker(windows: { url: string; focus: () => unknown }[] = []) {
  const handlers: Record<string, Handler> = {};
  const showNotification = vi.fn().mockResolvedValue(undefined);
  const openWindow = vi.fn().mockResolvedValue(undefined);
  const matchAll = vi.fn().mockResolvedValue(windows);
  const self = {
    addEventListener: (type: string, handler: Handler) => {
      handlers[type] = handler;
    },
    registration: { showNotification },
    location: { origin: ORIGIN },
    clients: { matchAll, openWindow },
  };
  vm.runInNewContext(source, { self, URL });
  return { handlers, showNotification, openWindow, matchAll };
}

describe("sw.js push handler", () => {
  it("shows the payload's title, body and url", () => {
    const { handlers, showNotification } = loadWorker();
    const waitUntil = vi.fn();

    handlers.push({
      data: { json: () => ({ title: "Reminder", body: "Rent due", url: "/dashboard?month=2026-11" }) },
      waitUntil,
    });

    expect(waitUntil).toHaveBeenCalledTimes(1);
    expect(showNotification).toHaveBeenCalledWith("Reminder", {
      body: "Rent due",
      icon: "/icons/icon-192.png",
      data: { url: "/dashboard?month=2026-11" },
    });
  });

  it("falls back to PayTrack and /dashboard without title or url", () => {
    const { handlers, showNotification } = loadWorker();

    handlers.push({ data: { json: () => ({ body: "Rent due" }) }, waitUntil: vi.fn() });

    expect(showNotification).toHaveBeenCalledWith("PayTrack", {
      body: "Rent due",
      icon: "/icons/icon-192.png",
      data: { url: "/dashboard" },
    });
  });

  it("ignores a payload that is not JSON", () => {
    const { handlers, showNotification } = loadWorker();
    const waitUntil = vi.fn();
    const event = {
      data: {
        json: () => {
          throw new SyntaxError("Unexpected token");
        },
      },
      waitUntil,
    };

    expect(() => handlers.push(event)).not.toThrow();
    expect(waitUntil).not.toHaveBeenCalled();
    expect(showNotification).not.toHaveBeenCalled();
  });

  it("ignores a push without data", () => {
    const { handlers, showNotification } = loadWorker();
    const waitUntil = vi.fn();

    expect(() => handlers.push({ data: null, waitUntil })).not.toThrow();
    expect(waitUntil).not.toHaveBeenCalled();
    expect(showNotification).not.toHaveBeenCalled();
  });
});

describe("sw.js notificationclick handler", () => {
  const click = (url: string | undefined) => {
    const waitUntil = vi.fn();
    const close = vi.fn();
    return { event: { notification: { close, data: url === undefined ? {} : { url } }, waitUntil }, waitUntil, close };
  };

  it("closes the notification and focuses a window already on the target", async () => {
    const focus = vi.fn().mockResolvedValue(undefined);
    const other = vi.fn();
    const { handlers, openWindow, matchAll } = loadWorker([
      { url: `${ORIGIN}/`, focus: other },
      { url: `${ORIGIN}/dashboard?month=2026-11`, focus },
    ]);
    const { event, waitUntil, close } = click("/dashboard?month=2026-11");

    handlers.notificationclick(event);
    await waitUntil.mock.calls[0][0];

    expect(close).toHaveBeenCalledTimes(1);
    expect(matchAll).toHaveBeenCalledWith({ type: "window", includeUncontrolled: true });
    expect(focus).toHaveBeenCalledTimes(1);
    expect(other).not.toHaveBeenCalled();
    expect(openWindow).not.toHaveBeenCalled();
  });

  it("opens the absolute target when no window is on it", async () => {
    const focus = vi.fn();
    const { handlers, openWindow } = loadWorker([{ url: `${ORIGIN}/dashboard`, focus }]);
    const { event, waitUntil } = click("/dashboard?month=2026-11");

    handlers.notificationclick(event);
    await waitUntil.mock.calls[0][0];

    expect(focus).not.toHaveBeenCalled();
    expect(openWindow).toHaveBeenCalledWith(`${ORIGIN}/dashboard?month=2026-11`);
  });

  it("targets /dashboard when the notification has no url", async () => {
    const { handlers, openWindow } = loadWorker();
    const { event, waitUntil } = click(undefined);

    handlers.notificationclick(event);
    await waitUntil.mock.calls[0][0];

    expect(openWindow).toHaveBeenCalledWith(`${ORIGIN}/dashboard`);
  });
});
