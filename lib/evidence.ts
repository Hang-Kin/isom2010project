import { compressImageIfNeeded } from "@/lib/image-compress";
import { formatLayeredError, withLayer } from "@/lib/supabase/errors";
import { createClient } from "@/lib/supabase/client";
import type { EvidenceFile } from "@/lib/types";

const BUCKET = "evidence";
const MAX_BYTES = 5 * 1024 * 1024;

const MIME_BY_EXTENSION: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
};

const ALLOWED_MIME = new Set(["application/pdf", "image/jpeg", "image/png"]);

type EvidenceRow = {
  id: string;
  achievement_id: string;
  user_id: string;
  file_name: string;
  file_path: string;
  file_type: string;
  file_size: number | null;
  created_at: string;
};

function extensionOf(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? "";
  const parts = base.toLowerCase().split(".");
  return parts.length > 1 ? (parts.pop() ?? "") : "";
}

function sanitizeFileName(name: string): string {
  const base = name.split(/[/\\]/).pop() || "file";
  const cleaned = base.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/_+/g, "_");
  return cleaned.slice(0, 80) || "file";
}

function normalizeMime(type: string): string {
  const lower = type.toLowerCase();
  if (lower === "image/jpg" || lower === "image/pjpeg") return "image/jpeg";
  return lower;
}

function typeError(fileName: string): Error {
  return new Error(`${fileName} is not allowed. Only PDF, JPEG, and PNG files can be uploaded.`);
}

function sizeError(fileName: string): Error {
  return new Error(`${fileName} is larger than 5 MB. Choose a smaller PDF, JPEG, or PNG.`);
}

export function assertEvidenceFile(file: File): string {
  if (file.size <= 0) {
    throw new Error(`${file.name || "This file"} is empty.`);
  }
  if (file.size > MAX_BYTES) throw sizeError(file.name || "This file");

  const fromExtension = MIME_BY_EXTENSION[extensionOf(file.name)] ?? "";
  const fromType = normalizeMime(file.type);
  const typeIsAllowed = ALLOWED_MIME.has(fromType);
  const fileName = file.name || "This file";

  if (fromExtension && typeIsAllowed && fromExtension !== fromType) {
    throw typeError(fileName);
  }
  if (!fromExtension && !typeIsAllowed) {
    throw typeError(fileName);
  }

  return fromExtension || fromType;
}

function normalizeEvidence(row: EvidenceRow): EvidenceFile {
  return {
    id: row.id,
    achievement_id: row.achievement_id,
    user_id: row.user_id,
    file_name: row.file_name,
    file_path: row.file_path,
    file_type: row.file_type,
    file_size: row.file_size === null ? null : Number(row.file_size),
    created_at: row.created_at,
  };
}

function presentEvidenceError(action: string, error: unknown): string {
  const text = error instanceof Error ? error.message : "";
  if (/larger than 5 MB/i.test(text)) {
    return withLayer("This file is larger than 5 MB. Choose a smaller PDF, JPEG, or PNG", "application");
  }
  if (/is empty/i.test(text)) {
    return withLayer("This file is empty. Choose a PDF, JPEG, or PNG that has content", "application");
  }
  if (/is not allowed/i.test(text)) {
    return withLayer("Only PDF, JPEG, and PNG files can be uploaded", "application");
  }
  return formatLayeredError(action, error);
}

export async function uploadEvidence(achievementId: string, file: File): Promise<EvidenceFile> {
  file = await compressImageIfNeeded(file); // FEAT-12
  let mime: string;
  try {
    mime = assertEvidenceFile(file);
  } catch (cause) {
    throw new Error(presentEvidenceError("Could not upload", cause));
  }
  const supabase = createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) {
    throw new Error(
      formatLayeredError("Could not upload", userError ?? { message: "Unauthorized", status: 401 }),
    );
  }

  const path = `${userData.user.id}/${achievementId}/${crypto.randomUUID()}-${sanitizeFileName(file.name)}`;
  try {
    const uploaded = await supabase.storage.from(BUCKET).upload(path, file, {
      upsert: false,
      contentType: mime,
    });
    if (uploaded.error) throw uploaded.error;
  } catch (cause) {
    throw new Error(formatLayeredError("Could not upload", cause));
  }

  const { data, error: insertError } = await supabase
    .from("evidence_files")
    .insert({
      achievement_id: achievementId,
      user_id: userData.user.id,
      file_name: file.name,
      file_path: path,
      file_type: mime,
      file_size: file.size,
    })
    .select("id, achievement_id, user_id, file_name, file_path, file_type, file_size, created_at")
    .single();

  if (insertError || !data) {
    await supabase.storage.from(BUCKET).remove([path]);
    throw new Error(
      formatLayeredError(
        "Could not save the uploaded file",
        insertError ?? { message: "The file record was not saved.", status: 500 },
      ),
    );
  }

  return normalizeEvidence(data);
}

export async function listEvidence(achievementId: string): Promise<EvidenceFile[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("evidence_files")
    .select("id, achievement_id, user_id, file_name, file_path, file_type, file_size, created_at")
    .eq("achievement_id", achievementId)
    .order("created_at", { ascending: true });

  if (error) throw new Error(formatLayeredError("Could not load evidence files", error));
  return (data ?? []).map((row) => normalizeEvidence(row));
}

export async function deleteEvidence(evidence: EvidenceFile): Promise<void> {
  const supabase = createClient();
  const { error: storageError } = await supabase.storage.from(BUCKET).remove([evidence.file_path]);

  if (storageError && !/not found|does not exist/i.test(storageError.message ?? "")) {
    throw new Error(formatLayeredError("Could not delete this file", storageError));
  }

  const { error } = await supabase.from("evidence_files").delete().eq("id", evidence.id);
  if (error) throw new Error(formatLayeredError("Could not delete this file", error));
}

export async function getEvidenceSignedUrl(path: string, seconds = 300): Promise<string> {
  const supabase = createClient();
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, seconds);

  if (error || !data?.signedUrl) {
    throw new Error(formatLayeredError("Could not open this file", error ?? { message: "Not found", status: 404 }));
  }

  return data.signedUrl;
}

export async function downloadEvidenceBytes(path: string): Promise<Uint8Array> {
  const supabase = createClient();
  const { data, error } = await supabase.storage.from(BUCKET).download(path);

  if (error || !data) {
    throw new Error(
      formatLayeredError("Could not download this file", error ?? { message: "Not found", status: 404 }),
    );
  }

  return new Uint8Array(await data.arrayBuffer());
}
