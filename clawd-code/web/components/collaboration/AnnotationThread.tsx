"use client";

import { useState } from "react";
import { Check, MessageSquarePlus, Reply, X } from "lucide-react";
import { useCollaborationContextOptional } from "./CollaborationProvider";
import { formatDate } from "@/lib/utils";

interface AnnotationThreadProps {
  messageId: string;
  onClose: () => void;
}

export function AnnotationThread({ messageId, onClose }: AnnotationThreadProps) {
  const ctx = useCollaborationContextOptional();
  const [newComment, setNewComment] = useState("");
  const [replyFor, setReplyFor] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");

  if (!ctx) return null;

  const annotations = ctx.annotations[messageId] ?? [];

  const submitComment = () => {
    const text = newComment.trim();
    if (!text) return;
    ctx.addAnnotation(messageId, text);
    setNewComment("");
  };

  const submitReply = (annotationId: string) => {
    const text = replyText.trim();
    if (!text) return;
    ctx.replyAnnotation(annotationId, text);
    setReplyFor(null);
    setReplyText("");
  };

  return (
    <section className="rounded-lg border border-surface-700 bg-surface-950 shadow-lg">
      <div className="flex items-center justify-between border-b border-surface-800 px-3 py-2">
        <div className="flex items-center gap-2 text-sm font-medium text-surface-100">
          <MessageSquarePlus className="h-4 w-4 text-brand-400" aria-hidden="true" />
          <span>Comments</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close comments"
          title="Close comments"
          className="rounded p-1 text-surface-500 hover:bg-surface-800 hover:text-surface-100"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <div className="max-h-80 overflow-y-auto p-3">
        {annotations.length === 0 ? (
          <p className="text-sm text-surface-500">No comments</p>
        ) : (
          <div className="space-y-3">
            {annotations.map((annotation) => (
              <article key={annotation.id} className="rounded-md bg-surface-900 p-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium text-surface-200">
                      {annotation.author.name}
                    </p>
                    <p className="text-[11px] text-surface-600">
                      {formatDate(annotation.createdAt)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => ctx.resolveAnnotation(annotation.id, !annotation.resolved)}
                    aria-label={annotation.resolved ? "Reopen comment" : "Resolve comment"}
                    title={annotation.resolved ? "Reopen comment" : "Resolve comment"}
                    className="rounded p-1 text-surface-500 hover:bg-surface-800 hover:text-surface-100"
                  >
                    <Check
                      className={annotation.resolved ? "h-4 w-4 text-success" : "h-4 w-4"}
                      aria-hidden="true"
                    />
                  </button>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm text-surface-300">{annotation.text}</p>

                {annotation.replies.length > 0 && (
                  <div className="mt-2 space-y-2 border-l border-surface-700 pl-3">
                    {annotation.replies.map((reply) => (
                      <div key={reply.id}>
                        <div className="flex items-center gap-2 text-[11px] text-surface-600">
                          <span className="font-medium text-surface-400">{reply.author.name}</span>
                          <span>{formatDate(reply.createdAt)}</span>
                        </div>
                        <p className="mt-0.5 whitespace-pre-wrap text-sm text-surface-300">
                          {reply.text}
                        </p>
                      </div>
                    ))}
                  </div>
                )}

                {replyFor === annotation.id ? (
                  <div className="mt-2 flex gap-2">
                    <input
                      value={replyText}
                      onChange={(event) => setReplyText(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") submitReply(annotation.id);
                        if (event.key === "Escape") setReplyFor(null);
                      }}
                      placeholder="Reply"
                      className="min-w-0 flex-1 rounded-md border border-surface-700 bg-surface-950 px-2 py-1 text-sm text-surface-100 placeholder:text-surface-600 focus:outline-none focus:ring-1 focus:ring-brand-500"
                    />
                    <button
                      type="button"
                      onClick={() => submitReply(annotation.id)}
                      className="rounded-md bg-brand-600 px-2 py-1 text-xs font-medium text-white hover:bg-brand-700"
                    >
                      Send
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setReplyFor(annotation.id)}
                    className="mt-2 inline-flex items-center gap-1 rounded px-1.5 py-1 text-xs text-surface-500 hover:bg-surface-800 hover:text-surface-100"
                  >
                    <Reply className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Reply</span>
                  </button>
                )}
              </article>
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-surface-800 p-3">
        <label htmlFor={`annotation-${messageId}`} className="sr-only">
          Add comment
        </label>
        <textarea
          id={`annotation-${messageId}`}
          value={newComment}
          onChange={(event) => setNewComment(event.target.value)}
          placeholder="Add comment"
          rows={2}
          className="w-full resize-none rounded-md border border-surface-700 bg-surface-900 px-2 py-1.5 text-sm text-surface-100 placeholder:text-surface-600 focus:outline-none focus:ring-1 focus:ring-brand-500"
        />
        <div className="mt-2 flex justify-end">
          <button
            type="button"
            onClick={submitComment}
            disabled={!newComment.trim()}
            className="rounded-md bg-brand-600 px-2.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-surface-700 disabled:text-surface-500"
          >
            Comment
          </button>
        </div>
      </div>
    </section>
  );
}
