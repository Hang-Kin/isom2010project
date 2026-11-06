import { TableActions } from "@/components/insights/TableActions";
import { formatPercent, funnelTable, type FunnelRow } from "@/lib/insights";

export function FunnelTable({ rows }: { rows: FunnelRow[] }) {
  const dropOff = rows.find((row) => row.largestDrop);

  return (
    <div className="space-y-4">
      {dropOff ? (
        <p className="text-sm font-semibold text-warning">
          Largest drop: {dropOff.step}. {dropOff.droppedUsers}{" "}
          {dropOff.droppedUsers === 1 ? "fewer user" : "fewer users"} than the previous step.
        </p>
      ) : (
        <p className="text-sm text-muted">No step has fewer users than the previous step.</p>
      )}
      <div className="space-y-3 sm:hidden">
        {rows.map((row) => (
          <FunnelStack key={row.stepOrder} row={row} />
        ))}
      </div>
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
          <caption className="sr-only">Funnel from sign-up to PDF download</caption>
          <thead>
            <tr className="border-b border-line text-muted">
              <th scope="col" className="px-2 py-2 font-semibold">
                Step
              </th>
              <th scope="col" className="px-2 py-2 font-semibold">
                Users
              </th>
              <th scope="col" className="px-2 py-2 font-semibold">
                % of signed up
              </th>
              <th scope="col" className="px-2 py-2 font-semibold">
                % of previous step
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.stepOrder}
                className={row.largestDrop ? "border-b border-line bg-warning-soft" : "border-b border-line"}
              >
                <th scope="row" className="px-2 py-3 font-semibold">
                  <StepLabel row={row} />
                  <Bar percent={row.barPercent} />
                </th>
                <td className="px-2 py-3 tabular-nums">{row.users}</td>
                <td className="px-2 py-3 tabular-nums">{formatPercent(row.ofSignedUp)}</td>
                <td className="px-2 py-3 tabular-nums">{formatPercent(row.ofPrevious)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <TableActions label="funnel" filename="insights-funnel.csv" rows={funnelTable(rows)} />
    </div>
  );
}

function FunnelStack({ row }: { row: FunnelRow }) {
  return (
    <div className={row.largestDrop ? "rounded-md bg-warning-soft p-3" : "rounded-md border border-line p-3"}>
      <StepLabel row={row} />
      <dl className="mt-2 grid grid-cols-1 gap-2 text-sm min-[420px]:grid-cols-3">
        <div>
          <dt className="text-muted">Users</dt>
          <dd className="tabular-nums">{row.users}</dd>
        </div>
        <div>
          <dt className="text-muted">% of signed up</dt>
          <dd className="tabular-nums">{formatPercent(row.ofSignedUp)}</dd>
        </div>
        <div>
          <dt className="text-muted">% of previous step</dt>
          <dd className="tabular-nums">{formatPercent(row.ofPrevious)}</dd>
        </div>
      </dl>
      <Bar percent={row.barPercent} />
    </div>
  );
}

function StepLabel({ row }: { row: FunnelRow }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="break-words">{row.step}</span>
      {row.largestDrop ? (
        <span className="rounded-full border border-warning/40 bg-card px-2 py-0.5 text-xs font-semibold text-warning">
          Largest drop
        </span>
      ) : null}
    </div>
  );
}

function Bar({ percent }: { percent: number }) {
  return (
    <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-background" aria-hidden="true">
      <div className="h-full rounded-full bg-accent" style={{ width: `${percent}%` }} />
    </div>
  );
}
