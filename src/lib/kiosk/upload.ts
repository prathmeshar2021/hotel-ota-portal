"use client";

/**
 * Unsigned Cloudinary upload for kiosk ID capture — same preset/folder the
 * customer online-check-in form uses. Returns the secure URL or throws.
 */
export async function uploadIdPhoto(file: File): Promise<string> {
  const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
  if (!cloudName) throw new Error("Upload not configured");

  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", "hotel_ota_upload");
  formData.append("folder", "guest_ids");

  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
    method: "POST",
    body: formData,
  });
  const data = await res.json();
  if (!res.ok || !data.secure_url) {
    throw new Error(data?.error?.message || `Upload failed (HTTP ${res.status})`);
  }
  return data.secure_url as string;
}
