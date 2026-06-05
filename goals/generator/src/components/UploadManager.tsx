/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useState } from "react";
import { Upload, FileText, Image as ImageIcon, X, AlertTriangle } from "lucide-react";
import { UploadedFile } from "../types";

interface UploadManagerProps {
  files: UploadedFile[];
  onFilesChange: (files: UploadedFile[]) => void;
  maxFiles?: number;
}

export default function UploadManager({
  files,
  onFilesChange,
  maxFiles = 5,
}: UploadManagerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [warningMessage, setWarningMessage] = useState<string | null>(null);

  // Helper to format byte sizes to human-readable text
  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  };

  const processFiles = async (fileList: FileList) => {
    setWarningMessage(null);
    const newFiles: UploadedFile[] = [...files];

    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];

      // Check if we already have this file or reached max files
      if (newFiles.length >= maxFiles) {
        setWarningMessage(`Maximum limit of ${maxFiles} attached files reached.`);
        break;
      }

      const fileId = `${file.name}-${file.size}-${Date.now()}`;

      // Max file size: 4MB limit to keep things lightweight
      if (file.size > 4 * 1024 * 1024) {
        setWarningMessage(`File "${file.name}" is too large. Maximum size per file is 4 MB.`);
        continue;
      }

      try {
        if (file.type.startsWith("image/")) {
          // Process image file
          const content = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target?.result as string);
            reader.onerror = (e) => reject(e);
            reader.readAsDataURL(file);
          });

          newFiles.push({
            id: fileId,
            name: file.name,
            size: file.size,
            type: file.type,
            content,
            charCount: 0, // Images don't contribute directly to word counts
          });
        } else if (
          file.type.startsWith("text/") ||
          file.name.endsWith(".txt") ||
          file.name.endsWith(".md") ||
          file.name.endsWith(".json") ||
          file.name.endsWith(".csv")
        ) {
          // Process text file
          const content = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target?.result as string);
            reader.onerror = (e) => reject(e);
            reader.readAsText(file);
          });

          // Truncate file context slightly if it's over 8000 characters to keep prompt performant
          const maxChars = 8000;
          const finalContent = content.length > maxChars 
            ? content.substring(0, maxChars) + "\n\n[TRUNCATED FOR LENGTH]" 
            : content;

          newFiles.push({
            id: fileId,
            name: file.name,
            size: file.size,
            type: file.type || "text/plain",
            content: finalContent,
            charCount: finalContent.length,
          });
        } else {
          setWarningMessage(`Unsupported file type: "${file.name}". Please upload images or plain text files.`);
        }
      } catch (err) {
        console.error("Failed to read file:", err);
        setWarningMessage(`Attempting to read "${file.name}" failed.`);
      }
    }

    onFilesChange(newFiles);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files) {
      await processFiles(e.dataTransfer.files);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      await processFiles(e.target.files);
    }
  };

  const removeFile = (id: string) => {
    onFilesChange(files.filter((f) => f.id !== id));
  };

  const triggerSelect = () => {
    fileInputRef.current?.click();
  };

  // Total text characters attached
  const totalAttachedChars = files.reduce((acc, curr) => acc + curr.charCount, 0);

  return (
    <div id="upload-manager-container" className="space-y-3">
      <div className="flex justify-between items-center text-xs">
        <label className="font-semibold text-slate-300">
          Supporting Materials & Images
        </label>
        <span className="text-slate-500 font-mono">
          {files.length} / {maxFiles} files
        </span>
      </div>

      {/* Drag & Drop Board with Lobster Glowing Theme */}
      <div
        id="drag-drop-zone"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={triggerSelect}
        className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all duration-300 flex flex-col justify-center items-center gap-2 ${
          isDragging
            ? "border-[#14F195] bg-[#14F195]/5 shadow-[0_0_15px_rgba(20,241,149,0.15)]"
            : "border-white/10 hover:border-[#9945FF]/50 bg-white/[0.02] hover:bg-white/[0.04]"
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,.txt,.md,.json,.csv"
          onChange={handleFileSelect}
          className="hidden"
        />
        <div className="p-2 bg-white/[0.04] rounded-lg text-slate-400 border border-white/5 transition-transform group-hover:scale-105">
          <Upload className="w-4 h-4 text-[#9945FF]" />
        </div>
        <div>
          <p className="text-xs font-semibold text-slate-200">
            Drag & drop files or <span className="text-[#14F195] underline cursor-pointer">browse context</span>
          </p>
          <p className="text-[10px] text-slate-500 mt-0.5">
            PNG, JPG, WEBP, TXT, MD, CSV (Max 4MB each)
          </p>
        </div>
      </div>

      {/* Warning Notification */}
      {warningMessage && (
        <div id="upload-warning-banner" className="bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[11px] rounded-lg p-2.5 flex items-start gap-2 backdrop-blur-xs">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <span>{warningMessage}</span>
        </div>
      )}

      {/* Uploaded Files grid with translucent styled items */}
      {files.length > 0 && (
        <div id="uploaded-files-grid" className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
          {files.map((file) => {
            const isImage = file.type.startsWith("image/");
            return (
              <div
                key={file.id}
                id={`uploaded-file-${file.id}`}
                className="flex items-center gap-3 p-2 bg-white/[0.03] border border-white/5 rounded-xl group hover:border-[#9945FF]/30 transition-all"
              >
                {/* Visual Thumbnail or Icon */}
                <div className="w-9 h-9 rounded bg-slate-950/60 border border-white/5 flex items-center justify-center shrink-0 overflow-hidden relative">
                  {isImage ? (
                    <img
                      src={file.content}
                      alt={file.name}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <FileText className="w-4 h-4 text-slate-400" />
                  )}
                </div>

                {/* File Information */}
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-bold text-slate-200 truncate" title={file.name}>
                    {file.name}
                  </p>
                  <p className="text-[9px] text-slate-500 flex items-center gap-1">
                    <span>{formatSize(file.size)}</span>
                    {!isImage && (
                      <span className="bg-white/[0.05] text-[#14F195] px-1 rounded font-mono">
                        +{file.charCount} chars
                      </span>
                    )}
                  </p>
                </div>

                {/* Delete Trigger */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeFile(file.id);
                  }}
                  className="p-1 text-slate-500 hover:text-red-400 hover:bg-white/[0.05] rounded-md transition-colors mr-1"
                  title="Remove file"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Extracted stats feedback details */}
      {totalAttachedChars > 0 && (
        <div className="text-[10px] text-slate-500 font-mono px-1 flex items-center gap-1">
          <span className="w-1.5 h-1.5 bg-[#14F195] rounded-full inline-block animate-pulse" />
          <span>Extracted text bytes: <strong className="text-slate-350 font-black">{(totalAttachedChars).toLocaleString()}</strong> characters included in generation payload.</span>
        </div>
      )}
    </div>
  );
}
