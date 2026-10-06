export interface PushDiagnostics {
  supported: boolean;
  configured: boolean;
  permission: NotificationPermission | "unsupported";
  subscribed: boolean;
  lastTest: { ok: boolean; at: string; message?: string } | null;
}

/** One-line diagnostics, e.g. "Push: configured / subscribed / last test OK 12:40". */
export function pushStatusLine(d: PushDiagnostics, formatTime: (iso: string) => string = (iso) => iso): string {
  if (!d.supported) return "Push: not supported here (on iPhone, install to Home Screen first)";
  const test = d.lastTest
    ? d.lastTest.ok ? `last test OK ${formatTime(d.lastTest.at)}` : `last test failed${d.lastTest.message ? ` (${d.lastTest.message})` : ""}`
    : "no test yet";
  return `Push: ${d.configured ? "configured" : "NOT configured (VITE_VAPID_PUBLIC_KEY missing)"} / permission ${d.permission} / ${d.subscribed ? "subscribed" : "not subscribed"} / ${test}`;
}
