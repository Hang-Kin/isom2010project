import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFEmbeddedPage,
  type PDFFont,
  type PDFImage,
  type PDFPage,
} from "pdf-lib";
import { formatDateRange, formatHours } from "@/lib/achievements";
import { getActivePresetId, pdfTitleFor, type PresetId } from "@/lib/presets";
import type { AchievementWithEvidence, EvidenceFile } from "@/lib/types";

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 50;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const CONTENT_TOP = PAGE_HEIGHT - MARGIN;
const CONTENT_BOTTOM = 54;
const FOOTER_RULE_Y = 36;
const FOOTER_BASELINE = 20;

const BAND_HEIGHT = 24;
const CAPTION_SIZE = 9;
const CAPTION_BASELINE = CONTENT_TOP - BAND_HEIGHT - 16;
const FRAME_TOP = CAPTION_BASELINE - 12;
const FIGURE_SIZE = 9;
const FIGURE_BASELINE = CONTENT_BOTTOM;
const FRAME_BOTTOM = FIGURE_BASELINE + 16;
const EVIDENCE_FRAME = {
  x: MARGIN,
  y: FRAME_BOTTOM,
  width: CONTENT_WIDTH,
  height: FRAME_TOP - FRAME_BOTTOM,
};

const TABLE_SIZE = 8;
const TABLE_LEADING = 11;
const TABLE_PAD_X = 4;
const TABLE_PAD_Y = 4;
const FIELD_LABEL_WIDTH = 108;

const INK = rgb(0.12, 0.12, 0.12);
const MUTED = rgb(0.33, 0.33, 0.33);
const RULE = rgb(0.45, 0.45, 0.45);
const FRAME = rgb(0.25, 0.28, 0.27);
const BAND = rgb(0.114, 0.278, 0.22);
const WHITE = rgb(1, 1, 1);
const HEADER_BG = rgb(0.93, 0.93, 0.93);

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

export type BuiltPdf = {
  bytes: Uint8Array;
  skipped: SkippedFile[];
  replacedNonLatin: boolean;
  achievementCount: number;
  evidencePageCount: number;
};

type Column = {
  title: string;
  width: number;
};

type PlannedPiece =
  | { kind: "image"; image: PDFImage }
  | { kind: "pdf"; embedded: PDFEmbeddedPage; page: number; pageCount: number }
  | { kind: "failed"; reason: string };

type PlannedFile = {
  fileName: string;
  fileTypeLabel: string;
  pieces: PlannedPiece[];
};

type PlannedEntry = {
  number: number;
  achievement: AchievementWithEvidence;
  files: PlannedFile[];
};

/**
 * Capitalise the first letter of any category slug.
 * New categories do not need a list in the PDF.
 */
