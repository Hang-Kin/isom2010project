import { TableActions } from "@/components/insights/TableActions";
import { formatPercent, retentionTable, type RetentionRow } from "@/lib/insights";

export function RetentionTable({ rows, disabled }: { rows: RetentionRow[]; disabled?: boolean }) {
  const activated = rows[0]?.activated ?? 0;

  return (
    <section className="card space-y-4" aria-labelledby="insights-retention">
      <div className="max-w-2xl">
        <h2 id="insights-retention" className="font-serif text-2xl">
          Retention
        </h2>
        <p className="mt-1 text-sm leading-relaxed text-muted">
          Relative weeks 0 to 3. Week 0 starts at an account&apos;s first PDF generated or downloaded.
          Later weeks count PDF generated events. Denominator: {activated} activated{" "}
          {activated === 1 ? "user" : "users"}.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
          <caption className="sr-only">Retention by relative week</caption>
          <thead>
            <tr className="border-b border-line text-muted">
              <th scope="col" className="px-2 py-2 font-semibold">
                Week
              </th>
              <th scope="col" className="px-2 py-2 font-semibold">
                Users
              </th>
              <th scope="col" className="px-2 py-2 font-semibold">
                Activated users
              </th>
              <th scope="col" className="px-2 py-2 font-semibold">
                Percent of activated
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.relWeek} className="border-b border-line">
                <th scope="row" className="px-2 py-3 font-semibold">
                  Week {row.relWeek}
                </th>
                <td className="px-2 py-3">{row.users}</td>
                <td className="px-2 py-3">{row.activated}</td>
                <td className="px-2 py-3">{formatPercent(row.percent)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <TableActions
        label="retention"
        filename="insights-retention.csv"
        rows={retentionTable(rows)}
        disabled={disabled}
      />
    </section>
  );
}
