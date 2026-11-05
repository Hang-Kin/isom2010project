import { TableActions } from "@/components/insights/TableActions";
import { formatPercent, funnelTable, type FunnelRow } from "@/lib/insights";

export function FunnelTable({ rows, disabled }: { rows: FunnelRow[]; disabled?: boolean }) {
  const dropOff = rows.find((row) => row.largestDropOff);

  return (
    <section className="card space-y-4" aria-labelledby="insights-funnel">
      <div className="max-w-2xl">
        <h2 id="insights-funnel" className="font-serif text-2xl">
          Funnel
        </h2>
        <p className="mt-1 text-sm leading-relaxed text-muted">
          Distinct accounts at each step. The bar shows each step as a share of signed-up accounts.
          Largest drop-off is the steepest fall from the previous step.
        </p>
      </div>
      {dropOff ? (
        <p className="text-sm font-semibold text-warning">
          Largest drop-off: {dropOff.step}. {dropOff.droppedUsers}{" "}
          {dropOff.droppedUsers === 1 ? "account" : "accounts"} fewer than the previous step (
          {formatPercent(dropOff.dropRate)}).
        </p>
      ) : (
        <p className="text-sm text-muted">No step has fewer accounts than the one before it.</p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
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
                Conversion from previous
              </th>
              <th scope="col" className="px-2 py-2 font-semibold">
                Conversion from signed up
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.stepOrder}
                className={row.largestDropOff ? "border-b border-line bg-warning-soft" : "border-b border-line"}
              >
                <th scope="row" className="px-2 py-3 font-semibold">
                  <div className="flex flex-wrap items-center gap-2">
                    <span>{row.step}</span>
                    {row.largestDropOff ? (
                      <span className="rounded-full border border-warning/40 bg-card px-2 py-0.5 text-xs font-semibold text-warning">
                        Largest drop-off
                      </span>
                    ) : null}
                  </div>
                  <div
                    className="mt-2 h-2.5 w-full max-w-xs overflow-hidden rounded-full bg-background"
                    aria-hidden="true"
                  >
                    <div className="h-full rounded-full bg-accent" style={{ width: `${row.barPercent}%` }} />
                  </div>
                  <span className="sr-only">{row.barPercent.toFixed(1)}% of signed up</span>
                </th>
                <td className="px-2 py-3">{row.users}</td>
                <td className="px-2 py-3">{row.stepOrder === 1 ? "—" : formatPercent(row.fromPrevious)}</td>
                <td className="px-2 py-3">{formatPercent(row.fromSignedUp)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <TableActions label="funnel" filename="insights-funnel.csv" rows={funnelTable(rows)} disabled={disabled} />
    </section>
  );
}
