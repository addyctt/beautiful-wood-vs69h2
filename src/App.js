import React, { useState, useEffect, useRef } from "react";
import io from "socket.io-client";
import "./App.css";

const socket = io("https://leeward-alive-gerbera.glitch.me/");

const configuration = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

export default function App() {
  // States
  const [onlineCount, setOnlineCount] = useState(0);
  const [keyword, setKeyword] = useState("");
  const [connected, setConnected] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [messages, setMessages] = useState([]);
  const [message, setMessage] = useState("");
  const [partnerId, setPartnerId] = useState(null);
  const [page, setPage] = useState("home"); // 'home', 'chat'
  const [mode, setMode] = useState(null); // 'text' or 'video'
  const [strangerTyping, setStrangerTyping] = useState(false);

  // WebRTC refs
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const peerConnection = useRef(null);
  const localStream = useRef(null);

  const messagesEndRef = useRef(null);

  // Effects: Socket listeners
  useEffect(() => {
    socket.on("online_count", (count) => setOnlineCount(count));

    socket.on("matched", async (partnerSocketId) => {
      setPartnerId(partnerSocketId);
      setConnected(true);
      setWaiting(false);
      addSystemMessage("Connected to a stranger.");

      if (mode === "video") {
        await startWebRTC(partnerSocketId);
      }
    });

    socket.on("receive_message", ({ from, text }) => {
      const sender = from === socket.id ? "You" : "Stranger";
      addMessage(sender, text);
    });

    socket.on("partner_disconnected", () => {
      addSystemMessage("Stranger disconnected.");
      cleanupConnection();
      setConnected(false);
      setPartnerId(null);
      if (mode === "video") stopLocalStream();
    });

    socket.on("stranger_typing", () => setStrangerTyping(true));
    socket.on("stranger_stop_typing", () => setStrangerTyping(false));

    socket.on("webrtc_signal", async ({ from, data }) => {
      if (!peerConnection.current) return;
      console.log("Signal received:", data.type || "ICE candidate");

      try {
        if (data.type === "offer") {
          await peerConnection.current.setRemoteDescription(
            new RTCSessionDescription(data)
          );
          const answer = await peerConnection.current.createAnswer();
          await peerConnection.current.setLocalDescription(answer);
          socket.emit("webrtc_signal", {
            to: from,
            data: peerConnection.current.localDescription,
          });
        } else if (data.type === "answer") {
          await peerConnection.current.setRemoteDescription(
            new RTCSessionDescription(data)
          );
        } else if (data.candidate) {
          await peerConnection.current.addIceCandidate(
            new RTCIceCandidate(data.candidate)
          );
        }
      } catch (e) {
        console.error("Error handling webrtc_signal", e);
      }
    });

    return () => {
      socket.off("online_count");
      socket.off("matched");
      socket.off("receive_message");
      socket.off("partner_disconnected");
      socket.off("stranger_typing");
      socket.off("stranger_stop_typing");
      socket.off("webrtc_signal");
    };
  }, [mode]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Helper functions
  function addMessage(sender, text) {
    setMessages((msgs) => [...msgs, { sender, text }]);
  }
  function addSystemMessage(text) {
    setMessages((msgs) => [...msgs, { sender: "System", text }]);
  }
  function scrollToBottom() {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }

  // Chat handlers
  function startChat(chosenMode) {
    setMessages([]);
    setWaiting(true);
    setConnected(false);
    setPartnerId(null);
    setMode(chosenMode);
    socket.emit("find_stranger", { keyword: keyword.trim() || "random" });
    setPage("chat");
  }

  function sendMessage() {
    if (!message.trim() || !partnerId || !connected) return;
    socket.emit("send_message", { to: partnerId, text: message });
    addMessage("You", message);
    setMessage("");
    socket.emit("stop_typing", { to: partnerId });
  }

  function handleTyping(e) {
    setMessage(e.target.value);
    if (partnerId && connected) socket.emit("typing", { to: partnerId });
  }

  function handleStopTyping() {
    if (partnerId && connected) socket.emit("stop_typing", { to: partnerId });
  }

  function handleKeyDown(e) {
    if (e.key === "Enter") sendMessage();
  }

  function endChat() {
    addSystemMessage("You ended the chat.");
    cleanupConnection();
    setConnected(false);
    setPartnerId(null);
    setWaiting(false);
    setMessages([]);
    setPage("home");
    stopLocalStream();
  }

  function nextChat() {
    cleanupConnection();
    setMessages([]);
    setWaiting(true);
    setConnected(false);
    setPartnerId(null);
    socket.emit("find_stranger", { keyword: keyword.trim() || "random" });
    stopLocalStream();
  }

  function goHome() {
    endChat();
  }

  // WebRTC setup
  async function startWebRTC(partnerSocketId) {
    peerConnection.current = new RTCPeerConnection(configuration);

    try {
      localStream.current = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      if (localVideoRef.current)
        localVideoRef.current.srcObject = localStream.current;

      localStream.current.getTracks().forEach((track) => {
        peerConnection.current.addTrack(track, localStream.current);
      });

      peerConnection.current.ontrack = (event) => {
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = event.streams[0];
        }
      };

      peerConnection.current.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit("webrtc_signal", {
            to: partnerSocketId,
            data: { candidate: event.candidate },
          });
        }
      };

      // Caller creates offer if own socket.id < partnerId (to avoid both sending offers)
      if (socket.id < partnerSocketId) {
        const offer = await peerConnection.current.createOffer();
        await peerConnection.current.setLocalDescription(offer);
        socket.emit("webrtc_signal", {
          to: partnerSocketId,
          data: peerConnection.current.localDescription,
        });
      }
    } catch (err) {
      console.error("Error accessing media devices.", err);
      addSystemMessage("Error accessing your camera/microphone.");
    }
  }

  function cleanupConnection() {
    if (peerConnection.current) {
      peerConnection.current.onicecandidate = null;
      peerConnection.current.ontrack = null;
      peerConnection.current.close();
      peerConnection.current = null;
    }
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }
  }

  function stopLocalStream() {
    if (localStream.current) {
      localStream.current.getTracks().forEach((track) => track.stop());
      localStream.current = null;
      if (localVideoRef.current) localVideoRef.current.srcObject = null;
    }
  }

  return (
    <div className="app-container">
      {page === "home" && (
        <>
          {/* Homepage header */}
          <div className="custom-header homepage-header">
            <div className="header-content">
              <span
                className="site-name"
                onClick={goHome}
                role="button"
                tabIndex={0}
              >
                OMEGLE
              </span>
              <div className="online-status">
                👥 {onlineCount} stranger{onlineCount !== 1 ? "s" : ""} online
              </div>
            </div>
          </div>

          <div className="home-page">
            <input
              type="text"
              placeholder="Enter keyword (optional)"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              className="keyword-input"
            />
            <div className="buttons">
              <button
                onClick={() => startChat("video")}
                className="btn primary-btn"
              >
                Video Chat
              </button>
              <button
                onClick={() => startChat("text")}
                className="btn primary-btn"
              >
                Text Chat
              </button>
            </div>
          </div>
        </>
      )}

      {page === "chat" && (
        <div className="chat-page">
          {/* Chat header */}
          <div className="custom-header">
            <div className="left-buttons">
              <button className="btn red-btn" onClick={endChat}>
                End
              </button>
              <button className="btn blue-btn" onClick={nextChat}>
                Next
              </button>
            </div>

            <div className="center-title" onClick={goHome}>
              OMEGLE
            </div>

            <div className="right-status">
              👥 {onlineCount} stranger{onlineCount !== 1 ? "s" : ""} online
            </div>
          </div>

          {/* Chat Area */}
          {mode === "text" && (
            <>
              {/* Text chat UI unchanged */}
              <div className="messages-window">
                {waiting && (
                  <div className="waiting-msg">
                    Waiting for a stranger to connect...
                  </div>
                )}
                {messages.map((m, i) => (
                  <div
                    key={i}
                    className={`message ${
                      m.sender === "You"
                        ? "message-you"
                        : m.sender === "Stranger"
                        ? "message-stranger"
                        : "message-system"
                    }`}
                  >
                    {m.sender !== "System" && (
                      <span className="sender-name">{m.sender}:</span>
                    )}
                    <span className="message-text">{m.text}</span>
                  </div>
                ))}
                {strangerTyping && (
                  <div className="typing-indicator">Stranger is typing...</div>
                )}
                <div ref={messagesEndRef} />
              </div>

              <div className="input-area">
                <input
                  type="text"
                  placeholder="Type your message..."
                  value={message}
                  onChange={handleTyping}
                  onBlur={handleStopTyping}
                  onKeyDown={handleKeyDown}
                  disabled={!connected}
                  className="chat-input"
                />
                <button
                  onClick={sendMessage}
                  disabled={!connected}
                  className="btn send-btn"
                >
                  Send
                </button>
              </div>
            </>
          )}

          {mode === "video" && (
            <div className="video-chat-container">
              {waiting && (
                <div className="waiting-msg">
                  Waiting for a stranger to connect...
                </div>
              )}

              <div className="videos-wrapper">
                <div className="video-box">
                  <div className="video-label">Stranger</div>
                  <video
                    ref={remoteVideoRef}
                    autoPlay
                    playsInline
                    className="video-element"
                    muted={false}
                  />
                </div>
                <div className="video-box">
                  <div className="video-label">You</div>
                  <video
                    ref={localVideoRef}
                    autoPlay
                    playsInline
                    muted
                    className="video-element"
                  />
                </div>
              </div>

              <div className="messages-window video-text-chat">
                {messages.map((m, i) => (
                  <div
                    key={i}
                    className={`message ${
                      m.sender === "You"
                        ? "message-you"
                        : m.sender === "Stranger"
                        ? "message-stranger"
                        : "message-system"
                    }`}
                  >
                    {m.sender !== "System" && (
                      <span className="sender-name">{m.sender}:</span>
                    )}
                    <span className="message-text">{m.text}</span>
                  </div>
                ))}
                {strangerTyping && (
                  <div className="typing-indicator">Stranger is typing...</div>
                )}
                <div ref={messagesEndRef} />
              </div>

              <div className="input-area video-input-area">
                <input
                  type="text"
                  placeholder="Type your message..."
                  value={message}
                  onChange={handleTyping}
                  onBlur={handleStopTyping}
                  onKeyDown={handleKeyDown}
                  disabled={!connected}
                  className="chat-input"
                />
                <button
                  onClick={sendMessage}
                  disabled={!connected}
                  className="btn send-btn"
                >
                  Send
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
