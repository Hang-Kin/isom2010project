import { StatusMessage } from "@/components/ui";

function formatFileSize(bytes: number): string {
  const megabytes = bytes / (1024 * 1024);
  if (megabytes > 0 && megabytes < 0.01) return `${megabytes.toFixed(3)} MB`;
  return `${megabytes.toFixed(2)} MB`;
}

export function PdfChecklist({
  achievements,
  evidencePages,
  fileSizeBytes,
  warnings,
}: {
  achievements: number;
  evidencePages: number;
  fileSizeBytes: number;
  warnings: string[];
}) {
  return (
    <section
      aria-label="PDF checklist"
      className="space-y-2 rounded-md border border-line bg-white px-3 py-3"
    >
      <h3 className="text-sm font-semibold">Checklist</h3>
      <ul className="space-y-1 text-sm">
        <li>Achievements: {achievements}</li>
        <li>Evidence pages: {evidencePages}</li>
        <li>File size: {formatFileSize(fileSizeBytes)}</li>
      </ul>
      {warnings.length === 0 ? (
        <p className="text-sm">Warnings: None</p>
      ) : (
        <div className="space-y-2">
          <p className="text-sm font-semibold">Warnings</p>
          {warnings.map((warning) => (
            <StatusMessage key={warning} tone="warning">
              {warning}
            </StatusMessage>
          ))}
        </div>
      )}
    </section>
  );
}
