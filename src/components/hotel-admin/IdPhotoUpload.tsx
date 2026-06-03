"use client";

/**
 * Reusable ID photo upload component for admin forms.
 * Uploads directly to Cloudinary via unsigned upload preset.
 * Requires NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME in env.
 */

import { useState } from "react";
import { Upload, Loader2, X, CameraIcon } from "lucide-react";
import { toast } from "sonner";

interface IdPhotoUploadProps {
  frontUrl: string;
  backUrl: string;
  onFrontChange: (url: string) => void;
  onBackChange: (url: string) => void;
}

export default function IdPhotoUpload({
  frontUrl,
  backUrl,
  onFrontChange,
  onBackChange,
}: IdPhotoUploadProps) {
  const [uploadingFront, setUploadingFront] = useState(false);
  const [uploadingBack, setUploadingBack] = useState(false);

  async function uploadImage(file: File, side: "front" | "back") {
    const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
    if (!cloudName) {
      toast.error("Cloudinary is not configured yet (NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME missing)");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", "hotel_ota_upload");
    formData.append("folder", "guest_ids");

    if (side === "front") setUploadingFront(true);
    else setUploadingBack(true);

    try {
      const res = await fetch(
        `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
        { method: "POST", body: formData }
      );
      const data = await res.json();
      if (!res.ok || !data.secure_url) {
        const reason = data?.error?.message || `HTTP ${res.status}`;
        toast.error(`Upload failed: ${reason}`);
        return;
      }
      if (side === "front") onFrontChange(data.secure_url);
      else onBackChange(data.secure_url);
      toast.success(`ID ${side} photo uploaded`);
    } catch {
      toast.error("Upload failed. Try again.");
    } finally {
      if (side === "front") setUploadingFront(false);
      else setUploadingBack(false);
    }
  }

  const sides = [
    { key: "front" as const, label: "Front Side", url: frontUrl, uploading: uploadingFront, onChange: onFrontChange },
    { key: "back" as const, label: "Back Side", url: backUrl, uploading: uploadingBack, onChange: onBackChange },
  ];

  return (
    <div className="grid grid-cols-2 gap-3">
      {sides.map(({ key, label, url, uploading, onChange }) => (
        <div key={key}>
          <p className="text-xs font-semibold text-white/45 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <CameraIcon className="w-3 h-3" /> {label}
            <span className="font-normal normal-case text-white/20">(optional)</span>
          </p>

          {url ? (
            /* Preview */
            <div className="relative border border-white/15 rounded-xl overflow-hidden h-32 bg-white/3 group">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt={`ID ${key}`} className="w-full h-full object-cover" />
              {/* Remove button */}
              <button
                type="button"
                onClick={() => onChange("")}
                className="absolute top-2 right-2 bg-black/70 border border-white/20 rounded-full p-1 opacity-0 group-hover:opacity-100 hover:bg-red-500/50 transition-all"
              >
                <X className="w-3.5 h-3.5 text-white" />
              </button>
              {/* Replace hint */}
              <label className="absolute inset-0 flex items-end justify-center pb-2 cursor-pointer opacity-0 group-hover:opacity-100 transition-all">
                <span className="text-[10px] text-white/70 bg-black/60 px-2 py-0.5 rounded-full">
                  Click to replace
                </span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={e => e.target.files?.[0] && uploadImage(e.target.files[0], key)}
                />
              </label>
            </div>
          ) : (
            /* Upload area */
            <label className="flex flex-col items-center justify-center gap-1.5 border-2 border-dashed border-white/10 rounded-xl h-32 cursor-pointer hover:border-blue-400/40 hover:bg-blue-500/5 transition-all">
              {uploading ? (
                <>
                  <Loader2 className="w-6 h-6 text-blue-400 animate-spin" />
                  <span className="text-xs text-blue-300">Uploading…</span>
                </>
              ) : (
                <>
                  <Upload className="w-6 h-6 text-white/20" />
                  <span className="text-xs text-white/30">Tap to upload</span>
                  <span className="text-[10px] text-white/15">JPG, PNG, HEIC</span>
                </>
              )}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={uploading}
                onChange={e => e.target.files?.[0] && uploadImage(e.target.files[0], key)}
              />
            </label>
          )}
        </div>
      ))}
    </div>
  );
}
