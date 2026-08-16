export const APP_VERSION = "0.10.0-dev";
export const APP_BUILD_DATE = "2026-08-16";

export type DevStatus = "todo" | "in-progress" | "done" | "bug";

export type DevSticky = {
  id: string;
  title: string;
  detail?: string;
  status: DevStatus;
  area: string;
};

export const DEV_STICKIES: DevSticky[] = [

  // ============================================================
  // CORE PRODUCT INTELLIGENCE / SELF LEARNING
  // ============================================================

  {
    id: "battery-capacity-learning",
    title: "Self-learning usable battery capacity",
    detail:
      "Do not permanently assume a 75 kWh battery. Learn effective usable battery capacity from clean completed Tesla charge sessions using actual SoC change and observed energy. Smooth results across multiple sessions, reject poor/outlier observations and maintain a confidence score.",
    status: "todo",
    area: "Learning",
  },
  {
    id: "battery-health-history",
    title: "Battery capacity / health history",
    detail:
      "Store learned usable-capacity estimates over time so the app can show battery-capacity trend and long-term change rather than only the latest estimate.",
    status: "todo",
    area: "Learning",
  },
  {
    id: "charging-efficiency-learning",
    title: "Learn real charging efficiency",
    detail:
      "Compare energy delivered/observed with battery SoC movement across reliable sessions to learn charging losses and effective charging efficiency instead of relying on a fixed assumption.",
    status: "todo",
    area: "Learning",
  },
  {
    id: "charger-power-learning",
    title: "Learn observed charger power",
    detail:
      "Home charger configuration is 30 A / 6.9 kW. Preserve that configured value while separately learning actual observed charging power from Tesla sessions. Do not display it as 7.0 kW merely because of UI rounding.",
    status: "in-progress",
    area: "Learning",
  },
  {
    id: "prediction-feedback-loop",
    title: "Prediction feedback loop",
    detail:
      "For each completed charge compare predicted versus actual energy, start time, finish time, duration and cost. Feed reliable observations back into future Planner estimates.",
    status: "todo",
    area: "Learning",
  },
  {
    id: "learning-confidence",
    title: "Confidence-weight learned values",
    detail:
      "Never treat one charge as truth. Track observation count, quality and confidence. Prefer configured/reference values until enough reliable observations exist, then progressively favour learned values.",
    status: "todo",
    area: "Learning",
  },

  // ============================================================
  // TESLA / AUTOMATIC SESSION LIFECYCLE
  // ============================================================

  {
    id: "tesla-auto-charge-capture",
    title: "Automatic Tesla charge session capture",
    detail:
      "A session begins when Tesla actually reports charging, not merely when the cable is plugged in. Capture actual start/end SoC, times, energy and charging observations automatically.",
    status: "in-progress",
    area: "Tesla",
  },
  {
    id: "plugged-in-waiting",
    title: "Plugged in does not mean charging",
    detail:
      "Support plugging in hours before charging starts. Example: cable connected at 21:00 but Agile plan does not start charging until around 02:00. Waiting must not create a false charging session.",
    status: "in-progress",
    area: "Tesla",
  },
  {
    id: "charge-pauses",
    title: "Handle charging pauses without false sessions",
    detail:
      "Keep appropriate short/temporary charging interruptions within the same real session. Current monitor tests include pause/resume behaviour and stopped-but-still-plugged handling.",
    status: "in-progress",
    area: "Tesla",
  },
  {
    id: "external-tesla-start",
    title: "Detect charges started outside this app",
    detail:
      "Automatic session recording must work whether charging is started by this app, Tesla's official app, a Tesla schedule or another legitimate Tesla control path.",
    status: "in-progress",
    area: "Tesla",
  },
  {
    id: "tesla-charge-control",
    title: "Control Tesla charging from this app",
    detail:
      "Ultimately provide day-to-day charging control without needing the Tesla app: start/stop charging, charge limit and supported scheduling/charging commands. Commands must show Tesla-confirmed success or failure.",
    status: "todo",
    area: "Tesla",
  },
  {
    id: "tesla-sleep-wake",
    title: "Respect Tesla sleep and wake behaviour",
    detail:
      "Avoid unnecessarily waking a sleeping car. Distinguish passive cached/status checks from deliberate user actions that require waking Tesla.",
    status: "in-progress",
    area: "Tesla",
  },

  // ============================================================
  // SESSION DATA / AGILE COSTING
  // ============================================================

  {
    id: "automatic-agile-cost",
    title: "Automatically calculate actual Agile session cost",
    detail:
      "Completed sessions should be priced from the actual charging periods against the relevant Agile half-hour prices rather than remaining at £0.00 or relying on manual cost entry.",
    status: "in-progress",
    area: "Charging",
  },
  {
    id: "planned-vs-actual-session",
    title: "Reconcile planned/speculative sessions with reality",
    detail:
      "A speculative/planned charge must not be double-counted alongside the automatically detected real Tesla session. Reconcile or replace overlapping planned records with actual observations.",
    status: "todo",
    area: "Charging",
  },
  {
    id: "deleted-session-resurrection",
    title: "Deleted charge session reappears",
    detail:
      "A deleted historical session has returned after sync. Trace local/cloud deletion and make deletion authoritative so removed sessions cannot be resurrected by another data source.",
    status: "bug",
    area: "Sync",
  },
  {
    id: "restore-old-data",
    title: "Restore all old charge sessions and work logs",
    detail:
      "Recover historical charge-session and work-trip data from the previous app/backend and migrate it safely into the owned Supabase project without duplicates or loss.",
    status: "todo",
    area: "Data",
  },
  {
    id: "uk-dates",
    title: "Use DD/MM/YYYY for displayed session dates",
    detail:
      "Store machine-friendly dates internally where appropriate, but user-facing session/work dates must display in UK DD/MM/YYYY format.",
    status: "done",
    area: "Data",
  },

  // ============================================================
  // HOME / PRODUCT DESIGN
  // ============================================================

  {
    id: "home-v2",
    title: "Home visual redesign",
    detail:
      "Home is being redesigned around the Quicksilver Model Y, live Tesla state, battery percentage, charging state, Agile intelligence, next charge and monthly summary.",
    status: "in-progress",
    area: "Design",
  },
  {
    id: "home-live-charging",
    title: "Home hero reflects real charging state",
    detail:
      "When charging, the hero should clearly show battery SoC, charging state, 6.9 kW / 30 A where appropriate, target and remaining time. Charging lead should visually pulse/glow green.",
    status: "in-progress",
    area: "Design",
  },
  {
    id: "dynamic-themes",
    title: "Dynamic weather and time-of-day themes",
    detail:
      "Automatic Home scenery should respond to saved home location, current weather and time of day while keeping charging information readable.",
    status: "in-progress",
    area: "Design",
  },
  {
    id: "forced-seasonal-themes",
    title: "Forced seasonal themes",
    detail:
      "Allow manual themes including Summer, Winter, Spring, Autumn, Christmas, Easter, Halloween and Classic, independent of current weather.",
    status: "in-progress",
    area: "Design",
  },

  // ============================================================
  // PLANNER
  // ============================================================

  {
    id: "planner-learned-model",
    title: "Planner uses learned vehicle model",
    detail:
      "Planner should progressively use learned usable battery capacity, observed charger power and charging efficiency when confidence is sufficient, improving energy, duration and cost predictions over time.",
    status: "todo",
    area: "Planner",
  },
  {
    id: "planner-ready-by",
    title: "Simple ready-by charging experience",
    detail:
      "User should be able to express current SoC, desired SoC and Ready By time. App chooses suitable Agile periods and clearly explains waiting, charging and completion.",
    status: "in-progress",
    area: "Planner",
  },

  // ============================================================
  // WORK / VEHICLE
  // ============================================================

  {
    id: "work-trip-automation",
    title: "Business trip mileage workflow",
    detail:
      "Continue building the vehicle/work-trip flow around actual odometer/mileage data while retaining manual correction where required.",
    status: "in-progress",
    area: "Work",
  },

  // ============================================================
  // PRODUCT / INFRASTRUCTURE
  // ============================================================

  {
    id: "embedded-project-memory",
    title: "Keep project decisions embedded in the app",
    detail:
      "Version, development status, bugs and important product decisions should live with the project so development does not depend on reconstructing old chat conversations.",
    status: "in-progress",
    area: "Project",
  },
  {
    id: "permanent-free-deploy",
    title: "Permanent zero-cost deployment",
    detail:
      "Move away from temporary Codespaces/Vite preview URLs to a stable deployment while keeping operating cost at £0 during development where practical.",
    status: "todo",
    area: "Deploy",
  },
];
