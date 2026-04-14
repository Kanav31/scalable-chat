import React, { useContext, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChatContext } from '../../Context/ChatContext';
import io from 'socket.io-client';
import './MainPanel.css';

const getInitial = (name) => {
  if (name === 'group-chat') return '#';
  return name.charAt(0).toUpperCase();
};

const AVATAR_COLORS = ['#6c63ff','#e879f9','#38bdf8','#34d399','#fb923c','#f472b6'];
const avatarColor = (name) => AVATAR_COLORS[(name?.charCodeAt(0) || 0) % AVATAR_COLORS.length];

const MainPanel = () => {
  const { api }  = useContext(ChatContext);
  const navigate = useNavigate();

  const [socket,          setSocket]          = useState(null);
  const [myUsername,      setMyUsername]       = useState('');
  const [conversations,   setConversations]    = useState({ 'group-chat': [] });
  const [activeChat,      setActiveChat]       = useState('group-chat');
  const [newMessage,      setNewMessage]       = useState('');
  const [onlineUsers,     setOnlineUsers]      = useState([]);

  const messagesEndRef = useRef(null);
  const inputRef       = useRef(null);

  // ── Auth guard ───────────────────────────────────────────────────────────
  useEffect(() => {
    const username = localStorage.getItem('username');
    if (!username) { navigate('/'); return; }
    setMyUsername(username);
  }, [navigate]);

  // ── Socket setup ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!myUsername) return;

    const sock = io(api);
    setSocket(sock);

    sock.on('connect', () => sock.emit('setUsername', myUsername));

    // Server sends the full online list whenever anyone joins or leaves
    sock.on('onlineUsers', (users) => {
      // Filter out yourself — no point showing your own name as "online"
      setOnlineUsers(users.filter((u) => u !== myUsername));
    });

    sock.on('message', (msg) => {
      setConversations((prev) => ({
        ...prev,
        'group-chat': [...(prev['group-chat'] || []), msg],
      }));
    });

    sock.on('privateMessage', (msg) => {
      const key = msg.senderId === myUsername ? msg.receiverId : msg.senderId;
      setConversations((prev) => ({
        ...prev,
        [key]: [...(prev[key] || []), msg],
      }));
    });

    // Load history from fetchService on port 5002
    const fetchApi = process.env.REACT_APP_FETCH_API || 'http://localhost:5002';
    fetch(`${fetchApi}/api/chat/${myUsername}`)
      .then((r) => r.json())
      .then((data) => setConversations(data))
      .catch(() => {});

    return () => sock.disconnect();
  }, [api, myUsername]);

  // ── Scroll to bottom on new messages ─────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversations, activeChat]);

  // ── Open a DM with someone (called when clicking an online user) ──────────
  const openDM = (username) => {
    // Create the conversation slot if it doesn't exist yet
    setConversations((prev) => ({
      ...prev,
      [username]: prev[username] || [],
    }));
    setActiveChat(username);
  };

  // ── Send message ─────────────────────────────────────────────────────────
  const sendMessage = () => {
    const content = newMessage.trim();
    if (!content || !socket) return;

    if (activeChat === 'group-chat') {
      socket.emit('message', { senderId: myUsername, content });
    } else {
      socket.emit('privateMessage', { senderId: myUsername, username: activeChat, content });
      // Optimistic update — sender sees their message immediately without waiting for Kafka round-trip
      setConversations((prev) => ({
        ...prev,
        [activeChat]: [...(prev[activeChat] || []), { senderId: myUsername, content }],
      }));
    }
    setNewMessage('');
    inputRef.current?.focus();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const messages  = conversations[activeChat] || [];
  const dmThreads = Object.keys(conversations).filter((k) => k !== 'group-chat');

  return (
    <div className="panel-shell">
      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="sidebar-logo">
            <div className="sidebar-logo-icon">T</div>
            <span className="sidebar-logo-name">Threads</span>
          </div>
          {myUsername && (
            <div className="sidebar-me">
              <div className="sidebar-me-avatar" style={{ background: avatarColor(myUsername) }}>
                {getInitial(myUsername)}
              </div>
              <span className="sidebar-me-name">{myUsername}</span>
            </div>
          )}
        </div>

        <div className="sidebar-list">
          {/* ── Group chat ────────────────────────────────────────────── */}
          <div className="sidebar-section-label">Group</div>
          <div
            className={`sidebar-item ${activeChat === 'group-chat' ? 'active' : ''}`}
            onClick={() => setActiveChat('group-chat')}
          >
            <div className="sidebar-item-avatar group">#</div>
            <span className="sidebar-item-name">Everyone</span>
          </div>

          {/* ── Online users — click any to open a DM ─────────────────── */}
          <div className="sidebar-section-label">
            Online now
            {onlineUsers.length > 0 && (
              <span className="online-count">{onlineUsers.length}</span>
            )}
          </div>

          {onlineUsers.length === 0 ? (
            <div className="sidebar-empty">No one else online yet</div>
          ) : (
            onlineUsers.map((user) => (
              <div
                key={user}
                className={`sidebar-item ${activeChat === user ? 'active' : ''}`}
                onClick={() => openDM(user)}
              >
                <div className="sidebar-item-avatar" style={{ background: avatarColor(user) }}>
                  {getInitial(user)}
                </div>
                <span className="sidebar-item-name">{user}</span>
                <span className="online-dot" />
              </div>
            ))
          )}

          {/* ── Existing DM threads (people you've chatted with) ─────── */}
          {dmThreads.length > 0 && (
            <>
              <div className="sidebar-section-label">Messages</div>
              {dmThreads.map((key) => (
                <div
                  key={key}
                  className={`sidebar-item ${activeChat === key ? 'active' : ''}`}
                  onClick={() => setActiveChat(key)}
                >
                  <div className="sidebar-item-avatar" style={{ background: avatarColor(key) }}>
                    {getInitial(key)}
                  </div>
                  <span className="sidebar-item-name">{key}</span>
                  {/* Show green dot if they're still online */}
                  {onlineUsers.includes(key) && <span className="online-dot" />}
                </div>
              ))}
            </>
          )}
        </div>

        <div className="sidebar-footer">
          <button className="sidebar-action-btn" onClick={() => navigate('/rooms')}>
            <span className="sidebar-action-icon">#</span>
            Browse Rooms
          </button>
        </div>
      </aside>

      {/* ── Chat area ───────────────────────────────────────────────────── */}
      <div className="chat-main">
        <div className="chat-topbar">
          <div className="chat-topbar-avatar">
            {getInitial(activeChat)}
          </div>
          <div>
            <div className="chat-topbar-name">
              {activeChat === 'group-chat' ? 'Everyone' : activeChat}
            </div>
            <div className="chat-topbar-sub">
              {activeChat === 'group-chat'
                ? `${onlineUsers.length + 1} online`
                : onlineUsers.includes(activeChat) ? 'Online' : 'Offline'}
            </div>
          </div>
        </div>

        <div className="chat-messages">
          {messages.length === 0 ? (
            <div className="chat-empty">
              <span className="chat-empty-icon">💬</span>
              <span className="chat-empty-text">No messages yet. Say hello!</span>
            </div>
          ) : (
            messages.map((msg, i) => {
              const isMine = msg.senderId === myUsername;
              return (
                <div key={i} className={`msg-row ${isMine ? 'mine' : 'theirs'}`}>
                  {!isMine && (
                    <div className="msg-avatar" style={{ background: avatarColor(msg.senderId || '') }}>
                      {getInitial(msg.senderId || '?')}
                    </div>
                  )}
                  <div className="msg-bubble-wrap">
                    {!isMine && <span className="msg-sender">{msg.senderId}</span>}
                    <div className="msg-bubble">{msg.content}</div>
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="chat-input-bar">
          <input
            ref={inputRef}
            className="chat-input"
            placeholder={`Message ${activeChat === 'group-chat' ? 'Everyone' : activeChat}...`}
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <button
            className="chat-send-btn"
            onClick={sendMessage}
            disabled={!newMessage.trim()}
            aria-label="Send"
          >
            ➤
          </button>
        </div>
      </div>
    </div>
  );
};

export default MainPanel;
