import { EventEmitter } from "node:events";

class AppEventBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(500);
  }

  publish(companyId, eventType, payload = {}) {
    const event = {
      companyId: Number(companyId) || null,
      type: eventType,
      data: payload,
      timestamp: new Date().toISOString(),
    };
    this.emit("app_event", event);
    if (companyId) {
      this.emit(`company:${companyId}`, event);
    }
  }

  subscribe(companyId, listener) {
    if (companyId) {
      const channel = `company:${companyId}`;
      this.on(channel, listener);
      return () => this.off(channel, listener);
    }
    this.on("app_event", listener);
    return () => this.off("app_event", listener);
  }
}

export const eventBus = new AppEventBus();

export function publishAppEvent(companyId, eventType, payload = {}) {
  try {
    eventBus.publish(companyId, eventType, payload);
  } catch (err) {
    console.error("[eventBus] Error publishing event:", err);
  }
}
