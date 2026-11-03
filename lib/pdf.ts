import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFImage,
  type PDFPage,
} from "pdf-lib";
import { formatDateRange, formatHours } from "@/lib/achievements";
import { categoryLabel, type AchievementWithEvidence, type EvidenceFile } from "@/lib/types";

const A4: [number, number] = [595.28, 841.89];
const MARGIN = 50;
const FOOTER = 36;
const INK = rgb(0.11, 0.1, 0.08);
const MUTED = rgb(0.39, 0.36, 0.33);

export type SkippedFile = {
  fileName: string;
  reason: string;
};

export type PdfSourceFile = {
  file: EvidenceFile;
  bytes?: Uint8Array;
  error?: string;
};

export type PdfEntry = {
  achievement: AchievementWithEvidence;
  files: PdfSourceFile[];
};

type BuiltPdf = {
  bytes: Uint8Array;
  skipped: SkippedFile[];
  replacedNonLatin: boolean;
};

function sniff(bytes: Uint8Array): "pdf" | "png" | "jpg" | "unknown" {
  if (
    bytes.length >= 5 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46
  ) {
    return "pdf";
  }
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e) {
    return "png";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8) return "jpg";
  return "unknown";
}

function friendlyEmbedError(message: string): string {
  if (/encrypt/i.test(message)) return "This PDF is encrypted and could not be included.";
  if (/parse|invalid|unknown|SOI|IHDR|header/i.test(message)) {
    return "This file could not be read.";
  }
  return "This file could not be included.";
}

class PageWriter {
  private page: PDFPage | null = null;
  private y = 0;
  replaced = false;

  constructor(
    private readonly doc: PDFDocument,
    private readonly regular: PDFFont,
    private readonly bold: PDFFont,
  ) {}

  startPage() {
    this.page = this.doc.addPage(A4);
    this.y = A4[1] - MARGIN;
  }

  private sanitize(text: string, font: PDFFont): string {
    let safe = "";
    for (const character of text) {
      if (character === "\n") {
        safe += "\n";
        continue;
      }
      if (character === "\r") continue;
      if (character === "\t") {
        safe += " ";
        continue;
      }
      try {
        font.encodeText(character);
        safe += character;
      } catch {
        safe += "?";
        this.replaced = true;
      }
    }
    return safe;
  }

  private ensure(height: number) {
    const atTop = this.page !== null && this.y === A4[1] - MARGIN;
    if (this.page && this.y - height >= MARGIN + FOOTER) return;
    if (atTop) return;
    this.startPage();
  }

  private write(
    text: string,
    size: number,
    font: PDFFont,
    color: ReturnType<typeof rgb>,
  ) {
    const safe = this.sanitize(text, font);
    const maxWidth = A4[0] - MARGIN * 2;
    const lines = wrapText(safe, font, size, maxWidth);
    const leading = size * 1.4;

    for (const line of lines) {
      this.ensure(leading);
      if (!this.page) this.startPage();
      if (line && this.page) {
        this.page.drawText(line, {
          x: MARGIN,
          y: this.y - size,
          size,
          font,
          color,
        });
      }
      this.y -= leading;
    }
  }

  heading(text: string, size = 18) {
    this.write(text, size, this.bold, INK);
  }

  line(text: string, size = 11) {
    this.write(text, size, this.regular, INK);
  }

  muted(text: string, size = 10) {
    this.write(text, size, this.regular, MUTED);
  }

  gap(amount: number) {
    if (!this.page || this.y - amount < MARGIN + FOOTER) {
      this.startPage();
      return;
    }
    this.y -= amount;
  }
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];

  for (const paragraph of text.split("\n")) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push("");
      continue;
    }

    let current = "";
    for (const word of words) {
      for (const piece of breakLongWord(word, font, size, maxWidth)) {
        const candidate = current ? `${current} ${piece}` : piece;
        if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
          current = candidate;
        } else {
          if (current) lines.push(current);
          current = piece;
        }
      }
    }
    if (current) lines.push(current);
  }

  return lines.length > 0 ? lines : [""];
}

function breakLongWord(word: string, font: PDFFont, size: number, maxWidth: number): string[] {
  if (font.widthOfTextAtSize(word, size) <= maxWidth) return [word];

  const pieces: string[] = [];
  let current = "";
  for (const character of word) {
    const candidate = current + character;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
    } else {
      if (current) pieces.push(current);
      current = character;
    }
  }
  if (current) pieces.push(current);
  return pieces.length > 0 ? pieces : ["?"];
}

function field(label: string, value: string | null | undefined): string {
  const shown = value?.trim() ? value.trim() : "—";
  return `${label}: ${shown}`;
}

async function drawEntry(
  doc: PDFDocument,
  writer: PageWriter,
  entry: PdfEntry,
  skipped: SkippedFile[],
) {
  const { achievement } = entry;
  writer.startPage();
  writer.heading(achievement.title);
  writer.gap(4);
  writer.line(field("Category", categoryLabel(achievement.category)));
  writer.line(field("Organizer", achievement.organizer));
  writer.line(field("Role", achievement.role));
  writer.line(field("Dates", formatDateRange(achievement.start_date, achievement.end_date)));
  writer.line(
    field(
      "Hours",
      achievement.hours === null ? null : `${formatHours(achievement.hours)} hours`,
    ),
  );
  writer.gap(8);
  writer.heading("Description", 13);
  writer.gap(2);
  writer.line(achievement.description?.trim() || "No description.");

  for (const source of entry.files) {
    const label = `${achievement.title}: ${source.file.file_name}`;
    if (source.error || !source.bytes) {
      skipped.push({
        fileName: label,
        reason: source.error || "The file could not be downloaded.",
      });
      continue;
    }
    await embedEvidence(doc, source.file, source.bytes, label, skipped);
  }
}

