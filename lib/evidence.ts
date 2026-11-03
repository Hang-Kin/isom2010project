import { friendlySupabaseError } from "@/lib/supabase/errors";
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

function readableUploadError(message: string, fileName: string): string {
  if (/failed to fetch|network|load failed/i.test(message)) {
    return `Could not upload ${fileName}. Check your connection and try again.`;
  }
  if (/size|too large|exceeded/i.test(message)) return sizeError(fileName).message;
  if (/mime|content.type|not allowed/i.test(message)) return typeError(fileName).message;
  return message || `Could not upload ${fileName}.`;
}

export async function uploadEvidence(achievementId: string, file: File): Promise<EvidenceFile> {
  const mime = assertEvidenceFile(file);
  const supabase = createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) {
    throw new Error(userError?.message || "You need to log in before uploading evidence.");
  }

  const path = `${userData.user.id}/${achievementId}/${crypto.randomUUID()}-${sanitizeFileName(file.name)}`;
  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file, {
    upsert: false,
    contentType: mime,
  });

  if (uploadError) {
    throw new Error(readableUploadError(uploadError.message, file.name));
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
    const { error: removeError } = await supabase.storage.from(BUCKET).remove([path]);
    const reason = insertError
      ? friendlySupabaseError(insertError, "The file uploaded, but its record could not be saved.")
      : "The file uploaded, but its record could not be saved.";
    if (removeError) {
      throw new Error(`${reason} The uploaded file could not be removed either. ${removeError.message}`);
    }
    throw new Error(`${reason} The upload was removed.`);
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

  if (error) throw new Error(friendlySupabaseError(error, "Could not load evidence files."));
  return (data ?? []).map((row) => normalizeEvidence(row));
}

export async function deleteEvidence(evidence: EvidenceFile): Promise<void> {
  const supabase = createClient();
  const { error: storageError } = await supabase.storage.from(BUCKET).remove([evidence.file_path]);

  if (storageError && !/not found|does not exist/i.test(storageError.message)) {
    throw new Error(`Could not delete ${evidence.file_name}. ${storageError.message}`);
  }

  const { error } = await supabase.from("evidence_files").delete().eq("id", evidence.id);
  if (error) {
    throw new Error(
      friendlySupabaseError(
        error,
        `Removed ${evidence.file_name} from storage, but the record could not be deleted. Try again.`,
      ),
    );
  }
}

export async function getEvidenceSignedUrl(path: string, seconds = 300): Promise<string> {
  const supabase = createClient();
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, seconds);

  if (error || !data?.signedUrl) {
    throw new Error(error?.message || "Could not open a preview for this file.");
  }

  return data.signedUrl;
}

export async function downloadEvidenceBytes(path: string): Promise<Uint8Array> {
  const supabase = createClient();
  const { data, error } = await supabase.storage.from(BUCKET).download(path);

  if (error || !data) {
    throw new Error(error?.message || "Could not download this evidence file.");
  }

  return new Uint8Array(await data.arrayBuffer());
}
