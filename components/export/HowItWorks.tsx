export function HowItWorks() {
  return (
    <details className="rounded-md border border-line p-3">
      <summary className="cursor-pointer text-sm font-semibold">How these suggestions work</summary>
      <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm">
        <li>Each entry is described by attributes: title, role, category, organiser, and description.</li>
        <li>The criteria you paste become a keyword profile.</li>
        <li>Entries are scored by how much those keywords overlap, with weights on the attributes.</li>
        <li>Your Add and Not relevant choices show how well that score matches your judgement.</li>
      </ol>
      <p className="mt-3 text-sm text-muted">
        Keyword matching only. It does not understand meaning, and it cannot know what assessors
        value. It can be wrong for Chinese text or very short descriptions.
      </p>
    </details>
  );
}
