"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Send, MessageSquare, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { format, isToday, isYesterday } from "date-fns";
import { useMessages, type Message } from "@/hooks/useMessages";

interface MessagesClientProps {
  currentUserId: string;
  currentUserRole: string;
  clientId: string;
}

function formatMessageTime(ts: string): string {
  const d = new Date(ts);
  if (isToday(d)) return format(d, "h:mm a");
  if (isYesterday(d)) return `Yesterday ${format(d, "h:mm a")}`;
  return format(d, "MMM d, h:mm a");
}

function DateDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 my-4">
      <div className="flex-1 h-px bg-zinc-800" />
      <span className="text-xs text-zinc-500 shrink-0">{label}</span>
      <div className="flex-1 h-px bg-zinc-800" />
    </div>
  );
}

export function MessagesClient({ currentUserId, currentUserRole, clientId }: MessagesClientProps) {
  const supabase = createClient();
  const {
    messages,
    isLoading: loading,
    isError,
    sendMessage,
    isSending: sending,
    appendMessage,
    // Poll as a safety net so new messages still arrive if the realtime
    // channel is blocked (e.g. by RLS on the browser client).
  } = useMessages(clientId, { refetchInterval: 25_000 });
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const didInitialScroll = useRef(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    bottomRef.current?.scrollIntoView({ behavior });
  }, []);

  // ── Surface query load errors in the banner ──────────────────────────────────
  useEffect(() => {
    if (isError) setError("Failed to load messages.");
  }, [isError]);

  // ── Opening the chat clears the "new messages" bell notification ─────────────
  useEffect(() => {
    void fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "message" }),
    }).catch(() => {});
  }, []);

  // ── Scroll to bottom once the initial load completes ─────────────────────────
  useEffect(() => {
    if (!loading && !didInitialScroll.current) {
      didInitialScroll.current = true;
      setTimeout(() => scrollToBottom("instant"), 100);
    }
  }, [loading, scrollToBottom]);

  // ── Realtime subscription ───────────────────────────────────────────────────
  useEffect(() => {
    const channel = supabase
      .channel(`messages:${clientId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `client_id=eq.${clientId}`,
        },
        (payload) => {
          appendMessage(payload.new as Message);
          setTimeout(() => scrollToBottom(), 50);
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [clientId, supabase, scrollToBottom, appendMessage]);

  // ── Send ────────────────────────────────────────────────────────────────────
  async function handleSend() {
    const trimmed = input.trim();
    if (!trimmed || sending) return;

    setInput("");

    try {
      await sendMessage({ message: trimmed });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send message.");
      setInput(trimmed);
    } finally {
      inputRef.current?.focus();
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  // ── Render messages with date dividers ──────────────────────────────────────
  function renderMessages() {
    const items: React.ReactNode[] = [];
    let lastDate = "";

    messages.forEach((msg) => {
      const d = new Date(msg.created_at);
      const dateKey = format(d, "yyyy-MM-dd");
      if (dateKey !== lastDate) {
        let label = "";
        if (isToday(d)) label = "Today";
        else if (isYesterday(d)) label = "Yesterday";
        else label = format(d, "MMMM d, yyyy");
        items.push(<DateDivider key={`div-${dateKey}`} label={label} />);
        lastDate = dateKey;
      }

      const isOwn = msg.sender_id === currentUserId;
      items.push(
        <div key={msg.id} className={cn("flex gap-2.5", isOwn ? "flex-row-reverse" : "flex-row")}>
          <div className={cn(
            "w-7 h-7 rounded-full shrink-0 flex items-center justify-center text-xs font-bold mt-0.5",
            msg.sender_role === "client_admin"
              ? "bg-blue-500/20 text-blue-400 border border-blue-500/30"
              : "bg-purple-500/20 text-purple-400 border border-purple-500/30"
          )}>
            {(msg.sender_name?.charAt(0) ?? "?").toUpperCase()}
          </div>

          <div className={cn("flex flex-col gap-0.5 max-w-[75%]", isOwn ? "items-end" : "items-start")}>
            <div className={cn("flex items-center gap-1.5 text-xs text-zinc-500", isOwn ? "flex-row-reverse" : "")}>
              <span className="font-medium text-zinc-400">{isOwn ? "You" : msg.sender_name}</span>
              <span>·</span>
              <span>{formatMessageTime(msg.created_at)}</span>
            </div>
            <div className={cn(
              "px-3.5 py-2 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap break-words",
              isOwn
                ? "bg-orange-500 text-zinc-950 rounded-tr-sm"
                : "bg-zinc-800 text-zinc-100 rounded-tl-sm border border-zinc-700"
            )}>
              {msg.body}
            </div>
          </div>
        </div>
      );
    });

    return items;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-5 h-5 animate-spin text-zinc-500" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] max-h-[calc(100vh-8rem)]">
      {/* Header */}
      <div className="flex items-center gap-3 pb-4 border-b border-zinc-800 shrink-0">
        <MessageSquare className="w-5 h-5 text-zinc-400" />
        <div>
          <h1 className="font-semibold text-zinc-100 text-base">Messages</h1>
          <p className="text-xs text-zinc-500">
            {currentUserRole === "client_admin" ? "Chat with your team" : "Chat with your client"}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          <span className="text-xs text-zinc-500">Live</span>
        </div>
      </div>

      {/* Feed */}
      <div className="flex-1 overflow-y-auto py-4 flex flex-col gap-3 min-h-0">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center flex-1 gap-3 text-center">
            <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center">
              <MessageSquare className="w-6 h-6 text-zinc-600" />
            </div>
            <p className="text-zinc-400 text-sm font-medium">No messages yet</p>
            <p className="text-zinc-600 text-xs">Send the first message to start the conversation.</p>
          </div>
        ) : (
          renderMessages()
        )}
        <div ref={bottomRef} />
      </div>

      {/* Error banner */}
      {error && (
        <div className="mb-2 px-4 py-2 bg-red-500/10 border border-red-500/20 rounded-lg text-xs text-red-400 flex items-center justify-between shrink-0">
          {error}
          <button onClick={() => setError(null)} className="ml-3 hover:text-red-300">✕</button>
        </div>
      )}

      {/* Input */}
      <div className="pt-4 border-t border-zinc-800 shrink-0">
        <div className="flex gap-2 items-end bg-zinc-800/60 border border-zinc-700 rounded-xl px-4 py-2.5 focus-within:border-zinc-500 transition-colors">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message… (Enter to send, Shift+Enter for new line)"
            rows={1}
            className="flex-1 bg-transparent text-sm text-zinc-100 placeholder-zinc-500 resize-none outline-none leading-relaxed min-h-6 max-h-32 overflow-y-auto"
            disabled={sending}
          />
          <Button
            size="sm"
            onClick={handleSend}
            disabled={!input.trim() || sending}
            className="shrink-0 h-8 w-8 p-0 bg-orange-500 hover:bg-orange-400 disabled:opacity-40 rounded-lg"
          >
            {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          </Button>
        </div>
        <p className="text-xs text-zinc-600 mt-1.5 pl-1">Enter to send · Shift+Enter for new line</p>
      </div>
    </div>
  );
}
