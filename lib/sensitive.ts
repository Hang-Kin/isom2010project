/**
 * Heuristic only. This checks the file name and cannot inspect file contents.
 * A bland name can still hide a bank statement or an ID scan, and a flagged
 * name can be an ordinary certificate. Callers must ask the student before
 * storing a flagged file.
 */

export type SensitivityResult = {
  flagged: boolean;
  reasons: string[];
};

type SensitivityRule = {
  pattern: RegExp;
  reason: string;
};

// Each rule is one concept. English keywords are case-insensitive because the
// name is lowercased first. Chinese terms include the spec spellings plus
// common simplified, traditional, and Hong Kong variants.
const RULES: SensitivityRule[] = [
  {
    pattern: /bank|銀行|银行/,
    reason: "Looks like a bank document.",
  },
  {
    pattern: /statement|月結單|月结单|月結单|月结單/,
    reason: "Looks like a statement.",
  },
  {
    pattern: /account[\s._-]*(?:no\.?|number|#)|a\/c[\s._-]*no/,
    reason: "Mentions an account number.",
  },
  {
    pattern: /passport|護照|护照/,
    reason: "Looks like a passport.",
  },
  {
    pattern: /hkid|hk[\s._-]*id(?![a-z])|id[\s._-]*card|idcard|identity|身份證|身份证|身分證|身分证/,
    reason: "Looks like an identity document.",
  },
  {
    pattern: /salary|payslip|pay[\s._-]*slip/,
    reason: "Looks like a salary or payslip.",
  },
  {
    pattern: /(^|[^a-z])tax/,
    reason: "Looks like a tax document.",
  },
  {
    pattern: /(^|[^a-z])mpf/,
    reason: "Mentions MPF.",
  },
  {
    pattern: /address[\s._-]*proof|proof[\s._-]*of[\s._-]*address|住址/,
    reason: "Looks like an address proof.",
  },
  {
    pattern: /medical|病歷|病历/,
    reason: "Looks like a medical record.",
  },
];

const LONG_NUMBER = /\d{8,}/;
const LONG_NUMBER_REASON = "Contains a long number (8 or more digits).";

function baseName(fileName: string): string {
  const trimmed = fileName.trim();
  const slash = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
  const base = slash >= 0 ? trimmed.slice(slash + 1) : trimmed;
  return base.normalize("NFKC").toLowerCase();
}

export function checkFileNameSensitivity(fileName: string): SensitivityResult {
  const name = baseName(fileName);
  if (!name) return { flagged: false, reasons: [] };

  const reasons: string[] = [];
  for (const rule of RULES) {
    if (rule.pattern.test(name)) reasons.push(rule.reason);
  }

  // Consecutive digits only. Stripping spaces or dashes would also flag
  // ordinary dated names such as 2024-11-05.
  if (LONG_NUMBER.test(name)) reasons.push(LONG_NUMBER_REASON);

  return { flagged: reasons.length > 0, reasons };
}
