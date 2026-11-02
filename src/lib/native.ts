/** Browser-only Despia bridge; native enhancements must never block a job action. */
export function isDespiaRuntime(userAgent?: string): boolean {
  const ua = userAgent ?? (typeof navigator === "undefined" ? "" : navigator.userAgent);
  return ua.toLowerCase().includes("despia");
}

async function nativeCommand(command: string): Promise<void> {
  if (typeof window === "undefined" || !isDespiaRuntime()) return;
  try {
    const { default: despia } = await import("despia-native");
    await despia(command);
  } catch {
    // Optional device feedback must not turn a saved booking into a failed action.
  }
}

export function nativeFeedback(kind: "success" | "warning" | "error" | "light"): Promise<void> {
  return nativeCommand(`${kind}haptic://`);
}

/** Resolve the existing semantic background token to RGB for the native protocol. */
export async function syncNativeAppearance(): Promise<void> {
  if (typeof document === "undefined" || !isDespiaRuntime()) return;
  try {
    const token = getComputedStyle(document.documentElement).getPropertyValue("--background").trim();
    if (!token || !CSS.supports("color", token)) return;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = token;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    if (r === undefined || g === undefined || b === undefined) return;
    const light = (r * 299 + g * 587 + b * 114) / 1000 > 150;
    await nativeCommand(`statusbarcolor://{${r}, ${g}, ${b}}`);
    await nativeCommand(`statusbartextcolor://{${light ? "black" : "white"}}`);
  } catch {
    // Keep the runtime's default appearance if color conversion is unavailable.
  }
}