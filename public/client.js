const socket = io();

// DOM Elements
const usernameContainer = document.getElementById('username-container');
const chatContainer = document.getElementById('chat-container');
const usernameInput = document.getElementById('username-input');
const joinBtn = document.getElementById('join-btn');
const errorMsg = document.getElementById('error-msg');
const messagesDiv = document.getElementById('messages');
const messageInput = document.getElementById('message-input');
const sendBtn = document.getElementById('send-btn');
const usersList = document.getElementById('users-list');
const typingIndicator = document.getElementById('typing-indicator');
const currentUserBadge = document.getElementById('current-user-badge');

let currentUsername = '';
let typingTimeout = null;

// ========== Helper Functions ==========
function formatTime(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function addMessage(message) {
  const messageDiv = document.createElement('div');
  messageDiv.classList.add('message');
  
  if (message.type === 'system') {
    messageDiv.classList.add('system');
    messageDiv.innerHTML = `
      <div class="message-text">${message.text}</div>
      <div class="message-time">${formatTime(message.timestamp)}</div>
    `;
  } else {
    messageDiv.classList.add('user');
    messageDiv.innerHTML = `
      <div class="message-header">${message.username}</div>
      <div class="message-text">${escapeHtml(message.text)}</div>
      <div class="message-time">${formatTime(message.timestamp)}</div>
    `;
  }
  
  messagesDiv.appendChild(messageDiv);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// Simple XSS protection
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function updateUserList(users) {
  usersList.innerHTML = '';
  users.forEach(user => {
    const li = document.createElement('li');
    li.textContent = user;
    if (user === currentUsername) {
      li.style.fontWeight = 'bold';
      li.style.backgroundColor = '#667eea';
    }
    usersList.appendChild(li);
  });
}

function showTyping(username) {
  typingIndicator.textContent = `${username} is typing...`;
  if (typingTimeout) clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => {
    typingIndicator.textContent = '';
  }, 1500);
}

function hideTyping() {
  typingIndicator.textContent = '';
}

// ========== Socket Event Listeners ==========
socket.on('previous messages', (messagesList) => {
  messagesDiv.innerHTML = '';
  messagesList.forEach(msg => addMessage(msg));
});

socket.on('chat message', (message) => {
  addMessage(message);
});

socket.on('user list', (users) => {
  updateUserList(users);
});

socket.on('user typing', (username) => {
  if (username !== currentUsername) {
    showTyping(username);
  }
});

socket.on('user stop typing', (username) => {
  if (username !== currentUsername) {
    hideTyping();
  }
});

// ========== Username Registration ==========
joinBtn.addEventListener('click', () => {
  const username = usernameInput.value.trim();
  if (!username) {
    errorMsg.textContent = 'Please enter a username';
    return;
  }
  
  socket.emit('set username', username, (response) => {
    if (response.success) {
      currentUsername = username;
      currentUserBadge.textContent = username;
      usernameContainer.classList.add('hidden');
      chatContainer.classList.remove('hidden');
      messageInput.disabled = false;
      sendBtn.disabled = false;
      messageInput.focus();
    } else {
      errorMsg.textContent = response.error;
    }
  });
});

usernameInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') joinBtn.click();
});

// ========== Sending Messages ==========
function sendMessage() {
  const text = messageInput.value.trim();
  if (!text) return;
  
  socket.emit('chat message', text);
  messageInput.value = '';
  messageInput.focus();
  
  // Stop typing indicator when message sent
  socket.emit('stop typing');
}

sendBtn.addEventListener('click', sendMessage);
messageInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') sendMessage();
});

// ========== Typing Indicator Logic ==========
messageInput.addEventListener('input', () => {
  if (messageInput.value.trim().length > 0) {
    socket.emit('typing');
  } else {
    socket.emit('stop typing');
  }
  
  // Clear existing timeout and set new one
  if (typingTimeout) clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => {
    socket.emit('stop typing');
  }, 1000);
});