import { TableActions } from "@/components/insights/TableActions";
import { feedbackTable, formatMatchRate, formatMinutes, type FeedbackSummary } from "@/lib/insights";

export function FeedbackTable({ summary }: { summary: FeedbackSummary }) {
  const matchRate = formatMatchRate(summary);

  return (
    <div className="space-y-4">
      {matchRate ? (
        <div>
          <p className="font-serif text-3xl leading-tight sm:text-4xl">{matchRate}</p>
          <p className="mt-1 text-sm text-muted">Match rate: Yes or Mostly, out of all responses.</p>
        </div>
      ) : null}
      <div className="space-y-3 sm:hidden">
        {summary.rows.map((row) => (
          <div key={row.answer} className="rounded-md border border-line p-3">
            <p className="font-semibold">{row.label}</p>
            <dl className="mt-2 grid grid-cols-1 gap-2 text-sm min-[420px]:grid-cols-2">
              <div>
                <dt className="text-muted">Responses</dt>
                <dd className="tabular-nums">{row.responses}</dd>
              </div>
              <div>
                <dt className="text-muted">Average minutes (self-report)</dt>
                <dd className="tabular-nums">{formatMinutes(row.avgMinutes)}</dd>
              </div>
            </dl>
          </div>
        ))}
      </div>
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full min-w-[32rem] border-collapse text-left text-sm">
          <caption className="sr-only">Feedback by answer</caption>
          <thead>
            <tr className="border-b border-line text-muted">
              <th scope="col" className="px-2 py-2 font-semibold">
                Answer
              </th>
              <th scope="col" className="px-2 py-2 font-semibold">
                Responses
              </th>
              <th scope="col" className="px-2 py-2 font-semibold">
                Average minutes (self-report)
              </th>
            </tr>
          </thead>
          <tbody>
            {summary.rows.map((row) => (
              <tr key={row.answer} className="border-b border-line">
                <th scope="row" className="px-2 py-3 font-semibold">
                  {row.label}
                </th>
                <td className="px-2 py-3 tabular-nums">{row.responses}</td>
                <td className="px-2 py-3 tabular-nums">{formatMinutes(row.avgMinutes)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <TableActions label="feedback" filename="insights-feedback.csv" rows={feedbackTable(summary)} />
    </div>
  );
}
