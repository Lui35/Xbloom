// BLE protocol derived from fhenwood/PyBloom (MIT), used for interoperability.
// https://github.com/fhenwood/PyBloom
export const SERVICE_UUID = "0000e0ff-3c17-d293-8e48-14fe2e4da212";
export const WRITE_UUID = "0000ffe1-0000-1000-8000-00805f9b34fb";
export const NOTIFY_UUID = "0000ffe2-0000-1000-8000-00805f9b34fb";

export type MachineTelemetry = {
  weight?: number;
  temperature?: number;
  waterVolume?: number;
  state: "idle" | "grinding" | "brewing" | "paused" | "complete" | "error";
  lastCommand?: number;
};
const responseStates: Record<number, MachineTelemetry["state"]> = {
  9003: "grinding",
  9005: "brewing",
  40510: "brewing",
  9010: "paused",
  40507: "idle",
  40511: "idle",
  40512: "complete",
  40517: "error",
  40522: "error",
};

export function crc16(data: Uint8Array): number {
  let crc = 0;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? (crc >>> 1) ^ 0x8408 : crc >>> 1;
  }
  return crc & 0xffff;
}

export function buildCommand(command: number, values: number[] = []): Uint8Array {
  const packet = new Uint8Array(12 + values.length * 4),
    view = new DataView(packet.buffer);
  packet[0] = 0x58;
  packet[1] = 1;
  packet[2] = 1;
  view.setUint16(3, command, true);
  view.setUint32(5, packet.length, true);
  packet[9] = 1;
  values.forEach((value, index) => view.setUint32(10 + index * 4, value, true));
  view.setUint16(packet.length - 2, crc16(packet.subarray(0, -2)), true);
  return packet;
}

export function parseNotification(input: DataView): Partial<MachineTelemetry> | null {
  if (input.byteLength < 12) return null;
  const command = input.getUint16(3, true),
    update: Partial<MachineTelemetry> = { lastCommand: command },
    offset = 10;
  if (command === 20501 && input.byteLength >= 16) update.weight = input.getFloat32(offset, true);
  if (command === 8108 && input.byteLength >= 16)
    update.temperature = input.getUint32(offset, true) / 10;
  if (command === 40523 && input.byteLength >= 16)
    update.waterVolume = input.getFloat32(offset, true);
  if (responseStates[command]) update.state = responseStates[command];
  return update;
}

export class XBloomDevice {
  private device?: BluetoothDevice;
  private server?: BluetoothRemoteGATTServer;
  private listeners = new Set<(status: MachineTelemetry) => void>();
  status: MachineTelemetry = { state: "idle" };
  get name() {
    return this.device?.name || "xBloom Studio";
  }
  get connected() {
    return Boolean(this.server?.connected);
  }
  async connect() {
    if (!navigator.bluetooth) throw new Error("Bluetooth is unavailable on this computer.");
    this.device = await navigator.bluetooth.requestDevice({
      filters: [{ services: [SERVICE_UUID] }],
    });
    this.server = await this.device.gatt?.connect();
    if (!this.server) throw new Error("Could not establish a Bluetooth connection.");
    const service = await this.server.getPrimaryService(SERVICE_UUID),
      notify = await service.getCharacteristic(NOTIFY_UUID);
    await notify.startNotifications();
    notify.addEventListener("characteristicvaluechanged", this.onNotification);
    this.device.addEventListener("gattserverdisconnected", () => this.emit({ state: "idle" }));
    return this;
  }
  onStatus(listener: (status: MachineTelemetry) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  disconnect() {
    this.device?.gatt?.disconnect();
  }
  private onNotification = (event: Event) => {
    const value = (event.target as BluetoothRemoteGATTCharacteristic).value;
    if (!value) return;
    const update = parseNotification(value);
    if (update) this.emit(update);
  };
  private emit(update: Partial<MachineTelemetry>) {
    this.status = { ...this.status, ...update };
    this.listeners.forEach((listener) => listener(this.status));
  }
}
