import { APP_BUILD_DATE, APP_VERSION, DEV_STICKIES, type DevStatus } from "@/lib/app-meta";

const labelFor = (status: DevStatus) => {
  switch (status) {
    case "done":
      return "Done";
    case "in-progress":
      return "In progress";
    case "bug":
      return "Bug";
    default:
      return "Todo";
  }
};

export default function DevelopmentStatus() {
  return (
    <section className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">App build</div>
        <div className="mt-1 text-lg font-semibold">EV Charge Tracker {APP_VERSION}</div>
        <div className="text-sm text-muted-foreground">Build date {APP_BUILD_DATE}</div>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          This is a manually maintained development roadmap, not a live fault report.
          “Todo” and “In progress” describe planned product work and do not mean the current build failed.
        </p>
      </div>

      <div className="space-y-3">
        {DEV_STICKIES.map((item) => (
          <article key={item.id} className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">{item.area}</div>
                <h3 className="mt-1 font-semibold">{item.title}</h3>
              </div>
              <span className="shrink-0 rounded-full border border-border px-2 py-1 text-[11px] font-medium">
                {labelFor(item.status)}
              </span>
            </div>

            {item.detail ? (
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.detail}</p>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}
