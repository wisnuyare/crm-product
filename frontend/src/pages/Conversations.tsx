import { useEffect, useMemo, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { Card } from '../components/ui/Card';
import { API_BASE_URLS, api } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { auth } from '../services/firebase';

type ConversationSummary = {
  id: string;
  customer_name?: string | null;
  customer_phone: string;
  status: 'active' | 'resolved' | 'handed_off' | 'expired';
  last_message_at?: string | null;
  handoff_requested?: boolean;
  handoff_reason?: string | null;
  outlet_id: string;
};

type ConversationMessage = {
  id: string;
  conversation_id: string;
  sender_type: 'customer' | 'llm' | 'agent';
  sender_id?: string | null;
  content: string;
  timestamp: string;
};

const statusTokens: Record<
  ConversationSummary['status'],
  { label: string; classes: string; accent?: string; iconBg: string }
> = {
  active: {
    label: 'active',
    classes: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
    accent: 'text-emerald-600',
    iconBg: 'bg-emerald-500',
  },
  resolved: {
    label: 'resolved',
    classes: 'bg-gray-50 text-gray-700 border border-gray-200',
    accent: 'text-gray-500',
    iconBg: 'bg-gray-500',
  },
  handed_off: {
    label: 'handed off',
    classes: 'bg-amber-50 text-amber-700 border border-amber-200',
    accent: 'text-amber-600',
    iconBg: 'bg-amber-500',
  },
  expired: {
    label: 'expired',
    classes: 'bg-red-50 text-red-700 border border-red-200',
    accent: 'text-red-600',
    iconBg: 'bg-red-500',
  },
};

const formatTimestamp = (value?: string | null) => {
  if (!value) return '—';
  try {
    return new Intl.DateTimeFormat('en', {
      hour: 'numeric',
      minute: 'numeric',
      month: 'short',
      day: 'numeric',
    }).format(new Date(value));
  } catch {
    return value;
  }
};

export function Conversations() {
  const { tenantId } = useAuth();
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [conversationsLoading, setConversationsLoading] = useState(false);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [composerValue, setComposerValue] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [handoffLoading, setHandoffLoading] = useState(false);
  const [handoffNotice, setHandoffNotice] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const previousConversationRef = useRef<string | null>(null);
  const selectedConversationRef = useRef<string | null>(null);

  const selectedConversation = useMemo(
    () => conversations.find((conv) => conv.id === selectedConversationId) || null,
    [conversations, selectedConversationId]
  );
  const isHandoffActive = Boolean(selectedConversation?.handoff_requested);

  useEffect(() => {
    selectedConversationRef.current = selectedConversationId;
  }, [selectedConversationId]);

  useEffect(() => {
    if (!tenantId) return;

    const initSocket = async () => {
      const user = auth.currentUser;
      if (!user) return;

      const token = await user.getIdToken();

      const socket = io(API_BASE_URLS.conversation, {
        transports: ['websocket'],
        reconnectionDelayMax: 5000,
        auth: {
          token,
        },
      });
      socketRef.current = socket;
      socket.emit('tenant:join', { tenant_id: tenantId });

    socket.on('conversation:new', (conversation: ConversationSummary) => {
      setConversations((prev) => {
        const exists = prev.some((c) => c.id === conversation.id);
        if (exists) {
          return prev.map((c) => (c.id === conversation.id ? conversation : c));
        }
        return [conversation, ...prev];
      });
    });

    socket.on('conversation:message', (message: ConversationMessage) => {
      setConversations((prev) =>
        prev.map((conv) =>
          conv.id === message.conversation_id
            ? { ...conv, last_message_at: message.timestamp }
            : conv,
        ),
      );
      setMessages((prev) => {
        if (selectedConversationRef.current !== message.conversation_id) {
          return prev;
        }
        if (prev.some((m) => m.id === message.id)) {
          return prev;
        }
        return [...prev, message];
      });
    });

    socket.on('conversation:handoff', (handoff: { conversation_id: string; reason?: string | null; requested: boolean }) => {
      setConversations((prev) =>
        prev.map((conv) =>
          conv.id === handoff.conversation_id
            ? {
                ...conv,
                handoff_requested: handoff.requested,
                handoff_reason: handoff.reason ?? conv.handoff_reason,
              }
            : conv,
        ),
      );
      if (selectedConversationRef.current === handoff.conversation_id) {
        if (handoff.requested) {
          setHandoffNotice('LLM paused because a human agent took over this conversation.');
        } else {
          setHandoffNotice('LLM resumed. Automated replies are enabled again.');
        }
      }
    });

      socket.on(
        'conversation:status',
        (payload: { conversation_id: string; status: ConversationSummary['status'] }) => {
          setConversations((prev) =>
            prev.map((conv) =>
              conv.id === payload.conversation_id ? { ...conv, status: payload.status } : conv,
            ),
          );
        },
      );
    };

    initSocket();

    return () => {
      const socket = socketRef.current;
      if (socket) {
        socket.disconnect();
        socketRef.current = null;
      }
    };
  }, [tenantId]);

  useEffect(() => {
    const socket = socketRef.current;
    if (!socket) return;
    const previousId = previousConversationRef.current;
    if (previousId && previousId !== selectedConversationId) {
      socket.emit('conversation:leave', { conversation_id: previousId });
    }
    if (selectedConversationId) {
      socket.emit('conversation:join', { conversation_id: selectedConversationId });
    }
    previousConversationRef.current = selectedConversationId;
  }, [selectedConversationId]);

  const loadConversations = async () => {
    setConversationsLoading(true);
    setError(null);
    try {
      const data = await api.conversationService.getActiveConversations();
      setConversations(data);
      setHandoffNotice(null);
      if (data.length === 0) {
        setSelectedConversationId(null);
      } else if (!selectedConversationId || !data.find((conv: ConversationSummary) => conv.id === selectedConversationId)) {
        setSelectedConversationId(data[0].id);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load conversations');
    } finally {
      setConversationsLoading(false);
    }
  };

  const loadMessages = async (conversationId: string) => {
    setMessagesLoading(true);
    setError(null);
    try {
      const data = await api.conversationService.getMessages(conversationId, 100);
      setMessages(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load messages');
      setMessages([]);
    } finally {
      setMessagesLoading(false);
    }
  };

  useEffect(() => {
    loadConversations();
  }, []);

  useEffect(() => {
    if (selectedConversationId) {
      loadMessages(selectedConversationId);
      setHandoffNotice(null);
    } else {
      setMessages([]);
    }
  }, [selectedConversationId]);

  const handleSendMessage = async () => {
    if (!selectedConversationId || !composerValue.trim()) {
      return;
    }

    if (!isHandoffActive) {
      setError('Pause LLM & Take Over before sending manual replies.');
      return;
    }

    setSending(true);
    setError(null);
    try {
      const payload = {
        conversation_id: selectedConversationId,
        sender_type: 'agent' as const,
        content: composerValue.trim(),
      };
      const response = await api.conversationService.sendMessage(payload);
      const newMessage = response.message || response;
      setMessages((prev) => [...prev, newMessage]);
      setComposerValue('');
    } catch (err: any) {
      setError(err.message || 'Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const handleRequestHandoff = async () => {
    if (!selectedConversationId || handoffLoading) {
      return;
    }
    setHandoffLoading(true);
    setHandoffNotice(null);
    setError(null);
    try {
      const updatedConversation = await api.conversationService.requestHandoff(
        selectedConversationId,
        'Agent manually took over the conversation',
      );

      setConversations((prev) =>
        prev.map((conv) => (conv.id === updatedConversation.id ? updatedConversation : conv)),
      );
      setHandoffNotice('LLM responses paused. You are now handling this conversation.');
    } catch (err: any) {
      setError(err.message || 'Failed to request human handoff');
    } finally {
      setHandoffLoading(false);
    }
  };

  const handleResumeAutomation = async () => {
    if (!selectedConversationId || handoffLoading) {
      return;
    }
    setHandoffLoading(true);
    setError(null);
    setHandoffNotice(null);
    try {
      const updatedConversation = await api.conversationService.resumeHandoff(
        selectedConversationId,
      );
      setConversations((prev) =>
        prev.map((conv) => (conv.id === updatedConversation.id ? updatedConversation : conv)),
      );
      setHandoffNotice('LLM resumed. Automated replies are enabled again.');
    } catch (err: any) {
      setError(err.message || 'Failed to resume automation');
    } finally {
      setHandoffLoading(false);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      if (!sending) {
        handleSendMessage();
      }
    }
  };

  return (
    <div>
        <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Conversations</h1>
          <p className="mt-2 text-gray-600">
            Monitor ongoing WhatsApp chats and reply directly from the dashboard.
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={loadConversations}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            disabled={conversationsLoading}
          >
            {conversationsLoading ? 'Refreshing…' : 'Refresh'}
          </button>
          {selectedConversation && (
            isHandoffActive ? (
              <button
                onClick={handleResumeAutomation}
                disabled={handoffLoading}
                className={`rounded-md px-3 py-2 text-sm font-semibold text-white ${
                  handoffLoading ? 'bg-emerald-300' : 'bg-emerald-600 hover:bg-emerald-700'
                }`}
              >
                {handoffLoading ? 'Resuming…' : 'Resume LLM Replies'}
              </button>
            ) : (
              <button
                onClick={handleRequestHandoff}
                disabled={handoffLoading}
                className={`rounded-md px-3 py-2 text-sm font-semibold text-white ${
                  handoffLoading ? 'bg-rose-300' : 'bg-rose-600 hover:bg-rose-700'
                }`}
              >
                {handoffLoading ? 'Pausing LLM…' : 'Pause LLM & Take Over'}
              </button>
            )
          )}
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-md border-l-4 border-red-400 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}
      {handoffNotice && (
        <div className="mt-4 rounded-md border-l-4 border-emerald-400 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {handoffNotice}
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[320px,1fr]">
        <Card className="h-[650px] overflow-hidden p-0">
          <div className="border-b px-5 py-4">
            <h2 className="text-lg font-semibold text-gray-900">Active Conversations</h2>
            <p className="text-sm text-gray-500">Showing the most recent active chats.</p>
          </div>
          <div className="flex h-full flex-col">
            <div className="flex-1 overflow-y-auto">
              {conversationsLoading ? (
                <div className="space-y-4 p-5">
                  {Array.from({ length: 4 }).map((_, idx) => (
                    <div key={idx} className="animate-pulse space-y-2 rounded-lg border p-4">
                      <div className="h-4 w-1/2 rounded bg-gray-200" />
                      <div className="h-3 w-1/3 rounded bg-gray-100" />
                      <div className="h-3 w-2/3 rounded bg-gray-100" />
                    </div>
                  ))}
                </div>
              ) : conversations.length === 0 ? (
                <div className="p-5 text-center text-sm text-gray-500">
                  No active conversations yet. Incoming WhatsApp messages will appear here.
                </div>
              ) : (
                <ul className="divide-y">
                  {conversations.map((conversation) => {
                    const isSelected = conversation.id === selectedConversationId;
                    const statusToken = statusTokens[conversation.status];
                    return (
                      <li
                        key={conversation.id}
                        className={`cursor-pointer px-5 py-4 transition ${
                          isSelected ? 'bg-indigo-50' : 'hover:bg-gray-50'
                        }`}
                        onClick={() => setSelectedConversationId(conversation.id)}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="font-medium text-gray-900">
                              {conversation.customer_name || conversation.customer_phone}
                            </p>
                            <p className="text-sm text-gray-500">{conversation.customer_phone}</p>
                          </div>
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${statusToken.classes}`}
                          >
                            <span className={`h-2 w-2 rounded-full ${statusToken.iconBg}`} />
                            {statusToken.label}
                          </span>
                        </div>
                        <div className="mt-2 flex flex-col gap-1 text-xs text-gray-500">
                          <span>Last message {formatTimestamp(conversation.last_message_at)}</span>
                          {conversation.handoff_requested && (
                            <span className="inline-flex w-fit items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-1 font-medium text-amber-700">
                              <span className="h-2 w-2 rounded-full bg-amber-500" />
                              <span>Handoff requested</span>
                            </span>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </Card>

        <Card className="h-[650px] flex flex-col">
          {selectedConversation ? (
            <>
              <div className="border-b pb-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-semibold text-gray-900">
                      {selectedConversation.customer_name || selectedConversation.customer_phone}
                    </h2>
                    <p className="text-sm text-gray-500">{selectedConversation.customer_phone}</p>
                  </div>
                  <div className="text-right text-sm text-gray-500">
                    <span
                      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${statusTokens[selectedConversation.status].classes}`}
                    >
                      {statusTokens[selectedConversation.status].label}
                    </span>
                    <p className="mt-2">Last activity: {formatTimestamp(selectedConversation.last_message_at)}</p>
                  </div>
                </div>
                {isHandoffActive ? (
                  <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                    LLM paused: human agent is handling this conversation.
                    {selectedConversation.handoff_reason && (
                      <> – {selectedConversation.handoff_reason}</>
                    )}
                  </div>
                ) : (
                  <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                    Need to intervene? Use <strong>Pause LLM & Take Over</strong> to stop automated
                    replies.
                  </div>
                )}
                {handoffNotice && (
                  <div className="mt-2 text-sm text-emerald-700">{handoffNotice}</div>
                )}
              </div>

              <div className="flex-1 space-y-4 overflow-y-auto py-4 pr-2">
                {messagesLoading ? (
                  <div className="space-y-4">
                    {Array.from({ length: 5 }).map((_, idx) => (
                      <div key={idx} className="flex animate-pulse gap-2">
                        <div className="h-10 w-10 rounded-full bg-gray-200" />
                        <div className="flex-1 space-y-2">
                          <div className="h-4 w-1/3 rounded bg-gray-200" />
                          <div className="h-3 rounded bg-gray-100" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : messages.length === 0 ? (
                  <div className="text-center text-sm text-gray-500">
                    No messages yet. Use the composer below to start chatting.
                  </div>
                ) : (
                  messages.map((message) => {
                    const isAgent = message.sender_type === 'agent';
                    const isSystem = message.sender_type === 'llm';
                    return (
                      <div
                        key={message.id}
                        className={`flex flex-col ${isAgent ? 'items-end text-right' : 'items-start text-left'}`}
                      >
                        <div
                          className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm shadow-sm ${
                            isAgent
                              ? 'bg-indigo-600 text-white'
                              : isSystem
                                ? 'bg-sky-100 text-sky-900 border border-sky-200'
                                : 'bg-gray-100 text-gray-900 border border-gray-200'
                          }`}
                        >
                          {message.content}
                        </div>
                        <span className="mt-1 text-xs text-gray-500">
                          {message.sender_type.toUpperCase()} • {formatTimestamp(message.timestamp)}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>

              <div className="mt-4 border-t pt-4">
                <label htmlFor="composer" className="sr-only">
                  Message composer
                </label>
                <textarea
                  id="composer"
                  rows={3}
                  placeholder="Type your reply and press Enter to send…"
                  value={composerValue}
                  onChange={(event) => setComposerValue(event.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={!isHandoffActive}
                  className={`w-full rounded-lg border px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 ${
                    isHandoffActive
                      ? 'border-gray-300 focus:border-indigo-500 focus:ring-indigo-500'
                      : 'border-gray-200 bg-gray-100 text-gray-500'
                  }`}
                  placeholder={
                    isHandoffActive
                      ? 'Type your reply and press Enter to send…'
                      : 'Pause LLM & Take Over to enable manual replies.'
                  }
                />
                <div className="mt-3 flex items-center justify-between text-sm text-gray-500">
                  <span>
                    Shift + Enter for new line · Messages send as <strong>agent</strong>
                  </span>
                  <button
                    onClick={handleSendMessage}
                    disabled={sending || !composerValue.trim() || !isHandoffActive}
                    className={`rounded-md px-4 py-2 text-sm font-semibold text-white ${
                      sending || !composerValue.trim() || !isHandoffActive
                        ? 'bg-indigo-300'
                        : 'bg-indigo-600 hover:bg-indigo-700'
                    }`}
                  >
                    {sending ? 'Sending…' : 'Send'}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex h-full items-center justify-center text-center text-gray-500">
              Select a conversation from the list to view messages.
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
