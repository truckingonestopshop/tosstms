"use client";

// Trailer photo slots. Each slot is a document type (migration 0008), so photos are
// stored like any trailer file: private bucket, short-lived signed links.

export interface PhotoSlot {
  key: string;
  title: string;
  hint: string;
  /** only shown for reefer trailers */
  reefer?: boolean;
  /** more than one photo makes sense (both sides, several angles) */
  many?: boolean;
}

export const PHOTO_SLOTS: PhotoSlot[] = [
  { key: "trailer_photo_side", title: "Exterior · side views", hint: "Driver and passenger side, whole trailer in frame", many: true },
  { key: "trailer_photo_reefer_unit", title: "Reefer unit · exterior", hint: "Front of the unit with the make / model plate", reefer: true },
  { key: "trailer_photo_interior", title: "Interior · inside view", hint: "From the doors to the nose, floor and walls", many: true },
  { key: "trailer_photo_rear", title: "Exterior · rear view", hint: "Doors, bumper, lights and trailer number" },
  { key: "trailer_photo_air_chute", title: "Reefer air chute · interior", hint: "The chute along the ceiling, front to back", reefer: true, many: true },
  { key: "trailer_photo_plate", title: "License plate", hint: "Clear, readable plate and registration sticker" },
];

export const isPhotoType = (key: string) => key.startsWith("trailer_photo_");

/** Slots for a trailer type: reefer slots only for reefers. */
export const photoSlotsFor = (type: string | null | undefined) => PHOTO_SLOTS.filter((s) => !s.reefer || (type || "").toLowerCase().includes("reefer"));

/**
 * Shrinks a phone photo to a sensible size (long side 2000 px, JPEG) before upload.
 * Formats the browser can't draw (e.g. HEIC on Chrome) are uploaded as they are.
 */
export async function compressImage(file: File, maxSide = 2000, quality = 0.82): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/gif") return file;
  try {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.src = url;
    // A browser that can't draw right now (hidden tab) or can't read the format would wait
    // forever; after a few seconds the original file is used instead.
    await Promise.race([img.decode(), new Promise((_, no) => setTimeout(() => no(new Error("decode timeout")), 6000))]);
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    if (scale === 1 && file.size < 1_500_000) {
      URL.revokeObjectURL(url);
      return file;
    }
    const c = document.createElement("canvas");
    c.width = Math.round(img.naturalWidth * scale);
    c.height = Math.round(img.naturalHeight * scale);
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    URL.revokeObjectURL(url);
    const blob: Blob | null = await new Promise((res) => c.toBlob(res, "image/jpeg", quality));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.[a-z0-9]+$/i, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}
