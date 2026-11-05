type SupabaseErrorLike = {
  message?: string;
  code?: string;
};

export function friendlySupabaseError(
  error: SupabaseErrorLike | null | undefined,
  fallback: string,
): string {
  const message = error?.message?.trim() || fallback;

  if (
    /relation .* does not exist|schema cache|could not find the table|could not find the/i.test(
      message,
    )
  ) {
    return `${message} Paste supabase/schema.sql into the Supabase SQL editor, then try again.`;
  }

  return message;
}

export type ErrorLayer = "application" | "middleware" | "system";

export type ErrorDescription = {
  message: string;
  layer: ErrorLayer;
  hint: string;
};

type ErrorLike = {
  message?: string;
  code?: string;
  status?: number | string;
  statusCode?: number | string;
  name?: string;
  error?: string;
};

const SCHEMA_HINT =
  "Paste supabase/schema.sql into the Supabase SQL editor, then try again.";

function toErrorLike(error: unknown): ErrorLike {
  if (typeof error === "string") return { message: error };
  if (!error || typeof error !== "object") return {};
  const value = error as ErrorLike;
  const message =
    typeof value.message === "string"
      ? value.message
      : typeof value.error === "string"
        ? value.error
        : undefined;
  return {
    message,
    code: typeof value.code === "string" ? value.code : undefined,
    status: value.status,
    statusCode: value.statusCode,
    name: error instanceof Error ? error.name : typeof value.name === "string" ? value.name : undefined,
    error: typeof value.error === "string" ? value.error : undefined,
  };
}

function statusCode(error: ErrorLike): number | null {
  const raw = error.status ?? error.statusCode;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string" && raw.trim() !== "") {
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function isFriendlyValidation(message: string): boolean {
  return /larger than 5 MB|is empty|is not allowed|only pdf, jpeg, and png|must be a whole number|must be at least 1|date window|end date cannot|hours cannot|choose a category|title is required/i.test(
    message,
  );
}

function isSystemFailure(error: ErrorLike, message: string): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  const name = error.name ?? "";
  if (/^(QuotaExceededError|SecurityError|NotAllowedError|NotReadableError|NetworkError)$/i.test(name)) {
    return true;
  }
  return /failed to fetch|networkerror|network request failed|load failed|err_internet_disconnected|the internet connection appears to be offline|offline/i.test(
    message,
  );
}

function isMiddlewareFailure(error: ErrorLike, message: string): boolean {
  const status = statusCode(error);
  if (status !== null && status >= 400) return true;
  const code = (error.code ?? "").toUpperCase();
  if (/^PGRST/.test(code) || /^[0-9A-Z]{5}$/.test(code)) return true;
  return /row-level security|permission denied|not authorized|unauthorized|forbidden|invalid jwt|jwt expired|jwt|policy|schema cache|could not find the table|relation .* does not exist|timeout|timed out|too many connections|storage|bucket/i.test(
    message,
  );
}

function hintFor(layer: ErrorLayer, error: ErrorLike, message: string): string {
  if (layer === "system") {
    if (
      /QuotaExceededError|SecurityError|NotAllowedError|NotReadableError/i.test(error.name ?? "") ||
      /blocked|denied permission/i.test(message)
    ) {
      return "This browser blocked the action. Check permissions and try again.";
    }
    return "Check your connection and try again.";
  }
  if (layer === "middleware") {
    if (/schema cache|could not find the table|relation .* does not exist|could not find the/i.test(message)) {
      return SCHEMA_HINT;
    }
    return "The service could not complete this. Try again in a moment.";
  }
  return "Check the information and try again.";
}

function classifyLayer(error: ErrorLike, message: string): ErrorLayer {
  if (isFriendlyValidation(message)) return "application";
  if (isSystemFailure(error, message)) return "system";
  if (isMiddlewareFailure(error, message)) return "middleware";
  return "application";
}

export function describeError(error: unknown, fallback = "Something went wrong."): ErrorDescription {
  const like = toErrorLike(error);
  const raw = like.message?.trim() || fallback;
  const layer = classifyLayer(like, raw);
  return {
    message: layer === "application" && raw !== fallback ? raw : fallback,
    layer,
    hint: hintFor(layer, like, raw),
  };
}

export function withLayer(message: string, layer: ErrorLayer, hint?: string): string {
  const text = message.trim().replace(/\.+$/, "");
  if (hint === undefined && layer === "application") return `${text} (application layer).`;
  const extra = hint ?? hintFor(layer, {}, "");
  return `${text} (${layer} layer). ${extra}`;
}

export function formatLayeredError(action: string, error: unknown): string {
  const described = describeError(error, action);
  return withLayer(action, described.layer, described.hint);
}
