/**
 * CopilotWidget — floating AI-powered assistant for task suggestions.
 * Accessible from any page via a floating action button.
 * Uses OpenAI (when configured) or falls back to rule-based suggestions.
 */
import { useState, useRef, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import apiClient from '../../api/client';
import { clsx } from 'clsx';

interface SuggestionResponse {
  suggestion: string;
  model: string;
  provider: 'openai' | 'rule-based';
}

const QUICK_ACTIONS = [
  'Write a description for my current task',
  'What priority should a security fix be?',
  'How do I break down a complex task?',
  'What status should I use for a task in testing?',
  'How do I estimate effort for a new feature?',
];

export default function CopilotWidget() {
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string; model?: string }>>([
    {
      role: 'assistant',
      content: 'Hi! I\'m your AI assistant. Ask me anything about task management, prioritization, or breaking down work.',
    },
  ]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const getSuggestion = useMutation({
    mutationFn: async (userPrompt: string) => {
      const { data } = await apiClient.post('/copilot/suggest', {
        prompt: userPrompt,
        context: {},
      });
      return data as SuggestionResponse;
    },
    onSuccess: (data) => {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: data.suggestion, model: data.model },
      ]);
    },
    onError: () => {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: 'Sorry, I encountered an error. Please try again.',
        },
      ]);
    },
  });

  // Auto-scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [open]);

  const handleSubmit = (text?: string) => {
    const msg = (text || prompt).trim();
    if (!msg || getSuggestion.isPending) return;

    setMessages((prev) => [...prev, { role: 'user', content: msg }]);
    setPrompt('');
    getSuggestion.mutate(msg);
  };

  return (
    <>
      {/* Floating action button */}
      <button
        onClick={() => setOpen(!open)}
        className={clsx(
          'fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-all duration-300 hover:scale-110',
          open ? 'bg-slate-800 rotate-45' : 'bg-primary-600',
        )}
        aria-label="Toggle AI Copilot"
      >
        {open ? (
          <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
          </svg>
        )}
      </button>

      {/* Chat panel */}
      <div
        className={clsx(
          'fixed bottom-24 right-6 z-50 w-80 sm:w-96 rounded-2xl bg-white shadow-2xl border border-slate-200 transition-all duration-300 origin-bottom-right',
          open ? 'scale-100 opacity-100' : 'scale-95 opacity-0 pointer-events-none',
        )}
      >
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary-500 to-indigo-600">
            <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-900">AI Copilot</p>
            <p className="text-xs text-slate-400 truncate">
              {getSuggestion.data?.provider === 'openai'
                ? `Powered by ${getSuggestion.data?.model}`
                : 'Rule-based assistant'}
            </p>
          </div>
        </div>

        {/* Messages */}
        <div className="h-80 overflow-y-auto p-4 space-y-3">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={clsx(
                'flex',
                msg.role === 'user' ? 'justify-end' : 'justify-start',
              )}
            >
              <div
                className={clsx(
                  'max-w-[85%] rounded-xl px-3 py-2 text-sm',
                  msg.role === 'user'
                    ? 'bg-primary-600 text-white'
                    : 'bg-slate-100 text-slate-700',
                )}
              >
                <div className="whitespace-pre-wrap">{msg.content}</div>
                {msg.model && msg.role === 'assistant' && (
                  <p className="mt-1 text-[10px] text-slate-400 opacity-70">via {msg.model}</p>
                )}
              </div>
            </div>
          ))}
          {getSuggestion.isPending && (
            <div className="flex justify-start">
              <div className="max-w-[85%] rounded-xl bg-slate-100 px-3 py-2">
                <div className="flex gap-1">
                  <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400" />
                  <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: '0.1s' }} />
                  <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: '0.2s' }} />
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Quick actions */}
        <div className="px-4 pb-2">
          <div className="flex flex-wrap gap-1.5">
            {QUICK_ACTIONS.slice(0, 3).map((action) => (
              <button
                key={action}
                onClick={() => handleSubmit(action)}
                disabled={getSuggestion.isPending}
                className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] text-slate-500 hover:bg-slate-200 transition-colors truncate max-w-[140px]"
              >
                {action}
              </button>
            ))}
          </div>
        </div>

        {/* Input */}
        <div className="border-t border-slate-100 p-4">
          <div className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              className="input flex-1 rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-200"
              placeholder="Ask me anything..."
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            />
            <button
              onClick={() => handleSubmit()}
              disabled={!prompt.trim() || getSuggestion.isPending}
              className="btn-primary rounded-xl px-3 py-2"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