function categoryLabel(category: string): string {
  const value = String(category ?? "").trim();
  if (!value) return "Not provided";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function optionalText(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  if (!trimmed || trimmed.toLowerCase() === "not set") return null;
  return trimmed;
}

function provided(value: string | null | undefined): string {
  return optionalText(value) ?? "Not provided";
}

function applicantName(username: string, email: string): string {
  return optionalText(username) || optionalText(email) || "Applicant";
}

function singleLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function periodLabel(start: string | null, end: string | null): string {
  const formatted = formatDateRange(start, end);
  if (!formatted) return "Not provided";
  return formatted.replace(/\u2013|\u2014/g, "-").replace(/[\u00A0\u202F\u2007\u2009]/g, " ");
}

function hoursLabel(hours: number | null): string {
  if (hours === null || !Number.isFinite(hours)) return "Not provided";
  return `${formatHours(hours)} hours`;
}

function formatGeneratedDate(date: Date): string {
  if (Number.isNaN(date.getTime())) return "Not provided";
  const months = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
}

function summaryColumns(): Column[] {
  const fixed = [
    { title: "No.", width: 36 },
    { title: "Achievement", width: 168 },
    { title: "Category", width: 88 },
    { title: "Period", width: 118 },
  ];
  const used = fixed.reduce((sum, column) => sum + column.width, 0);
  return [...fixed, { title: "Evidence items", width: CONTENT_WIDTH - used }];
}

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

function detectKind(bytes: Uint8Array, fileType: string): "pdf" | "png" | "jpg" | "unknown" {
  const sniffed = sniff(bytes);
  if (sniffed !== "unknown") return sniffed;
  if (fileType === "application/pdf") return "pdf";
  if (fileType === "image/png") return "png";
  if (fileType === "image/jpeg" || fileType === "image/jpg") return "jpg";
  return "unknown";
}

function fileTypeLabel(kind: "pdf" | "png" | "jpg" | "unknown", fileType: string): string {
  if (kind === "pdf" || fileType === "application/pdf") return "PDF";
  if (kind === "png" || fileType === "image/png") return "PNG";
  if (kind === "jpg" || fileType === "image/jpeg" || fileType === "image/jpg") return "JPEG";
  const named = fileType.trim();
  return named || "Unknown";
}

function friendlyEmbedError(message: string): string {
  if (/encrypt|password/i.test(message)) return "This PDF is encrypted and could not be included.";
  if (/no pages/i.test(message)) return "The PDF has no pages.";
  if (/parse|invalid|unknown|SOI|IHDR|header|corrupt/i.test(message)) {
    return "This file could not be read.";
  }
  return "This file could not be included.";
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
  if (maxWidth <= 0) return ["?"];
  if (font.widthOfTextAtSize(word, size) <= maxWidth) return [word];

  const pieces: string[] = [];
  let current = "";
  for (const character of word) {
    const candidate = current + character;
    if (current && font.widthOfTextAtSize(candidate, size) > maxWidth) {
      pieces.push(current);
      current = character;
    } else {
      current = candidate;
    }
  }
  if (current) pieces.push(current);
  return pieces.length > 0 ? pieces : ["?"];
}

function truncateToWidth(text: string, font: PDFFont, size: number, maxWidth: number): string {
  if (maxWidth <= 0) return "";
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
  const ellipsis = "...";
  if (font.widthOfTextAtSize(ellipsis, size) > maxWidth) return "";

  let kept = "";
  for (const character of text) {
    const candidate = kept + character;
    if (font.widthOfTextAtSize(`${candidate}...`, size) > maxWidth) break;
    kept = candidate;
  }
  return `${kept.trimEnd()}...`;
}

function rowLineCount(cells: string[][]): number {
  return cells.reduce((max, lines) => Math.max(max, lines.length), 1);
}

class Layout {
  private page!: PDFPage;
  private y = CONTENT_TOP;
  private fresh = true;
  private flowHeader: string | null = null;
  private flowContinued = false;
  readonly pages: PDFPage[] = [];
  replaced = false;

  constructor(
    private readonly doc: PDFDocument,
    private readonly regular: PDFFont,
    private readonly bold: PDFFont,
  ) {}

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

  private openPage(kind: "blank" | "flow") {
    this.page = this.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    this.pages.push(this.page);
    this.y = CONTENT_TOP;
    this.fresh = true;
    if (kind === "flow" && this.flowHeader) {
      const text = this.flowContinued ? `${this.flowHeader} (continued)` : this.flowHeader;
      this.y = this.paintBandOn(this.page, this.y, text);
      this.y -= 12;
      this.flowContinued = true;
    }
  }

  private ensure(height: number) {
    if (this.y - height >= CONTENT_BOTTOM) return;
    if (this.fresh) return;
    this.openPage("flow");
  }

  private paintBandOn(page: PDFPage, top: number, text: string): number {
    const bottom = top - BAND_HEIGHT;
    page.drawRectangle({
      x: MARGIN,
      y: bottom,
      width: CONTENT_WIDTH,
      height: BAND_HEIGHT,
      color: BAND,
    });
    const size = 11;
    const label = truncateToWidth(
      this.sanitize(singleLine(text), this.bold),
      this.bold,
      size,
      CONTENT_WIDTH - 16,
    );
    if (label) {
      page.drawText(label, {
        x: MARGIN + 8,
        y: bottom + BAND_HEIGHT / 2 - size * 0.35,
        size,
        font: this.bold,
        color: WHITE,
      });
    }
    return bottom;
  }

  beginCover(coverTitle = "Evidence Portfolio") {
    this.flowHeader = null;
    this.flowContinued = false;
    this.openPage("blank");
    this.flowHeader = coverTitle;
    this.flowContinued = true;
  }

  private startAchievement(number: number) {
    this.flowHeader = `Achievement ${number}`;
    this.flowContinued = false;
    this.openPage("flow");
  }

  private startEvidencePage(): PDFPage {
    this.flowHeader = null;
    this.openPage("blank");
    return this.page;
  }

  gap(amount: number) {
    if (amount <= 0) return;
    if (this.y - amount < CONTENT_BOTTOM) return;
    this.y -= amount;
  }

  drawParagraph(
    text: string,
    options?: { size?: number; font?: "regular" | "bold"; color?: ReturnType<typeof rgb> },
  ) {
    const size = options?.size ?? 11;
    const font = options?.font === "bold" ? this.bold : this.regular;
    const color = options?.color ?? INK;
    const lines = wrapText(this.sanitize(text, font), font, size, CONTENT_WIDTH);
    const leading = size * 1.4;

    for (const line of lines) {
      this.ensure(leading);
      if (line) {
        this.page.drawText(line, {
          x: MARGIN,
          y: this.y - size,
          size,
          font,
          color,
        });
      }
      this.y -= leading;
      this.fresh = false;
    }
  }

  private drawRule() {
    this.ensure(10);
    const y = this.y - 4;
    this.page.drawLine({
      start: { x: MARGIN, y },
      end: { x: MARGIN + CONTENT_WIDTH, y },
      thickness: 1,
      color: BAND,
    });
    this.y -= 10;
    this.fresh = false;
  }

  private drawField(label: string, value: string) {
    const size = 11;
    const leading = size * 1.4;
    const valueWidth = CONTENT_WIDTH - FIELD_LABEL_WIDTH;
    const lines = wrapText(this.sanitize(value, this.regular), this.regular, size, valueWidth);
    const shown = lines.length > 0 ? lines : [""];
    const safeLabel = this.sanitize(label, this.bold);

    for (let index = 0; index < shown.length; index += 1) {
      const line = shown[index] ?? "";
      this.ensure(leading);
      if (index === 0 && safeLabel) {
        this.page.drawText(safeLabel, {
          x: MARGIN,
          y: this.y - size,
          size,
          font: this.bold,
          color: INK,
        });
      }
      if (line) {
        this.page.drawText(line, {
          x: MARGIN + FIELD_LABEL_WIDTH,
          y: this.y - size,
          size,
          font: this.regular,
          color: INK,
        });
      }
      this.y -= leading;
      this.fresh = false;
    }
  }

  private cellLines(text: string, width: number, header: boolean): string[] {
    const font = header ? this.bold : this.regular;
    const safe = this.sanitize(singleLine(text), font);
    const lines = wrapText(safe, font, TABLE_SIZE, Math.max(8, width - TABLE_PAD_X * 2));
    return lines.length > 0 ? lines : [""];
  }

  private rowHeight(cells: string[][]): number {
    return rowLineCount(cells) * TABLE_LEADING + TABLE_PAD_Y * 2;
  }

  private paintRow(cells: string[][], columns: Column[], header: boolean) {
    const top = this.y;
    const rowHeight = this.rowHeight(cells);
    const bottom = top - rowHeight;
    if (header) {
      this.page.drawRectangle({
        x: MARGIN,
        y: bottom,
        width: CONTENT_WIDTH,
        height: rowHeight,
        color: HEADER_BG,
      });
    }

    let x = MARGIN;
    columns.forEach((column, index) => {
      const lines = cells[index] ?? [""];
      const font = header ? this.bold : this.regular;
      lines.forEach((line, lineIndex) => {
        if (!line) return;
        this.page.drawText(line, {
          x: x + TABLE_PAD_X,
          y: top - TABLE_PAD_Y - TABLE_SIZE - lineIndex * TABLE_LEADING,
          size: TABLE_SIZE,
          font,
          color: INK,
        });
      });
      x += column.width;
    });

    const left = MARGIN;
    const right = MARGIN + CONTENT_WIDTH;
    if (header) {
      this.page.drawLine({
        start: { x: left, y: top },
        end: { x: right, y: top },
        thickness: 0.6,
        color: RULE,
      });
    }
    this.page.drawLine({
      start: { x: left, y: bottom },
      end: { x: right, y: bottom },
      thickness: 0.6,
      color: RULE,
    });
    let boundary = left;
    this.page.drawLine({
      start: { x: boundary, y: bottom },
      end: { x: boundary, y: top },
      thickness: 0.6,
      color: RULE,
    });
    for (const column of columns) {
      boundary += column.width;
      this.page.drawLine({
        start: { x: boundary, y: bottom },
        end: { x: boundary, y: top },
        thickness: 0.6,
        color: RULE,
      });
    }

    this.y = bottom;
    this.fresh = false;
  }

  private clipLines(cells: string[][], columns: Column[], maxHeight: number): string[][] {
    const next = cells.map((lines) => [...lines]);
    let guard = 0;
    while (this.rowHeight(next) > maxHeight && guard < 200) {
      guard += 1;
      let index = 0;
      for (let cursor = 1; cursor < next.length; cursor += 1) {
        if ((next[cursor]?.length ?? 0) > (next[index]?.length ?? 0)) index = cursor;
      }
      const lines = next[index];
      const column = columns[index];
      if (!lines || !column || lines.length <= 1) break;
      lines.pop();
      const lastIndex = lines.length - 1;
      const last = (lines[lastIndex] ?? "").replace(/\.\.\.$/, "");
      lines[lastIndex] = truncateToWidth(
        `${last}...`,
        this.regular,
        TABLE_SIZE,
        column.width - TABLE_PAD_X * 2,
      );
    }
    return next;
  }

  private drawSummaryTable(rows: string[][]) {
    const columns = summaryColumns();
    const headerLines = columns.map((column) => this.cellLines(column.title, column.width, true));
    const drawHeader = () => {
      this.paintRow(headerLines, columns, true);
    };

    if (this.y - this.rowHeight(headerLines) < CONTENT_BOTTOM && !this.fresh) {
      this.openPage("flow");
    }
    drawHeader();

    const body = rows.length > 0 ? rows : [["", "No achievements selected.", "", "", ""]];
    for (const row of body) {
      let lines = columns.map((column, index) => this.cellLines(row[index] ?? "", column.width, false));
      if (this.y - this.rowHeight(lines) < CONTENT_BOTTOM && !this.fresh) {
        this.openPage("flow");
        drawHeader();
      }
      const maxHeight = this.y - CONTENT_BOTTOM;
      if (this.rowHeight(lines) > maxHeight) lines = this.clipLines(lines, columns, maxHeight);
      this.paintRow(lines, columns, false);
    }
  }

  drawCover(input: {
    applicationName: string;
    applicant: string;
    yearOfStudy: string | null;
    major: string | null;
    generatedAt: Date;
    rows: string[][];
    skipped: SkippedFile[];
    coverTitle?: string;
  }) {
    const coverTitle = optionalText(input.coverTitle) ?? "Evidence Portfolio";
    this.beginCover(coverTitle);
    this.drawParagraph(coverTitle, { font: "bold", size: 22 });
    this.drawRule();
    this.gap(6);
    this.drawParagraph(`Applicant: ${input.applicant}`);
    if (input.yearOfStudy) this.drawParagraph(`Year of study: ${input.yearOfStudy}`);
    if (input.major) this.drawParagraph(`Major: ${input.major}`);
    this.drawParagraph(`Application: ${optionalText(input.applicationName) ?? "Not provided"}`);
    this.drawParagraph(`Date generated: ${formatGeneratedDate(input.generatedAt)}`);
    this.gap(14);
    this.drawParagraph("Summary", { font: "bold", size: 13 });
    this.gap(6);
    this.drawSummaryTable(input.rows);

    if (input.skipped.length > 0) {
      this.gap(14);
      this.drawParagraph("Not included", { font: "bold", size: 13 });
      this.gap(4);
      for (const skipped of input.skipped) {
        this.drawParagraph(`${skipped.fileName}: ${skipped.reason}`, { size: 10 });
      }
    }
  }

  drawAchievement(entry: PlannedEntry) {
    this.startAchievement(entry.number);
    const achievement = entry.achievement;
    this.drawField("Title", provided(achievement.title));
    this.drawField("Category", categoryLabel(achievement.category));
    this.drawField("Organiser", provided(achievement.organizer));
    this.drawField("Role", provided(achievement.role));
    this.drawField("Period", periodLabel(achievement.start_date, achievement.end_date));
    this.drawField("Hours", hoursLabel(achievement.hours));
    this.gap(8);
    this.drawParagraph("Description", { font: "bold" });
    this.gap(2);
    this.drawParagraph(provided(achievement.description));
    this.gap(10);
    this.drawParagraph("Supporting evidence", { font: "bold" });
    this.gap(2);
    if (entry.files.length === 0) {
      this.drawParagraph("No supporting evidence attached.");
      return;
    }
    entry.files.forEach((file, index) => {
      const name = file.fileName.trim() || "Untitled file";
      this.drawParagraph(`Evidence ${entry.number}.${index + 1} - ${name}`);
    });
  }

  drawEvidencePiece(options: {
    achievementNumber: number;
    evidenceNumber: number;
    title: string;
    fileName: string;
    fileTypeLabel: string;
    piece: PlannedPiece;
  }) {
    const page = this.startEvidencePage();
    const tag = `Evidence ${options.achievementNumber}.${options.evidenceNumber}`;
    const title = provided(options.title);
    this.paintBandOn(
      page,
      CONTENT_TOP,
      `${tag} - supports Achievement ${options.achievementNumber}: ${title}`,
    );

    const pageNote =
      options.piece.kind === "pdf"
        ? `${tag} (page ${options.piece.page} of ${options.piece.pageCount})`
        : null;
    const caption = this.caption(options.fileName, options.fileTypeLabel, pageNote);
    if (caption) {
      page.drawText(caption, {
        x: MARGIN,
        y: CAPTION_BASELINE,
        size: CAPTION_SIZE,
        font: this.regular,
        color: MUTED,
      });
    }

    page.drawRectangle({
      x: EVIDENCE_FRAME.x,
      y: EVIDENCE_FRAME.y,
      width: EVIDENCE_FRAME.width,
      height: EVIDENCE_FRAME.height,
      color: WHITE,
      borderColor: FRAME,
      borderWidth: 0.8,
    });

    const piece = options.piece;
    if (piece.kind === "image") {
      const image = piece.image;
      this.drawFitted(image.width, image.height, (rect) => {
        page.drawImage(image, rect);
      });
    } else if (piece.kind === "pdf") {
      const embedded = piece.embedded;
      this.drawFitted(embedded.width, embedded.height, (rect) => {
        page.drawPage(embedded, rect);
      });
    } else {
      this.drawFrameMessage(`${tag} could not be included: ${piece.reason}`);
    }

    const figure = truncateToWidth(
      this.sanitize(
        `Figure ${options.achievementNumber}.${options.evidenceNumber}: Evidence of Achievement ${options.achievementNumber}`,
        this.regular,
      ),
      this.regular,
      FIGURE_SIZE,
      CONTENT_WIDTH,
    );
    if (figure) {
      const width = this.regular.widthOfTextAtSize(figure, FIGURE_SIZE);
      page.drawText(figure, {
        x: MARGIN + (CONTENT_WIDTH - width) / 2,
        y: FIGURE_BASELINE,
        size: FIGURE_SIZE,
        font: this.regular,
        color: INK,
      });
    }
  }

  private caption(fileName: string, fileType: string, pageNote: string | null): string {
    const safeName = this.sanitize(singleLine(fileName) || "Untitled file", this.regular);
    const safeType = this.sanitize(singleLine(fileType) || "Unknown", this.regular);
    const safeNote = pageNote ? this.sanitize(singleLine(pageNote), this.regular) : "";
    const prefix = safeNote ? `${safeNote} | ` : "";
    const tail = ` | ${safeType}`;
    const fixedWidth = this.regular.widthOfTextAtSize(`${prefix}${tail}`, CAPTION_SIZE);
    const name = truncateToWidth(
      safeName,
      this.regular,
      CAPTION_SIZE,
      Math.max(36, CONTENT_WIDTH - fixedWidth),
    );
    return truncateToWidth(`${prefix}${name}${tail}`, this.regular, CAPTION_SIZE, CONTENT_WIDTH);
  }

  private drawFitted(
    width: number,
    height: number,
    draw: (rect: { x: number; y: number; width: number; height: number }) => void,
  ) {
    const padding = 8;
    const maxWidth = EVIDENCE_FRAME.width - padding * 2;
    const maxHeight = EVIDENCE_FRAME.height - padding * 2;
    if (width <= 0 || height <= 0 || maxWidth <= 0 || maxHeight <= 0) return;
    const scale = Math.min(maxWidth / width, maxHeight / height);
    const drawnWidth = width * scale;
    const drawnHeight = height * scale;
    draw({
      x: EVIDENCE_FRAME.x + (EVIDENCE_FRAME.width - drawnWidth) / 2,
      y: EVIDENCE_FRAME.y + (EVIDENCE_FRAME.height - drawnHeight) / 2,
      width: drawnWidth,
      height: drawnHeight,
    });
  }

  private drawFrameMessage(message: string) {
    const size = 12;
    const leading = 16;
    const padding = 18;
    const maxWidth = EVIDENCE_FRAME.width - padding * 2;
    let lines = wrapText(this.sanitize(message, this.regular), this.regular, size, maxWidth);
    const maxLines = Math.max(1, Math.floor((EVIDENCE_FRAME.height - padding * 2) / leading));
    if (lines.length > maxLines) {
      lines = lines.slice(0, maxLines);
      const last = lines[maxLines - 1] ?? "";
      lines[maxLines - 1] = truncateToWidth(`${last.replace(/\.\.\.$/, "")}...`, this.regular, size, maxWidth);
    }
    const block = lines.length * leading;
    let baseline = EVIDENCE_FRAME.y + (EVIDENCE_FRAME.height + block) / 2 - size;
    for (const line of lines) {
      if (line) {
        const width = this.regular.widthOfTextAtSize(line, size);
        this.page.drawText(line, {
          x: EVIDENCE_FRAME.x + (EVIDENCE_FRAME.width - width) / 2,
          y: baseline,
          size,
          font: this.regular,
          color: INK,
        });
      }
      baseline -= leading;
    }
  }

  stampFooters(applicant: string) {
    const total = this.pages.length;
    const size = 9;
    for (let index = 0; index < total; index += 1) {
      const page = this.pages[index];
      if (!page) continue;
      const label = `Page ${index + 1} of ${total}`;
      const labelWidth = this.regular.widthOfTextAtSize(label, size);
      const name = truncateToWidth(
        this.sanitize(singleLine(applicant), this.regular),
        this.regular,
        size,
        Math.max(24, CONTENT_WIDTH - labelWidth - 16),
      );
      page.drawLine({
        start: { x: MARGIN, y: FOOTER_RULE_Y },
        end: { x: PAGE_WIDTH - MARGIN, y: FOOTER_RULE_Y },
        thickness: 0.7,
        color: RULE,
      });
      if (name) {
        page.drawText(name, {
          x: MARGIN,
          y: FOOTER_BASELINE,
          size,
          font: this.regular,
          color: MUTED,
        });
      }
      page.drawText(label, {
        x: PAGE_WIDTH - MARGIN - labelWidth,
        y: FOOTER_BASELINE,
        size,
        font: this.regular,
        color: MUTED,
      });
    }
  }
}

async function planFile(doc: PDFDocument, source: PdfSourceFile): Promise<PlannedFile> {
  const fileName = source.file.file_name.trim() || "Untitled file";
  if (source.error || !source.bytes || source.bytes.length === 0) {
    return {
      fileName,
      fileTypeLabel: fileTypeLabel("unknown", source.file.file_type),
      pieces: [{ kind: "failed", reason: source.error || "The file could not be downloaded." }],
    };
  }

  const kind = detectKind(source.bytes, source.file.file_type);
  const label = fileTypeLabel(kind, source.file.file_type);
  try {
    if (kind === "png" || kind === "jpg") {
      const image = kind === "png" ? await doc.embedPng(source.bytes) : await doc.embedJpg(source.bytes);
      if (image.width <= 0 || image.height <= 0) {
        return {
          fileName,
          fileTypeLabel: label,
          pieces: [{ kind: "failed", reason: "This file could not be read." }],
        };
      }
      return { fileName, fileTypeLabel: label, pieces: [{ kind: "image", image }] };
    }

    if (kind === "pdf") {
      const sourceDoc = await PDFDocument.load(source.bytes);
      const pageCount = sourceDoc.getPageCount();
      if (pageCount === 0) {
        return {
          fileName,
          fileTypeLabel: label,
          pieces: [{ kind: "failed", reason: "The PDF has no pages." }],
        };
      }
      const pieces: PlannedPiece[] = [];
      for (let index = 0; index < pageCount; index += 1) {
        const embedded = await doc.embedPage(sourceDoc.getPage(index));
        if (embedded.width <= 0 || embedded.height <= 0) {
          throw new Error("This file could not be read.");
        }
        pieces.push({ kind: "pdf", embedded, page: index + 1, pageCount });
      }
      return { fileName, fileTypeLabel: label, pieces };
    }

    return {
      fileName,
      fileTypeLabel: label,
      pieces: [{ kind: "failed", reason: "This file is not a PDF, JPEG, or PNG." }],
    };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "";
    const reason = message.startsWith("This ") ? message : friendlyEmbedError(message);
    return { fileName, fileTypeLabel: label, pieces: [{ kind: "failed", reason }] };
  }
}

function evidenceList(entry: PlannedEntry): string {
  if (entry.files.length === 0) return "None";
  return entry.files.map((_, index) => `Evidence ${entry.number}.${index + 1}`).join(", ");
}

export async function buildEvidencePdf(input: {
  applicationName: string;
  username: string;
  userEmail: string;
  generatedAt: Date;
  entries: PdfEntry[];
  yearOfStudy?: string | null;
  major?: string | null;
  preset?: PresetId | null;
}): Promise<BuiltPdf> {
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const layout = new Layout(doc, regular, bold);
  const skipped: SkippedFile[] = [];
  const prepared: PlannedEntry[] = [];
  let evidencePageCount = 0;

  for (let index = 0; index < input.entries.length; index += 1) {
    const entry = input.entries[index];
    if (!entry) continue;
    const number = index + 1;
    const files: PlannedFile[] = [];
    for (let fileIndex = 0; fileIndex < entry.files.length; fileIndex += 1) {
      const source = entry.files[fileIndex];
      if (!source) continue;
      const planned = await planFile(doc, source);
      files.push(planned);
      evidencePageCount += planned.pieces.length;
      const failure = planned.pieces.find((piece) => piece.kind === "failed");
      if (failure && failure.kind === "failed") {
        skipped.push({
          fileName: `Evidence ${number}.${fileIndex + 1} - ${planned.fileName}`,
          reason: failure.reason,
        });
      }
    }
    prepared.push({ number, achievement: entry.achievement, files });
  }

  const applicant = applicantName(input.username, input.userEmail);
  const coverTitle = pdfTitleFor(
    input.preset !== undefined ? input.preset : getActivePresetId(),
  );
  layout.drawCover({
    applicationName: input.applicationName,
    applicant,
    yearOfStudy: optionalText(input.yearOfStudy),
    major: optionalText(input.major),
    generatedAt: input.generatedAt,
    rows: prepared.map((entry) => [
      String(entry.number),
      provided(entry.achievement.title),
      categoryLabel(entry.achievement.category),
      periodLabel(entry.achievement.start_date, entry.achievement.end_date),
      evidenceList(entry),
    ]),
    skipped,
    coverTitle,
  });

  for (const entry of prepared) {
    layout.drawAchievement(entry);
    entry.files.forEach((file, fileIndex) => {
      file.pieces.forEach((piece) => {
        layout.drawEvidencePiece({
          achievementNumber: entry.number,
          evidenceNumber: fileIndex + 1,
          title: entry.achievement.title,
          fileName: file.fileName,
          fileTypeLabel: file.fileTypeLabel,
          piece,
        });
      });
    });
  }

  layout.stampFooters(applicant);

  const metadataTitle = optionalText(input.applicationName) ?? coverTitle;
  try {
    doc.setTitle(metadataTitle);
    doc.setAuthor(applicant);
    doc.setCreator("Evidence Vault");
    if (!Number.isNaN(input.generatedAt.getTime())) {
      doc.setCreationDate(input.generatedAt);
      doc.setModificationDate(input.generatedAt);
    }
  } catch {
    try {
      doc.setTitle("Evidence Portfolio");
      doc.setAuthor("Evidence Vault");
      doc.setCreationDate(new Date());
    } catch {
      // A metadata failure should not discard the portfolio.
    }
  }

  return {
    bytes: await doc.save(),
    skipped,
    replacedNonLatin: layout.replaced,
    achievementCount: input.entries.length,
    evidencePageCount,
  };
}
