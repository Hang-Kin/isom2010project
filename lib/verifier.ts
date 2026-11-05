const NAME_LIMIT = 80;
const TITLE_LIMIT = 80;
const CONTACT_LIMIT = 120;
const PHONE_MIN_DIGITS = 6;
const PHONE_MAX_DIGITS = 15;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^[0-9+()[\] \-]+$/;

export type VerifierDraft = {
  verifierName: string;
  verifierTitle: string;
  verifierContact: string;
  verifierInPdf: boolean;
};

export type VerifierWrite = {
  verifier_name: string | null;
  verifier_title: string | null;
  verifier_contact: string | null;
  verifier_in_pdf: boolean;
};

export function emptyVerifierDraft(): VerifierDraft {
  return {
    verifierName: "",
    verifierTitle: "",
    verifierContact: "",
    verifierInPdf: false,
  };
}

export function verifierDraftFrom(achievement: {
  verifier_name?: string | null;
  verifier_title?: string | null;
  verifier_contact?: string | null;
  verifier_in_pdf?: boolean | null;
}): VerifierDraft {
  return {
    verifierName: achievement.verifier_name?.trim() ?? "",
    verifierTitle: achievement.verifier_title?.trim() ?? "",
    verifierContact: achievement.verifier_contact?.trim() ?? "",
    verifierInPdf: achievement.verifier_in_pdf === true,
  };
}

export function hasVerifier(value: {
  verifier_name?: string | null;
  verifier_title?: string | null;
  verifier_contact?: string | null;
}): boolean {
  return [value.verifier_name, value.verifier_title, value.verifier_contact].some(
    (part) => typeof part === "string" && part.trim() !== "",
  );
}

export function verifierFieldsFromRow(row: object): VerifierWrite {
  const source = row as {
    verifier_name?: unknown;
    verifier_title?: unknown;
    verifier_contact?: unknown;
    verifier_in_pdf?: unknown;
  };

  return {
    verifier_name: textOrNull(source.verifier_name),
    verifier_title: textOrNull(source.verifier_title),
    verifier_contact: textOrNull(source.verifier_contact),
    verifier_in_pdf: source.verifier_in_pdf === true,
  };
}

export function validateVerifier(draft: VerifierDraft): {
  errors: Partial<Record<keyof VerifierDraft, string>>;
  value?: VerifierWrite;
} {
  const errors: Partial<Record<keyof VerifierDraft, string>> = {};
  const name = draft.verifierName.trim();
  const title = draft.verifierTitle.trim();
  const contact = draft.verifierContact.trim();

  if (name.length > NAME_LIMIT) {
    errors.verifierName = `Name must be ${NAME_LIMIT} characters or fewer.`;
  }
  if (title.length > TITLE_LIMIT) {
    errors.verifierTitle = `Title or role must be ${TITLE_LIMIT} characters or fewer.`;
  }
  if (contact.length > CONTACT_LIMIT) {
    errors.verifierContact = `Contact must be ${CONTACT_LIMIT} characters or fewer.`;
  } else if (contact && !looksLikeEmail(contact) && !looksLikePhone(contact)) {
    errors.verifierContact =
      "Enter an email address or a phone number. Phone numbers can include digits, spaces, +, -, and brackets.";
  }

  if (Object.keys(errors).length > 0) return { errors };

  return {
    errors,
    value: {
      verifier_name: name || null,
      verifier_title: title || null,
      verifier_contact: contact || null,
      verifier_in_pdf: name || title || contact ? draft.verifierInPdf : false,
    },
  };
}

function looksLikeEmail(value: string): boolean {
  return EMAIL_PATTERN.test(value);
}

function looksLikePhone(value: string): boolean {
  if (!PHONE_PATTERN.test(value)) return false;
  const plusCount = value.split("+").length - 1;
  if (plusCount > 1 || (plusCount === 1 && !value.startsWith("+"))) return false;
  const digits = value.replace(/\D/g, "").length;
  return digits >= PHONE_MIN_DIGITS && digits <= PHONE_MAX_DIGITS;
}

function textOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}
