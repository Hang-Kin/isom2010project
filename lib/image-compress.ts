"use client";

import { createElement, useEffect, useId, useState, type ReactNode, type Ref } from "react";

const MAX_BYTES = Math.round(1.5 * 1024 * 1024);
const MAX_EDGE = 2000;
const JPEG_QUALITY = 0.8;

type CompressionSnapshot = {
  busy: number;
  messages: string[];
  host: string | null;
};

let snapshot: CompressionSnapshot = { busy: 0, messages: [], host: null };
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

export function compressionSnapshot(): CompressionSnapshot {
  return snapshot;
}

export function subscribeCompression(listener: () => void): () => void {
  listeners.add(listener);
  listener();
  return () => listeners.delete(listener);
}

export function claimCompressionHost(host: string) {
  if (snapshot.host === host) return;
  snapshot = { ...snapshot, host };
  emit();
}

function shiftBusy(delta: number) {
  snapshot = { ...snapshot, busy: Math.max(0, snapshot.busy + delta) };
  emit();
}

function rememberCompression(before: number, after: number) {
  const message = `Photo reduced from ${formatMegabytes(before)} to ${formatMegabytes(after)}`;
  snapshot = { ...snapshot, messages: [...snapshot.messages, message].slice(-5) };
  emit();
}

export function formatMegabytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function fileNameWithExtension(name: string, extension: string): string {
  const base = name.split(/[/\\]/).pop()?.trim() || "photo";
  const dot = base.lastIndexOf(".");
  const stem = (dot > 0 ? base.slice(0, dot) : base).trim() || "photo";
  return `${stem}.${extension}`;
}

function kindOf(file: File): "pdf" | "jpeg" | "png" | "other" {
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();
  if (type === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  if (type === "image/png" || name.endsWith(".png")) return "png";
  if (type === "image/jpeg" || type === "image/jpg" || type === "image/pjpeg" || /\.jpe?g$/.test(name)) {
    return "jpeg";
  }
  return "other";
}

function canvasBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality);
  });
}

async function loadBitmap(file: File): Promise<ImageBitmap> {
  if (typeof createImageBitmap === "function") return createImageBitmap(file);
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    const loaded = new Promise<HTMLImageElement>((resolve, reject) => {
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Could not read this photo."));
    });
    image.src = url;
    const element = await loaded;
    return createImageBitmap(element);
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function pngHasTransparency(bitmap: ImageBitmap): Promise<boolean> {
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Could not inspect this photo.");
  context.drawImage(bitmap, 0, 0);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  for (let index = 3; index < pixels.length; index += 4) {
    if (pixels[index] !== 255) return true;
  }
  return false;
}

export async function compressImageIfNeeded(file: File): Promise<File> {
  if (!(file instanceof File) || file.size <= MAX_BYTES) return file;
  const kind = kindOf(file);
  if (kind !== "jpeg" && kind !== "png") return file;
  if (typeof document === "undefined") return file;

  shiftBusy(1);
  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await loadBitmap(file);
    if (bitmap.width < 1 || bitmap.height < 1) return file;
    const keepPng = kind === "png" && (await pngHasTransparency(bitmap));
    const edge = Math.max(bitmap.width, bitmap.height);
    const ratio = edge > MAX_EDGE ? MAX_EDGE / edge : 1;
    const width = Math.max(1, Math.round(bitmap.width * ratio));
    const height = Math.max(1, Math.round(bitmap.height * ratio));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return file;
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(bitmap, 0, 0, width, height);
    const type = keepPng ? "image/png" : "image/jpeg";
    const blob = await canvasBlob(canvas, type, keepPng ? undefined : JPEG_QUALITY);
    if (!blob || blob.size >= file.size) return file;
    const compressed = new File([blob], fileNameWithExtension(file.name, keepPng ? "png" : "jpg"), {
      type,
      lastModified: file.lastModified,
    });
    rememberCompression(file.size, compressed.size);
    return compressed;
  } catch {
    return file;
  } finally {
    bitmap?.close();
    shiftBusy(-1);
  }
}

export function UploadCompressionNote(): ReactNode {
  const token = useId();
  const [current, setCurrent] = useState(compressionSnapshot);
  const [root, setRoot] = useState<HTMLDivElement | null>(null);

  useEffect(() => subscribeCompression(() => setCurrent(compressionSnapshot())), []);

  useEffect(() => {
    const section = root?.closest("section");
    if (!section) return;
    const claim = () => claimCompressionHost(token);
    section.addEventListener("change", claim);
    section.addEventListener("drop", claim);
    return () => {
      section.removeEventListener("change", claim);
      section.removeEventListener("drop", claim);
    };
  }, [root, token]);

  const showLive = current.host === token || current.host === null;
  const children: ReactNode[] = [
    createElement(
      "p",
      { key: "note", className: "text-sm text-muted" },
      "Compression only changes the size of photos, not the content.",
    ),
  ];
  if (showLive && current.busy > 0) {
    children.push(
      createElement("p", { key: "busy", className: "text-sm text-muted" }, "Reducing photo size…"),
    );
  }
  if (showLive) {
    current.messages.forEach((message, index) => {
      children.push(
        createElement("p", { key: `message-${index}`, className: "text-sm text-accent-strong" }, message),
      );
    });
  }

  return createElement(
    "div",
    {
      ref: setRoot as Ref<HTMLDivElement>,
      className: "space-y-1",
      "data-feat12": "compression-note",
      "aria-live": "polite",
    },
    ...children,
  );
}
