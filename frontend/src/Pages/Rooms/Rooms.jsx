import React, { useContext, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChatContext } from '../../Context/ChatContext';
import io from 'socket.io-client';
import './Rooms.css';
import '../MainPanel/MainPanel.css';

const getInitial = (name) => (name ? name.charAt(0).toUpperCase() : '?');
const AVATAR_COLORS = ['#6c63ff','#e879f9','#38bdf8','#34d399','#fb923c','#f472b6'];
const avatarColor   = (name) => AVATAR_COLORS[(name?.charCodeAt(0) || 0) % AVATAR_COLORS.length];

// Default rooms shown in sidebar so users have something to click on immediately
const DEFAULT_ROOMS = ['general', 'random', 'dev-talk'];

const Rooms = () => {
  const { api }       = useContext(ChatContext);
  const navigate      = useNavigate();
  const { roomName: roomFromUrl } = useParams(); // e.g. /rooms/gaming → "gaming"

  const myUsername = localStorage.getItem('username');

  // ── Auth guard with redirect-back flow ────────────────────────────────────
  // If someone opens a shared link like /rooms/gaming without being logged in,
  // we save the full path to sessionStorage so Login can send them back here
  // after they pick a username.
  useEffect(() => {
    if (!myUsername) {
      sessionStorage.setItem('intended_path', window.location.pathname);
      navigate('/');
    }
  }, [myUsername, navigate]);

  const [socket,       setSocket]       = useState(null);
  const [rooms,        setRooms]        = useState([]);
  const [messages,     setMessages]     = useState({});
  const [activeRoom,   setActiveRoom]   = useState(null);
  const [messageInput, setMessageInput] = useState('');
  const [showJoinForm, setShowJoinForm] = useState(false);
  const [roomToJoin,   setRoomToJoin]   = useState('');
  const [copied,       setCopied]       = useState(false);

  const messagesEndRef = useRef(null);
  const inputRef       = useRef(null);

  // ── Socket setup ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!myUsername) return;
    const sock = io(api);
    setSocket(sock);
    sock.on('connect', () => sock.emit('setUsername', myUsername));
    return () => sock.close();
  }, [api, myUsername]);

  // ── Socket event listeners ────────────────────────────────────────────────
  useEffect(() => {
    if (!socket) return;

    socket.on('roommessage', (msg) => {
      setMessages((prev) => ({
        ...prev,
        [msg.room]: [...(prev[msg.room] || []), msg],
      }));
    });

    socket.on('fetchedMessages', (fetched) => {
      if (!fetched.length) return;
      const room = fetched[0]?.room;
      if (!room) return;
      setMessages((prev) => ({ ...prev, [room]: fetched }));
    });

    return () => {
      socket.off('roommessage');
      socket.off('fetchedMessages');
    };
  }, [socket]);

  // ── Auto-join room from URL ───────────────────────────────────────────────
  // When someone opens a shared link like /rooms/gaming, roomFromUrl = "gaming".
  // We wait until the socket is ready then auto-join that room — the user lands
  // directly in the conversation without any manual steps.
  useEffect(() => {
    if (socket && roomFromUrl) {
      joinRoom(roomFromUrl);
    }
  }, [socket, roomFromUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Fetch history when active room changes ────────────────────────────────
  useEffect(() => {
    if (socket && activeRoom) {
      socket.emit('fetchMessages', activeRoom);
    }
  }, [socket, activeRoom]);

  // ── Scroll to bottom ──────────────────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, activeRoom]);

  // ── Join room ─────────────────────────────────────────────────────────────
  const joinRoom = (name) => {
    const trimmed = name?.trim();
    if (!trimmed || !socket || rooms.includes(trimmed)) {
      // Room already joined — just switch to it
      if (rooms.includes(trimmed)) setActiveRoom(trimmed);
      return;
    }
    socket.emit('joinRoom', { room: trimmed, sender: myUsername });
    setRooms((prev) => [...prev, trimmed]);
    setActiveRoom(trimmed);
    // Update URL so the address bar shows the room name (shareable)
    navigate(`/rooms/${trimmed}`, { replace: true });
  };

  const handleJoinSubmit = (e) => {
    e.preventDefault();
    joinRoom(roomToJoin);
    setRoomToJoin('');
    setShowJoinForm(false);
  };

  // ── Leave room ────────────────────────────────────────────────────────────
  const leaveRoom = (name) => {
    if (!socket) return;
    socket.emit('leaveRoom', name);
    setRooms((prev) => prev.filter((r) => r !== name));
    setMessages((prev) => { const n = { ...prev }; delete n[name]; return n; });
    if (activeRoom === name) {
      setActiveRoom(null);
      navigate('/rooms', { replace: true });
    }
  };

  // ── Send message ─────────────────────────────────────────────────────────
  const sendMessage = () => {
    const content = messageInput.trim();
    if (!content || !socket || !activeRoom) return;
    socket.emit('roommessage', { room: activeRoom, sender: myUsername, content });
    setMessageInput('');
    inputRef.current?.focus();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  // ── Copy room link to clipboard ───────────────────────────────────────────
  // Copies the current URL e.g. http://localhost:3000/rooms/gaming
  // Anyone who opens this link lands directly in the room.
  const copyRoomLink = () => {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const roomMessages = activeRoom ? (messages[activeRoom] || []) : [];

  // Combine default rooms + joined rooms, deduplicated
  const allSidebarRooms = [...new Set([...DEFAULT_ROOMS, ...rooms])];

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

        <div className="sidebar-section-label">Rooms</div>

        <div className="sidebar-list">
          {allSidebarRooms.map((room) => {
            const isJoined = rooms.includes(room);
            return (
              <div
                key={room}
                className={`sidebar-item ${activeRoom === room ? 'active' : ''}`}
                onClick={() => isJoined ? setActiveRoom(room) : joinRoom(room)}
              >
                <div className="sidebar-item-avatar group">#</div>
                <span className="sidebar-item-name">{room}</span>
                {!isJoined && <span className="join-hint">Join</span>}
                {isJoined && activeRoom === room && (
                  <button
                    className="leave-btn"
                    onClick={(e) => { e.stopPropagation(); leaveRoom(room); }}
                  >
                    Leave
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <div className="sidebar-footer">
          {showJoinForm && (
            <form className="join-room-form" onSubmit={handleJoinSubmit}>
              <input
                className="join-room-input"
                placeholder="Room name..."
                value={roomToJoin}
                onChange={(e) => setRoomToJoin(e.target.value)}
                autoFocus
              />
              <button type="submit" className="join-room-submit">Join</button>
            </form>
          )}
          <button className="sidebar-action-btn" onClick={() => setShowJoinForm((v) => !v)}>
            <span className="sidebar-action-icon">#</span>
            Join custom room
          </button>
          <button className="sidebar-action-btn" onClick={() => navigate('/mainpanel')}>
            <span className="sidebar-action-icon">←</span>
            Back to DMs
          </button>
        </div>
      </aside>

      {/* ── Chat area ───────────────────────────────────────────────────── */}
      <div className="chat-main">
        {!activeRoom ? (
          <div className="chat-placeholder">
            <span className="chat-placeholder-icon">#</span>
            <span className="chat-placeholder-title">Pick a room to join</span>
            <span className="chat-placeholder-sub">
              Click a room on the left, or share a link to invite friends
            </span>
          </div>
        ) : (
          <>
            <div className="chat-topbar">
              <div className="chat-topbar-avatar">#</div>
              <span className="chat-topbar-name">{activeRoom}</span>
              {/* Share button — copies the full URL to clipboard */}
              <button
                className={`share-btn ${copied ? 'copied' : ''}`}
                onClick={copyRoomLink}
              >
                {copied ? '✓ Copied!' : '🔗 Share link'}
              </button>
            </div>

            <div className="chat-messages">
              {roomMessages.length === 0 ? (
                <div className="chat-empty">
                  <span className="chat-empty-icon">#</span>
                  <span className="chat-empty-text">
                    No messages yet. Share the link and invite a friend!
                  </span>
                </div>
              ) : (
                roomMessages.map((msg, i) => {
                  const isMine = msg.sender === myUsername;
                  return (
                    <div key={i} className={`msg-row ${isMine ? 'mine' : 'theirs'}`}>
                      {!isMine && (
                        <div className="msg-avatar" style={{ background: avatarColor(msg.sender || '') }}>
                          {getInitial(msg.sender || '?')}
                        </div>
                      )}
                      <div className="msg-bubble-wrap">
                        {!isMine && <span className="msg-sender">{msg.sender}</span>}
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
                placeholder={`Message #${activeRoom}...`}
                value={messageInput}
                onChange={(e) => setMessageInput(e.target.value)}
                onKeyDown={handleKeyDown}
              />
              <button
                className="chat-send-btn"
                onClick={sendMessage}
                disabled={!messageInput.trim()}
                aria-label="Send"
              >
                ➤
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default Rooms;
