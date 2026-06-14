"use client";

import { useChat, type UIMessage } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { MessageCircle, X, Send, Bot, User, Loader2 } from "lucide-react";
import { useState, useRef, useEffect } from "react";

export default function FloatingChat() {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const { messages, status, sendMessage } = useChat({
    transport: new DefaultChatTransport({ api: "/api/chat" }),
  });
  
  const isLoading = status === "submitted" || status === "streaming";
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInput(e.target.value);
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input || !input.trim() || isLoading) return;
    sendMessage({ text: input });
    setInput("");
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end">
      {isOpen && (
        <div className="mb-4 flex flex-col w-[350px] sm:w-[400px] h-[500px] max-h-[80vh] bg-bg-app border border-border rounded-2xl shadow-2xl overflow-hidden transition-all duration-300">
          {/* Header */}
          <div className="flex items-center justify-between p-4 bg-brand text-brand-contrast">
            <div className="flex items-center gap-2">
              <Bot size={20} />
              <h3 className="font-semibold">ជំនួយការបណ្ណាល័យ AI</h3>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="p-1 hover:bg-black/10 rounded-md transition-colors"
              aria-label="Close chat"
            >
              <X size={20} />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-bg-muted/30">
            {messages.length === 0 && (
              <div className="text-center text-text-muted mt-8 text-sm">
                សួស្តី! ខ្ញុំជាជំនួយការបណ្ណាល័យ។ តើអ្នកចង់ស្វែងរកសៀវភៅអ្វីដែរ?
              </div>
            )}
            
            {messages.map((m: any) => {
              const textContent = m.parts?.map((p: any) => p.text).join("") || m.content || "";
              if (!textContent) return null;
              return (
                <div
                  key={m.id}
                  className={`flex gap-3 ${
                    m.role === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  {m.role !== "user" && (
                    <div className="w-8 h-8 rounded-full bg-brand/10 text-brand flex items-center justify-center shrink-0">
                      <Bot size={18} />
                    </div>
                  )}
                  
                  <div
                    className={`px-4 py-2 rounded-2xl max-w-[85%] ${
                      m.role === "user"
                        ? "bg-brand text-brand-contrast rounded-tr-sm"
                        : "bg-bg-muted text-text-body rounded-tl-sm"
                    }`}
                  >
                    <div className="whitespace-pre-wrap leading-relaxed">
                      {textContent}
                    </div>
                  </div>

                  {m.role === "user" && (
                    <div className="w-8 h-8 rounded-full bg-brand flex items-center justify-center shrink-0 text-brand-contrast">
                      <User size={16} />
                    </div>
                  )}
                </div>
              );
            })}
            
            {isLoading && messages.length > 0 && messages[messages.length - 1].role === "user" && (
               <div className="flex justify-start gap-3">
                 <div className="w-8 h-8 rounded-full bg-brand/10 flex items-center justify-center shrink-0">
                    <Loader2 size={16} className="text-brand animate-spin" />
                  </div>
                  <div className="px-4 py-2 bg-bg-app border border-border text-text-body rounded-2xl rounded-tl-sm shadow-sm">
                    <Loader2 size={16} className="animate-spin text-text-muted" />
                  </div>
               </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <form onSubmit={onSubmit} className="p-3 bg-bg-app border-t border-border">
            <div className="flex gap-2 items-center bg-bg-muted rounded-full p-1 pl-4">
              <input
                className="flex-1 bg-transparent border-none outline-none text-sm text-text-body placeholder:text-text-muted"
                value={input || ""}
                placeholder="សួរសំណួររបស់អ្នកនៅទីនេះ..."
                onChange={handleInputChange}
                disabled={isLoading}
              />
              <button
                type="submit"
                disabled={isLoading || !input || !input.trim()}
                className="p-2 rounded-full bg-brand text-brand-contrast disabled:opacity-50 hover:bg-brand-hover transition-colors"
                aria-label="Send message"
              >
                <Send size={16} />
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Toggle Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-14 h-14 rounded-full bg-brand text-brand-contrast flex items-center justify-center shadow-xl hover:scale-105 active:scale-95 transition-all"
        aria-label="Toggle chat"
      >
        {isOpen ? <X size={24} /> : <MessageCircle size={24} />}
      </button>
    </div>
  );
}
