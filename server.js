const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static files from 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// In-memory storage
const messages = [];          // Store messages (max 100)
const users = new Map();      // socketId -> { username }
const MAX_MESSAGES = 100;

// ========== DEBUG API ENDPOINT (inspect backend data) ==========
// Remove in production!
app.get('/debug/data', (req, res) => {
  res.json({
    messages: messages.slice(-30), // last 30 messages
    users: Array.from(users.values()).map(u => ({ id: u.id, username: u.username })),
    stats: {
      totalMessages: messages.length,
      totalUsers: users.size,
      maxMessagesStored: MAX_MESSAGES
    },
    timestamp: new Date().toISOString()
  });
});

io.on('connection', (socket) => {
  console.log(`[CONNECTION] New client connected: ${socket.id}`);

  // Handle username registration
  socket.on('set username', (username, callback) => {
    // Check if username already taken (case-insensitive)
    let usernameTaken = false;
    for (let [id, user] of users.entries()) {
      if (user.username.toLowerCase() === username.toLowerCase()) {
        usernameTaken = true;
        break;
      }
    }

    if (usernameTaken) {
      console.log(`[FAILED] Username "${username}" already taken (${socket.id})`);
      callback({ success: false, error: 'Username already taken' });
      return;
    }

    // Store user
    users.set(socket.id, { username, id: socket.id });
    socket.data.username = username;
    console.log(`[JOIN] ${username} (${socket.id})`);
    console.log(`  → Online users: ${Array.from(users.values()).map(u => u.username).join(', ')}`);

    // Send previous messages to this user only
    socket.emit('previous messages', messages);

    // Broadcast system message: user joined
    const joinMessage = {
      type: 'system',
      text: `${username} joined the chat`,
      timestamp: new Date().toISOString()
    };
    messages.push(joinMessage);
    if (messages.length > MAX_MESSAGES) messages.shift();
    io.emit('chat message', joinMessage);
    console.log(`[SYSTEM] ${joinMessage.text}`);

    // Send updated user list to all clients
    sendUserList();

    callback({ success: true });
  });

  // Handle new chat message
  socket.on('chat message', (msgText) => {
    const username = socket.data.username;
    if (!username) return;

    const message = {
      type: 'user',
      username: username,
      text: msgText,
      timestamp: new Date().toISOString()
    };

    messages.push(message);
    if (messages.length > MAX_MESSAGES) messages.shift();

    console.log(`[MESSAGE] ${username}: "${msgText}" (Total messages: ${messages.length})`);

    // Broadcast to ALL connected clients (including sender)
    io.emit('chat message', message);
  });

  // Handle typing indicator
  socket.on('typing', () => {
    const username = socket.data.username;
    if (username) {
      console.log(`[TYPING] ${username} is typing...`);
      socket.broadcast.emit('user typing', username);
    }
  });

  socket.on('stop typing', () => {
    const username = socket.data.username;
    if (username) {
      console.log(`[STOP TYPING] ${username}`);
      socket.broadcast.emit('user stop typing', username);
    }
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    const user = users.get(socket.id);
    if (user) {
      users.delete(socket.id);
      console.log(`[DISCONNECT] ${user.username} (${socket.id}) left`);
      
      const leaveMessage = {
        type: 'system',
        text: `${user.username} left the chat`,
        timestamp: new Date().toISOString()
      };
      messages.push(leaveMessage);
      if (messages.length > MAX_MESSAGES) messages.shift();
      io.emit('chat message', leaveMessage);
      console.log(`[SYSTEM] ${leaveMessage.text}`);
      
      sendUserList();
      console.log(`  → Remaining users: ${Array.from(users.values()).map(u => u.username).join(', ')}`);
    } else {
      console.log(`[DISCONNECT] Unknown client ${socket.id}`);
    }
  });

  // Helper: broadcast current online users list
  function sendUserList() {
    const userList = Array.from(users.values()).map(u => u.username);
    io.emit('user list', userList);
    console.log(`[USER LIST] ${userList.join(', ')}`);
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n🚀 Server running on http://localhost:${PORT}`);
  console.log(`📊 Debug endpoint: http://localhost:${PORT}/debug/data`);
  console.log(`💡 Open multiple tabs/windows (incognito) to test real-time chat\n`);
});