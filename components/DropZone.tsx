"use client";

import { useCallback, useRef, useState } from "react";
import { Upload, X, ImageIcon } from "lucide-react";

interface DropZoneProps {
  label: string;
  value: string | null;
  onChange: (base64: string | null) => void;
}

export function DropZone({ label, value, onChange }: DropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  // Store the actual MIME type for correct preview rendering
  const [mime, setMime] = useState("image/jpeg");

  const processFile = useCallback(
    (file: File) => {
      if (!file.type.startsWith("image/")) {
        return;
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        const [prefix, base64] = dataUrl.split(",");
        // Extract mime from "data:image/png;base64"
        const detectedMime = prefix.replace("data:", "").replace(";base64", "");
        if (base64) {
          setMime(detectedMime);
          onChange(base64);
        }
      };
      reader.readAsDataURL(file);
    },
    [onChange]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) processFile(file);
    },
    [processFile]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) processFile(file);
    },
    [processFile]
  );

  return (
    <div className="flex flex-col gap-2 w-full">
      <span className="text-sm font-medium text-neutral-400 uppercase tracking-wider">
        {label}
      </span>
      <div
        className={`relative rounded-xl border-2 border-dashed transition-colors cursor-pointer min-h-[200px] sm:min-h-[220px] flex items-center justify-center overflow-hidden
          ${dragging
            ? "border-amber-500 bg-amber-500/5"
            : value
            ? "border-neutral-700 bg-neutral-900"
            : "border-neutral-700 bg-neutral-900 hover:border-amber-500/50 hover:bg-amber-500/5"
          }`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleChange}
        />

        {value ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`data:${mime};base64,${value}`}
              alt={label}
              className="w-full h-full object-cover"
            />
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onChange(null); }}
              className="absolute top-2 right-2 p-1.5 rounded-full bg-neutral-900/80 hover:bg-red-500/80 transition-colors min-h-[32px] min-w-[32px] flex items-center justify-center"
              aria-label="Remove image"
            >
              <X size={14} className="text-white" />
            </button>
          </>
        ) : (
          <div className="flex flex-col items-center gap-3 p-6 sm:p-8 text-center pointer-events-none select-none">
            <div className="p-4 rounded-full bg-neutral-800">
              {dragging ? (
                <ImageIcon size={24} className="text-amber-500" />
              ) : (
                <Upload size={24} className="text-neutral-500" />
              )}
            </div>
            <div>
              <p className="text-sm font-medium text-neutral-300">
                Drop image here or click to browse
              </p>
              <p className="text-xs text-neutral-500 mt-1">JPEG · PNG · WEBP</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