async function embedEvidence(
  doc: PDFDocument,
  file: EvidenceFile,
  bytes: Uint8Array,
  label: string,
  skipped: SkippedFile[],
) {
  const kind =
    sniff(bytes) !== "unknown"
      ? sniff(bytes)
      : file.file_type === "application/pdf"
        ? "pdf"
        : file.file_type === "image/png"
          ? "png"
          : file.file_type === "image/jpeg"
            ? "jpg"
            : "unknown";

  try {
    if (kind === "pdf") {
      const source = await PDFDocument.load(bytes);
      const indices = source.getPageIndices();
      if (indices.length === 0) {
        skipped.push({ fileName: label, reason: "The PDF has no pages." });
        return;
      }
      const pages = await doc.copyPages(source, indices);
      pages.forEach((page) => doc.addPage(page));
      return;
    }

    if (kind !== "png" && kind !== "jpg") {
      skipped.push({ fileName: label, reason: "This file is not a PDF, JPEG, or PNG." });
      return;
    }

    const image: PDFImage = kind === "png" ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
    const page = doc.addPage(A4);
    const maxWidth = A4[0] - MARGIN * 2;
    const maxHeight = A4[1] - MARGIN * 2 - FOOTER;
    const scale = Math.min(maxWidth / image.width, maxHeight / image.height, 1);
    const width = image.width * scale;
    const height = image.height * scale;
    page.drawImage(image, {
      x: (A4[0] - width) / 2,
      y: A4[1] - MARGIN - height,
      width,
      height,
    });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "This file could not be included.";
    skipped.push({ fileName: label, reason: friendlyEmbedError(message) });
  }
}

function drawCover(
  doc: PDFDocument,
  regular: PDFFont,
  bold: PDFFont,
  input: {
    applicationName: string;
    username: string;
    userEmail: string;
    generatedAt: Date;
    entries: PdfEntry[];
    skipped: SkippedFile[];
    contentReplaced: boolean;
  },
): boolean {
  const writer = new PageWriter(doc, regular, bold);
  writer.replaced = input.contentReplaced;
  writer.startPage();
  writer.muted("Evidence Vault");
  writer.gap(8);
  writer.heading(input.applicationName || "Evidence packet", 22);
  writer.gap(10);
  writer.line(field("Username", input.username || "Not set"));
  writer.line(field("Email", input.userEmail || "Not set"));
  writer.line(
    field(
      "Date",
      new Intl.DateTimeFormat("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
      }).format(input.generatedAt),
    ),
  );
  writer.gap(14);
  writer.heading("Index", 14);
  writer.gap(4);

  if (input.entries.length === 0) {
    writer.line("No entries selected.");
  } else {
    input.entries.forEach((entry, index) => {
      writer.line(`${index + 1}. ${entry.achievement.title}`);
    });
  }

  if (input.skipped.length > 0) {
    writer.gap(14);
    writer.heading("Not included", 14);
    writer.gap(4);
    for (const skipped of input.skipped) {
      writer.line(`${skipped.fileName} - ${skipped.reason}`);
    }
  }

  if (writer.replaced) {
    writer.gap(14);
    writer.line('Note: characters the PDF font cannot draw were replaced with "?".');
  }

  return writer.replaced;
}

export async function buildEvidencePdf(input: {
  applicationName: string;
  username: string;
  userEmail: string;
  generatedAt: Date;
  entries: PdfEntry[];
}): Promise<BuiltPdf> {
  const content = await PDFDocument.create();
  const regular = await content.embedFont(StandardFonts.Helvetica);
  const bold = await content.embedFont(StandardFonts.HelveticaBold);
  const writer = new PageWriter(content, regular, bold);
  const skipped: SkippedFile[] = [];

  for (const entry of input.entries) {
    await drawEntry(content, writer, entry, skipped);
  }

  const cover = await PDFDocument.create();
  const coverRegular = await cover.embedFont(StandardFonts.Helvetica);
  const coverBold = await cover.embedFont(StandardFonts.HelveticaBold);
  const replacedNonLatin = drawCover(cover, coverRegular, coverBold, {
    applicationName: input.applicationName,
    username: input.username,
    userEmail: input.userEmail,
    generatedAt: input.generatedAt,
    entries: input.entries,
    skipped,
    contentReplaced: writer.replaced,
  });

  const merged = await PDFDocument.create();
  const coverPages = await merged.copyPages(cover, cover.getPageIndices());
  const contentPages =
    content.getPageCount() > 0 ? await merged.copyPages(content, content.getPageIndices()) : [];
  [...coverPages, ...contentPages].forEach((page) => merged.addPage(page));

  try {
    const safeName = input.applicationName.trim() || "Evidence packet";
    merged.setTitle(safeName);
    merged.setAuthor(input.username || "Evidence Vault");
    merged.setCreator("Evidence Vault");
    merged.setCreationDate(input.generatedAt);
    merged.setModificationDate(input.generatedAt);
  } catch {
    // A metadata failure should not discard the packet.
  }

  return {
    bytes: await merged.save(),
    skipped,
    replacedNonLatin,
  };
}
