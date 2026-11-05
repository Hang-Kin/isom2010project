import { hasVerifier } from "@/lib/verifier";

export function VerifierBadge({
  achievement,
  selected = false,
}: {
  achievement: {
    verifier_name?: string | null;
    verifier_title?: string | null;
    verifier_contact?: string | null;
    verifier_in_pdf?: boolean | null;
  };
  selected?: boolean;
}) {
  if (!hasVerifier(achievement)) return null;

  const hiddenFromPdf = selected && achievement.verifier_in_pdf !== true;

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <span className="inline-flex rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-semibold text-accent-strong">
        Verifier added
      </span>
      {hiddenFromPdf ? (
        <span className="text-xs text-muted">Verifier is saved, but not included in the PDF.</span>
      ) : null}
    </span>
  );
}
