import { useState, useEffect, useRef, useCallback } from "react";
import API from "../api/api";
import { useAuth } from "../contexts/AuthContext";
import { useSocket } from "../contexts/SocketContext";
import { useToast } from "../contexts/ToastContext";
import { CheckIcon, CloseIcon } from "../components/common/Icons";
import "./Chat.css";

// ─── Helpers ─────────────────────────────────────────────────────────────────
const getInitials = (name = "") =>
  name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

const formatTime = (date) => {
  if (!date) return "";
  const d = new Date(date);
  const now = new Date();
  const isToday =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear();
  if (isToday)
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
};

const AVATAR_COLORS = [
  "#6366f1","#8b5cf6","#ec4899","#f59e0b","#10b981","#3b82f6","#ef4444","#14b8a6",
];
const avatarColor = (name = "") => {
  let hash = 0;
  for (let c of name) hash = c.charCodeAt(0) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
};

// ─── Sub-component: Avatar ───────────────────────────────────────────────────
function Avatar({ name, image, size = 38 }) {
  const initials = getInitials(name);
  const bg = avatarColor(name);
  if (image) {
    return (
      <img
        src={`http://localhost:5000${image}`}
        alt={name}
        className="chat-avatar-img"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className="chat-avatar-initials"
      style={{ width: size, height: size, background: bg, fontSize: size * 0.38 }}
    >
      {initials}
    </div>
  );
}

// ─── Sub-component: NewConversationModal ─────────────────────────────────────
function NewConversationModal({ staff, currentUser, onClose, onCreate, isOwner }) {
  const [mode, setMode] = useState("direct"); // direct | group
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState([]);
  const [groupName, setGroupName] = useState("");
  const [clients, setClients] = useState([]);
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");

  const filtered = staff.filter(
    (s) =>
      s._id !== currentUser._id &&
      (s.name.toLowerCase().includes(search.toLowerCase()) ||
        s.email.toLowerCase().includes(search.toLowerCase()))
  );

  const toggleSelect = (id) => {
    if (mode === "direct") {
      setSelected([id]);
    } else {
      setSelected((prev) =>
        prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
      );
    }
  };

  const addClient = () => {
    if (!clientName.trim() || !clientEmail.trim()) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clientEmail)) return;
    setClients((prev) => [...prev, { name: clientName.trim(), email: clientEmail.trim() }]);
    setClientName("");
    setClientEmail("");
  };

  const removeClient = (email) =>
    setClients((prev) => prev.filter((c) => c.email !== email));

  const handleCreate = () => {
    if (selected.length === 0) return;
    if (mode === "direct") {
      onCreate({ type: "direct", targetUserId: selected[0] });
    } else {
      onCreate({
        type: "group",
        name: groupName || "Group Chat",
        participantIds: selected,
        clientParticipants: clients,
      });
    }
  };

  return (
    <div className="chat-modal-overlay" onClick={onClose}>
      <div className="chat-modal" onClick={(e) => e.stopPropagation()}>
        <div className="chat-modal-header">
          <h3>New Conversation</h3>
          <button className="chat-modal-close" onClick={onClose}><CloseIcon size={16} /></button>
        </div>

        {/* Mode toggle */}
        <div className="chat-mode-tabs">
          <button
            className={`chat-mode-tab ${mode === "direct" ? "active" : ""}`}
            onClick={() => { setMode("direct"); setSelected([]); }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            Direct Message
          </button>
          <button
            className={`chat-mode-tab ${mode === "group" ? "active" : ""}`}
            onClick={() => { setMode("group"); setSelected([]); }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            Group Chat
          </button>
        </div>

        {mode === "group" && (
          <div className="chat-modal-group-name">
            <input
              type="text"
              placeholder="Group name (optional)"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              className="chat-modal-input"
            />
          </div>
        )}

        <div className="chat-modal-search">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input
            type="text"
            placeholder="Search staff..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="chat-search-input"
            autoFocus
          />
        </div>

        <div className="chat-modal-staff-list">
          {filtered.length === 0 && (
            <div className="chat-modal-empty">No staff found</div>
          )}
          {filtered.map((s) => (
            <div
              key={s._id}
              className={`chat-modal-staff-item ${selected.includes(s._id) ? "selected" : ""}`}
              onClick={() => toggleSelect(s._id)}
            >
              <Avatar name={s.name} image={s.image} size={36} />
              <div className="chat-modal-staff-info">
                <span className="chat-modal-staff-name">{s.name}</span>
                <span className="chat-modal-staff-email">{s.email}</span>
              </div>
              {selected.includes(s._id) && (
                <span className="chat-modal-check"><CheckIcon size={14} color="var(--primary-color, #4f46e5)" /></span>
              )}
            </div>
          ))}
        </div>

        {/* Add Client (owner/admin only, group only) */}
        {isOwner && mode === "group" && (
          <div className="chat-modal-clients">
            <div className="chat-modal-clients-header">
              <span className="chat-clients-badge">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
                Add Client (Project Owner only)
              </span>
            </div>
            <div className="chat-modal-client-inputs">
              <input
                type="text"
                placeholder="Client name"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                className="chat-modal-input"
              />
              <input
                type="email"
                placeholder="Client email"
                value={clientEmail}
                onChange={(e) => setClientEmail(e.target.value)}
                className="chat-modal-input"
              />
              <button className="chat-add-client-btn" onClick={addClient}>
                Add
              </button>
            </div>
            {clients.length > 0 && (
              <div className="chat-client-tags">
                {clients.map((c) => (
                  <span key={c.email} className="chat-client-tag">
                    {c.name}
                    <button onClick={() => removeClient(c.email)} style={{ display: "inline-flex", alignItems: "center" }}><CloseIcon size={11} /></button>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="chat-modal-actions">
          <button className="chat-modal-cancel" onClick={onClose}>Cancel</button>
          <button
            className="chat-modal-create"
            onClick={handleCreate}
            disabled={selected.length === 0}
          >
            {mode === "direct" ? "Start Chat" : "Create Group"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Sub-component: ManageClientsModal ───────────────────────────────────────
function ManageClientsModal({ conversation, onClose, onUpdate }) {
  const { showToast } = useToast();
  const [savedClients, setSavedClients] = useState([]);
  const [clientName, setClientName]     = useState("");
  const [clientEmail, setClientEmail]   = useState("");
  const [loading, setLoading]           = useState(false);
  const [tab, setTab]                   = useState("saved");

  useEffect(() => {
    API.get("/clients").then((r) => setSavedClients(r.data)).catch(() => {});
  }, []);

  const alreadyAdded = (email) =>
    conversation.clientParticipants?.some(
      (c) => c.email.toLowerCase() === email.toLowerCase()
    );

  const addFromSaved = async (client) => {
    if (alreadyAdded(client.email)) return showToast("Client already in conversation", "error");
    setLoading(true);
    try {
      const res = await API.put(`/chat/conversations/${conversation._id}/add-client`, { name: client.name, email: client.email });
      onUpdate(res.data);
      showToast("Client added to conversation");
    } catch (err) { showToast(err?.response?.data?.message || "Failed to add client", "error"); }
    setLoading(false);
  };

  const addManual = async () => {
    if (!clientName.trim() || !clientEmail.trim()) return;
    setLoading(true);
    try {
      const res = await API.put(`/chat/conversations/${conversation._id}/add-client`, { name: clientName.trim(), email: clientEmail.trim() });
      onUpdate(res.data);
      showToast("Client added to conversation");
      setClientName(""); setClientEmail("");
    } catch (err) { showToast(err?.response?.data?.message || "Failed to add client", "error"); }
    setLoading(false);
  };

  const removeClient = async (clientId) => {
    setLoading(true);
    try {
      const res = await API.put(
        `/chat/conversations/${conversation._id}/remove-client`,
        { clientId }
      );
      onUpdate(res.data);
      showToast("Client removed from conversation");
    } catch (err) {
      showToast(err?.response?.data?.message || "Failed to remove client", "error");
    }
    setLoading(false);
  };

  return (
    <div className="chat-modal-overlay" onClick={onClose}>
      <div className="chat-modal" onClick={(e) => e.stopPropagation()}>
        <div className="chat-modal-header">
          <h3>Manage Clients</h3>
          <button className="chat-modal-close" onClick={onClose}><CloseIcon size={16} /></button>
        </div>

        <div className="chat-modal-section-title">Current Clients in this Chat</div>
        <div className="chat-client-list-mgr">
          {conversation.clientParticipants?.length === 0 && (
            <div className="chat-modal-empty">No clients added yet</div>
          )}
          {conversation.clientParticipants?.map((c) => (
            <div key={c._id} className="chat-client-mgr-item">
              <Avatar name={c.name} size={34} />
              <div className="chat-modal-staff-info">
                <span className="chat-modal-staff-name">{c.name}</span>
                <span className="chat-modal-staff-email">{c.email}</span>
              </div>
              <button className="chat-remove-client-btn" onClick={() => removeClient(c._id)} disabled={loading}>Remove</button>
            </div>
          ))}
        </div>

        <div className="chat-mode-tabs" style={{ margin: "10px 16px 0" }}>
          <button className={`chat-mode-tab ${tab === "saved" ? "active" : ""}`} onClick={() => setTab("saved")}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
            Saved Clients
          </button>
          <button className={`chat-mode-tab ${tab === "manual" ? "active" : ""}`} onClick={() => setTab("manual")}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Add Manually
          </button>
        </div>

        {tab === "saved" ? (
          <div className="chat-client-list-mgr" style={{ maxHeight: 200, marginTop: 8 }}>
            {savedClients.filter((c) => c.status === "Active").length === 0 && (
              <div className="chat-modal-empty">No active clients. Go to Clients page to add some.</div>
            )}
            {savedClients.filter((c) => c.status === "Active").map((c) => {
              const added = alreadyAdded(c.email);
              return (
                <div key={c._id} className="chat-client-mgr-item">
                  <Avatar name={c.name} size={34} />
                  <div className="chat-modal-staff-info">
                    <span className="chat-modal-staff-name">{c.name}</span>
                    <span className="chat-modal-staff-email">{c.email}</span>
                  </div>
                  <button
                    style={{ padding: "4px 12px", borderRadius: 7, border: "none", flexShrink: 0, marginLeft: "auto",
                      background: added ? "rgba(16,185,129,0.12)" : "linear-gradient(135deg,#6366f1,#8b5cf6)",
                      color: added ? "#10b981" : "#fff", fontSize: 12, fontWeight: 600, cursor: added ? "default" : "pointer",
                      display: "inline-flex", alignItems: "center", gap: "4px" }}
                    onClick={() => !added && addFromSaved(c)}
                    disabled={loading || added}
                  >
                    {added ? <><CheckIcon size={12} color="#10b981" /> Added</> : "+ Add"}
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ padding: "10px 16px" }}>
            <div className="chat-modal-client-inputs">
              <input type="text" placeholder="Client name" value={clientName}
                onChange={(e) => setClientName(e.target.value)} className="chat-modal-input" />
              <input type="email" placeholder="Client email" value={clientEmail}
                onChange={(e) => setClientEmail(e.target.value)} className="chat-modal-input" />
              <button className="chat-add-client-btn" onClick={addManual} disabled={loading}>Add</button>
            </div>
          </div>
        )}

        <div className="chat-modal-actions" style={{ marginTop: "0.75rem" }}>
          <button className="chat-modal-cancel" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Chat Component ──────────────────────────────────────────────────────
export default function Chat() {
  const { user } = useAuth();
  const { socket } = useSocket();

  const [conversations, setConversations] = useState([]);
  const [activeConvo, setActiveConvo] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showNewModal, setShowNewModal] = useState(false);
  const [showClientsModal, setShowClientsModal] = useState(false);
  const [typingUser, setTypingUser] = useState("");
  const [searchConvo, setSearchConvo] = useState("");
  const [unreadCounts, setUnreadCounts] = useState({});
  const [sending, setSending] = useState(false);

  const messagesEndRef = useRef(null);
  const typingTimeout = useRef(null);
  const activeConvoRef = useRef(null);

  const isOwner =
    user?.email === "gadanipranav@gmail.com" ||
    user?.role?.name === "Super Admin" ||
    user?.role?.name === "Company Owner";

  // ─── Scroll to bottom ───
  const scrollToBottom = () =>
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // ─── Load conversations & staff ───
  useEffect(() => {
    fetchConversations();
    fetchStaff();
    fetchUnreadCounts();
    // eslint-disable-next-line
  }, []);

  const fetchConversations = async () => {
    try {
      const res = await API.get("/chat/conversations");
      setConversations(res.data);
    } catch (err) {
      console.error("fetchConversations:", err);
    }
  };

  const fetchStaff = async () => {
    try {
      const res = await API.get("/chat/staff");
      setStaff(res.data);
    } catch (err) {
      console.error("fetchStaff:", err);
    }
  };

  const fetchUnreadCounts = async () => {
    try {
      const res = await API.get("/chat/unread-counts");
      setUnreadCounts(res.data);
    } catch (err) {
      console.error("fetchUnreadCounts:", err);
    }
  };

  // ─── Socket listeners ───
  useEffect(() => {
    if (!socket) return;

    const handleNewMessage = (msg) => {
      // If message is for the active convo, append it
      if (msg.conversationId === activeConvoRef.current?._id) {
        setMessages((prev) => {
          // If already in list by real ID, avoid duplicate
          if (prev.some((m) => m._id === msg._id)) return prev;

          // If this message was sent by the current user, replace the temporary optimistic message
          const currentUserId = user?._id || user?.id;
          const msgSenderId = msg.sender?._id || msg.sender?.id || msg.senderId;
          const optIndex = prev.findIndex(
            (m) => m.optimistic && (msgSenderId === currentUserId || m.senderName === msg.senderName) && m.text === msg.text
          );

          if (optIndex !== -1) {
            const updated = [...prev];
            updated[optIndex] = msg;
            return updated;
          }

          return [...prev, msg];
        });
      } else {
        // Increment unread count
        setUnreadCounts((prev) => ({
          ...prev,
          [msg.conversationId]: (prev[msg.conversationId] || 0) + 1,
        }));
      }

      // Update lastMessage in conversations list
      setConversations((prev) =>
        prev
          .map((c) =>
            c._id === msg.conversationId
              ? {
                  ...c,
                  lastMessage: {
                    text: msg.text,
                    senderName: msg.senderName,
                    sentAt: msg.createdAt,
                  },
                  updatedAt: msg.createdAt,
                }
              : c
          )
          .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
      );
    };

    const handleTyping = ({ userName, isTyping }) => {
      if (isTyping) {
        setTypingUser(userName);
      } else {
        setTypingUser((prev) => (prev === userName ? "" : prev));
      }
    };

    socket.on("new_message", handleNewMessage);
    socket.on("user_typing", handleTyping);

    return () => {
      socket.off("new_message", handleNewMessage);
      socket.off("user_typing", handleTyping);
    };
  }, [socket]);

  // ─── Select conversation ───
  const selectConversation = useCallback(
    async (convo) => {
      if (activeConvoRef.current?._id === convo._id) return;

      // Leave old room
      if (activeConvoRef.current && socket) {
        socket.emit("leave_conversation", activeConvoRef.current._id);
      }

      setActiveConvo(convo);
      activeConvoRef.current = convo;
      setMessages([]);
      setTypingUser("");

      // Join new room
      if (socket) socket.emit("join_conversation", convo._id);

      // Clear unread count locally and broadcast to header
      setUnreadCounts((prev) => ({ ...prev, [convo._id]: 0 }));
      window.dispatchEvent(new CustomEvent("chat_conversation_read", { detail: { conversationId: convo._id } }));
      if (socket && (user?._id || user?.id)) {
        socket.emit("mark_as_read", { conversationId: convo._id, userId: user._id || user.id });
      }

      // Load messages (this also automatically marks messages read in backend)
      setLoading(true);
      try {
        const res = await API.get(`/chat/conversations/${convo._id}/messages`);
        setMessages(res.data);
      } catch (err) {
        console.error("load messages:", err);
      }
      setLoading(false);
    },
    [socket]
  );

  // ─── Send message ───
  const sendMessage = async () => {
    if (!text.trim() || !activeConvo || sending) return;
    const trimmed = text.trim();
    setText("");
    setSending(true);

    // Optimistic UI
    const optimistic = {
      _id: `opt_${Date.now()}`,
      conversationId: activeConvo._id,
      sender: { _id: user._id, name: user.name, image: user.image },
      senderName: user.name,
      text: trimmed,
      createdAt: new Date().toISOString(),
      optimistic: true,
    };
    setMessages((prev) => [...prev, optimistic]);

    try {
      if (socket) {
        socket.emit("send_message", {
          conversationId: activeConvo._id,
          text: trimmed,
          senderId: user._id,
          senderName: user.name,
          senderImage: user.image || "",
        });
      } else {
        await API.post(`/chat/conversations/${activeConvo._id}/messages`, { text: trimmed });
      }

      // Replace optimistic with real (will come via socket or just leave it)
      setSending(false);
    } catch (err) {
      console.error("sendMessage:", err);
      setMessages((prev) => prev.filter((m) => m._id !== optimistic._id));
      setSending(false);
    }
  };

  // ─── Typing indicator ───
  const handleTyping = (e) => {
    setText(e.target.value);
    if (!socket || !activeConvo) return;

    socket.emit("typing", {
      conversationId: activeConvo._id,
      userName: user.name,
      isTyping: true,
    });

    if (typingTimeout.current) clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(() => {
      socket.emit("typing", {
        conversationId: activeConvo._id,
        userName: user.name,
        isTyping: false,
      });
    }, 1500);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // ─── Create conversation ───
  const handleCreateConversation = async ({ type, targetUserId, name, participantIds, clientParticipants }) => {
    setShowNewModal(false);
    try {
      let res;
      if (type === "direct") {
        res = await API.post("/chat/conversations/direct", { targetUserId });
      } else {
        res = await API.post("/chat/conversations/group", {
          name,
          participantIds,
          clientParticipants,
        });
      }
      const newConvo = res.data;

      setConversations((prev) => {
        const exists = prev.find((c) => c._id === newConvo._id);
        if (exists) return prev;
        return [newConvo, ...prev];
      });
      selectConversation(newConvo);
    } catch (err) {
      console.error("createConversation:", err);
    }
  };

  // ─── Conversation name helper ───
  const getConvoName = (convo) => {
    if (convo.type === "group") return convo.name || "Group Chat";
    const other = convo.participants?.find((p) => p._id !== user._id);
    return other?.name || "Unknown";
  };

  const getConvoAvatar = (convo) => {
    if (convo.type === "group") return null;
    const other = convo.participants?.find((p) => p._id !== user._id);
    return { name: other?.name || "?", image: other?.image };
  };

  const filteredConvos = conversations.filter((c) => {
    const trimmed = (searchConvo || "").trim().toLowerCase();
    if (!trimmed || trimmed.length < 3) return true;
    return getConvoName(c).toLowerCase().includes(trimmed);
  });

  const totalUnread = Object.values(unreadCounts).reduce((a, b) => a + b, 0);

  return (
    <div className="chat-page">
      {/* ── Sidebar ── */}
      <aside className="chat-sidebar">
        <div className="chat-sidebar-header">
          <div className="chat-sidebar-title">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            Messages
            {totalUnread > 0 && (
              <span className="chat-unread-badge-total">{totalUnread}</span>
            )}
          </div>
          <button
            className="chat-new-btn"
            onClick={() => setShowNewModal(true)}
            title="New conversation"
            id="chat-new-conv-btn"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </button>
        </div>

        <div className="chat-sidebar-search">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input
            type="text"
            placeholder="Search conversations..."
            value={searchConvo}
            onChange={(e) => setSearchConvo(e.target.value)}
            className="chat-search-input"
          />
        </div>

        <div className="chat-convo-list">
          {filteredConvos.length === 0 && (
            <div className="chat-convo-empty">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              <p>No conversations yet</p>
              <span>Click + to start one</span>
            </div>
          )}
          {filteredConvos.map((convo) => {
            const av = getConvoAvatar(convo);
            const name = getConvoName(convo);
            const unread = unreadCounts[convo._id] || 0;
            const isActive = activeConvo?._id === convo._id;

            return (
              <div
                key={convo._id}
                className={`chat-convo-item ${isActive ? "active" : ""}`}
                onClick={() => selectConversation(convo)}
                id={`convo-item-${convo._id}`}
              >
                <div className="chat-convo-avatar-wrap">
                  {convo.type === "group" ? (
                    <div className="chat-group-avatar">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                    </div>
                  ) : (
                    <Avatar name={av?.name} image={av?.image} size={42} />
                  )}
                  {unread > 0 && (
                    <span className="chat-unread-dot">{unread > 99 ? "99+" : unread}</span>
                  )}
                </div>
                <div className="chat-convo-info">
                  <div className="chat-convo-name-row">
                    <span className="chat-convo-name">{name}</span>
                    <span className="chat-convo-time">
                      {formatTime(convo.lastMessage?.sentAt || convo.updatedAt)}
                    </span>
                  </div>
                  <div className="chat-convo-preview">
                    {convo.type === "group" && (
                      <span className="chat-group-badge">Group</span>
                    )}
                    <span className={`chat-convo-last ${unread > 0 ? "unread" : ""}`}>
                      {convo.lastMessage?.text
                        ? (convo.lastMessage.senderName
                            ? `${convo.lastMessage.senderName.split(" ")[0]}: `
                            : "") + convo.lastMessage.text
                        : "No messages yet"}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </aside>

      {/* ── Chat Panel ── */}
      <section className="chat-panel">
        {!activeConvo ? (
          <div className="chat-empty-state">
            <div className="chat-empty-icon">
              <svg width="72" height="72" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            </div>
            <h2>Welcome to Chat</h2>
            <p>Select a conversation or start a new one</p>
            <button className="chat-empty-cta" onClick={() => setShowNewModal(true)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              New Conversation
            </button>
          </div>
        ) : (
          <>
            {/* Chat Header */}
            <div className="chat-panel-header">
              <div className="chat-panel-header-left">
                {activeConvo.type === "group" ? (
                  <div className="chat-group-avatar-lg">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                  </div>
                ) : (() => {
                  const av = getConvoAvatar(activeConvo);
                  return <Avatar name={av?.name} image={av?.image} size={42} />;
                })()}
                <div className="chat-panel-header-info">
                  <h3>{getConvoName(activeConvo)}</h3>
                  {activeConvo.type === "group" && (
                    <span className="chat-panel-members">
                      {activeConvo.participants?.length} member{activeConvo.participants?.length !== 1 ? "s" : ""}
                      {activeConvo.clientParticipants?.length > 0 &&
                        ` + ${activeConvo.clientParticipants.length} client${activeConvo.clientParticipants.length !== 1 ? "s" : ""}`}
                    </span>
                  )}
                  {activeConvo.type === "direct" && (() => {
                    const other = activeConvo.participants?.find((p) => p._id !== user._id);
                    return <span className="chat-panel-status">{other?.position || other?.email}</span>;
                  })()}
                </div>
              </div>

              <div className="chat-panel-header-actions">
                {/* Add Client button for owner on group chats */}
                {isOwner && activeConvo.type === "group" && (
                  <button
                    className="chat-panel-action-btn"
                    onClick={() => setShowClientsModal(true)}
                    title="Manage Clients"
                    id="chat-manage-clients-btn"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
                    Manage Clients
                  </button>
                )}
              </div>
            </div>

            {/* Client chips (if any) */}
            {activeConvo.clientParticipants?.length > 0 && (
              <div className="chat-clients-bar">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
                Clients:
                {activeConvo.clientParticipants.map((c) => (
                  <span key={c._id} className="chat-client-chip">
                    {c.name}
                  </span>
                ))}
              </div>
            )}

            {/* Messages area */}
            <div className="chat-messages-area" id="chat-messages-area">
              {loading && (
                <div className="chat-loading">
                  <div className="chat-loading-dots">
                    <span /><span /><span />
                  </div>
                </div>
              )}

              {!loading && messages.length === 0 && (
                <div className="chat-messages-empty">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                  <p>No messages yet. Say hello to start the conversation.</p>
                </div>
              )}

              {messages.map((msg, idx) => {
                const isMe = msg.sender?._id === user._id || msg.sender === user._id;
                const senderName = msg.senderName || msg.sender?.name || "Unknown";
                const prevMsg = messages[idx - 1];
                const showSender =
                  !isMe &&
                  activeConvo.type === "group" &&
                  (idx === 0 || (prevMsg?.sender?._id || prevMsg?.sender) !== (msg.sender?._id || msg.sender));

                return (
                  <div
                    key={msg._id}
                    className={`chat-msg-wrapper ${isMe ? "me" : "other"}`}
                  >
                    {!isMe && showSender && (
                      <div className="chat-msg-sender-name">{senderName}</div>
                    )}
                    <div className="chat-msg-row">
                      {!isMe && (
                        <div className="chat-msg-avatar">
                          <Avatar
                            name={senderName}
                            image={msg.sender?.image}
                            size={30}
                          />
                        </div>
                      )}
                      <div className={`chat-bubble ${isMe ? "me" : "other"} ${msg.optimistic ? "optimistic" : ""}`}>
                        <span>{msg.text}</span>
                      </div>
                    </div>
                    <div className={`chat-msg-time ${isMe ? "me" : "other"}`}>
                      {formatTime(msg.createdAt)}
                    </div>
                  </div>
                );
              })}

              {typingUser && (
                <div className="chat-typing-indicator">
                  <span className="chat-typing-dot" /><span className="chat-typing-dot" /><span className="chat-typing-dot" />
                  <span className="chat-typing-name">{typingUser} is typing…</span>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="chat-input-area">
              <textarea
                className="chat-input"
                placeholder="Type a message… (Enter to send)"
                value={text}
                onChange={handleTyping}
                onKeyDown={handleKeyDown}
                rows={1}
                id="chat-message-input"
              />
              <button
                className={`chat-send-btn ${text.trim() ? "active" : ""}`}
                onClick={sendMessage}
                disabled={!text.trim() || sending}
                id="chat-send-btn"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
              </button>
            </div>
          </>
        )}
      </section>

      {/* Modals */}
      {showNewModal && (
        <NewConversationModal
          staff={staff}
          currentUser={user}
          isOwner={isOwner}
          onClose={() => setShowNewModal(false)}
          onCreate={handleCreateConversation}
        />
      )}

      {showClientsModal && activeConvo && (
        <ManageClientsModal
          conversation={activeConvo}
          onClose={() => setShowClientsModal(false)}
          onUpdate={(updated) => {
            setActiveConvo(updated);
            setConversations((prev) =>
              prev.map((c) => (c._id === updated._id ? { ...c, ...updated } : c))
            );
          }}
        />
      )}
    </div>
  );
}
