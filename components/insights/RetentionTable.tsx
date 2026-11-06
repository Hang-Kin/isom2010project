import { TableActions } from "@/components/insights/TableActions";
import { formatPercent, retentionTable, type RetentionRow } from "@/lib/insights";

export function RetentionTable({ rows }: { rows: RetentionRow[] }) {
  const activated = rows[0]?.activated ?? 0;

  return (
    <div className="space-y-4">
      <p className="text-sm leading-relaxed text-muted">
        Denominator: {activated} activated {activated === 1 ? "user" : "users"}.
      </p>
      <div className="space-y-3 sm:hidden">
        {rows.map((row) => (
          <div key={row.relWeek} className="rounded-md border border-line p-3">
            <p className="font-semibold">Week {row.relWeek}</p>
            <dl className="mt-2 grid grid-cols-1 gap-2 text-sm min-[420px]:grid-cols-3">
              <div>
                <dt className="text-muted">Users</dt>
                <dd className="tabular-nums">{row.users}</dd>
              </div>
              <div>
                <dt className="text-muted">% of activated users</dt>
                <dd className="tabular-nums">{formatPercent(row.percent)}</dd>
              </div>
              <div>
                <dt className="text-muted">Activated users</dt>
                <dd className="tabular-nums">{row.activated}</dd>
              </div>
            </dl>
          </div>
        ))}
      </div>
      <div className="hidden overflow-x-auto sm:block">
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
                % of activated users
              </th>
              <th scope="col" className="px-2 py-2 font-semibold">
                Activated users
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.relWeek} className="border-b border-line">
                <th scope="row" className="px-2 py-3 font-semibold">
                  Week {row.relWeek}
                </th>
                <td className="px-2 py-3 tabular-nums">{row.users}</td>
                <td className="px-2 py-3 tabular-nums">{formatPercent(row.percent)}</td>
                <td className="px-2 py-3 tabular-nums">{row.activated}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <TableActions label="retention" filename="insights-retention.csv" rows={retentionTable(rows)} />
    </div>
  );
}
