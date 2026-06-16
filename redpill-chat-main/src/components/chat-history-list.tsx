"use client";

import { MoreVertical, Pencil, PlusIcon, Trash2 } from "lucide-react";
import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import type { Chat } from "@/hooks/use-chat-storage";
import { cn } from "@/lib/utils";

interface ChatHistoryListProps {
  chats: Chat[];
  currentChatId: string | null;
  onChatSelect: (chatId: string) => void;
  onChatDelete: (chatId: string) => void;
  onChatRename: (chatId: string, newTitle: string) => void;
  onNewChat: () => void;
}

export function ChatHistoryList({
  chats,
  currentChatId,
  onChatSelect,
  onChatDelete,
  onChatRename,
  onNewChat,
}: ChatHistoryListProps) {
  const [editingChatId, setEditingChatId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  const handleStartEdit = (chat: Chat) => {
    setEditingChatId(chat.id);
    setEditingTitle(chat.title);
  };

  const handleSaveEdit = (chatId: string) => {
    if (editingTitle.trim()) {
      onChatRename(chatId, editingTitle.trim());
    }
    setEditingChatId(null);
    setEditingTitle("");
  };

  const handleCancelEdit = () => {
    setEditingChatId(null);
    setEditingTitle("");
  };

  const handleDelete = (chatId: string) => {
    onChatDelete(chatId);
    setConfirmDeleteId(null);
  };

  return (
    <>
      <div className="flex h-full flex-col gap-0.5 min-h-0">
        <Button
          onClick={onNewChat}
          variant="ghost"
          className="flex items-center justify-start gap-2 rounded-lg px-2.5 py-2"
        >
          <PlusIcon className="size-4" />
          New Chat
        </Button>

        <div className="flex flex-1 min-h-0 flex-col gap-1 overflow-auto">
          {chats.length === 0 ? (
            <p className="p-2 text-muted-foreground">
              Create a new chat to get started
            </p>
          ) : (
            chats.map((chat) => (
              <div
                key={chat.id}
                onClick={() => {
                  if (
                    editingChatId !== chat.id &&
                    confirmDeleteId !== chat.id
                  ) {
                    onChatSelect(chat.id);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    if (
                      editingChatId !== chat.id &&
                      confirmDeleteId !== chat.id
                    ) {
                      onChatSelect(chat.id);
                    }
                  }
                }}
                role="button"
                tabIndex={0}
                className={cn(
                  "group flex items-center gap-2 rounded-md px-2 py-1 transition-all cursor-pointer",
                  currentChatId === chat.id
                    ? "bg-muted text-foreground"
                    : "hover:bg-muted/80",
                )}
              >
                {editingChatId === chat.id ? (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                    role="group"
                    tabIndex={-1}
                    className="flex w-full items-center gap-2"
                  >
                    <Input
                      value={editingTitle}
                      onChange={(e) => setEditingTitle(e.target.value)}
                      onBlur={() => handleSaveEdit(chat.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          handleSaveEdit(chat.id);
                        } else if (e.key === "Escape") {
                          handleCancelEdit();
                        }
                      }}
                      className="h-8 text-sm"
                      autoFocus
                    />
                  </div>
                ) : (
                  <>
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <p className="truncate text-sm font-medium">
                        {chat.title}
                      </p>
                    </div>
                    <DropdownMenu
                      open={openMenuId === chat.id}
                      onOpenChange={(open) =>
                        setOpenMenuId(open ? chat.id : null)
                      }
                    >
                      <DropdownMenuTrigger asChild>
                        <Button
                          size="icon"
                          variant="ghost"
                          className={cn(
                            "size-8 transition-opacity",
                            openMenuId === chat.id || currentChatId === chat.id
                              ? "opacity-100"
                              : "opacity-0 group-hover:opacity-100",
                          )}
                          disabled={confirmDeleteId === chat.id}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MoreVertical className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="end"
                        sideOffset={4}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <DropdownMenuItem
                          onSelect={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleStartEdit(chat);
                            setOpenMenuId(null);
                          }}
                          className="gap-2"
                        >
                          <Pencil className="size-4" />
                          Rename
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setConfirmDeleteId(chat.id);
                            setOpenMenuId(null);
                          }}
                          className="gap-2 text-destructive focus:text-destructive"
                        >
                          <Trash2 className="size-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      <AlertDialog
        open={Boolean(confirmDeleteId)}
        onOpenChange={(open) => {
          if (!open) setConfirmDeleteId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this chat?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the chat and its messages from this device.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (confirmDeleteId) {
                  handleDelete(confirmDeleteId);
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
