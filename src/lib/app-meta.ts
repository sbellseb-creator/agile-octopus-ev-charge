export const APP_VERSION = "0.9.0-dev";
export const APP_BUILD_DATE = "2026-08-09";

export type DevStatus = "todo" | "in-progress" | "done" | "bug";

export type DevSticky = {
  id: string;
  title: string;
  detail?: string;
  status: DevStatus;
  area: string;
};

export const DEV_STICKIES: DevSticky[] = [
  {
    id: "restore-old-data",
    title: "Restore old charge sessions and work logs",
    detail: "Recover historic Lovable data and migrate it safely into the owned Supabase project.",
    status: "todo",
    area: "Data",
  },
  {
    id: "deleted-session-resurrection",
    title: "Deleted charge session reappears",
    detail: "Trace cloud-sync deletion and make deletion authoritative.",
    status: "bug",
    area: "Sync",
  },
  {
    id: "tesla-auto-charge-capture",
    title: "Automatic Tesla charge session capture",
    detail: "Use actual Tesla charging state, not plug-in time, and handle pause/resume/complete.",
    status: "in-progress",
    area: "Tesla",
  },
  {
    id: "charger-power",
    title: "Use 6.9 kW / 30 A consistently",
    detail: "Do not round the configured charger power to 7.0 kW in the UI.",
    status: "todo",
    area: "Charging",
  },
  {
    id: "tesla-charge-control",
    title: "Control Tesla charging from this app",
    detail: "Start/stop charging, set limits and schedules with confirmation from Tesla.",
    status: "todo",
    area: "Tesla",
  },
  {
    id: "home-v2",
    title: "Home visual redesign",
    detail: "Quicksilver car hero, live charging state, Agile intelligence and cleaner hierarchy.",
    status: "in-progress",
    area: "Design",
  },
  {
    id: "dynamic-themes",
    title: "Dynamic weather / time / seasonal themes",
    detail: "Automatic weather/time themes plus forced Easter, Christmas, Winter, Summer and Classic.",
    status: "todo",
    area: "Design",
  },
  {
    id: "permanent-free-deploy",
    title: "Permanent free deployment",
    detail: "Deploy the app to a stable £0/month host and stop relying on Codespaces/Vite URLs.",
    status: "todo",
    area: "Deploy",
  },
];
