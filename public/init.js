// Initialize all components when DOM is loaded

document.addEventListener('DOMContentLoaded', function() {
  // Initialize agent management if available
  if (typeof window.initAgentManagement === 'function') {
    window.initAgentManagement();
  }
  
  // Initialize tool management if available
  if (typeof window.initToolManagement === 'function') {
    window.initToolManagement();
  }
  
  // Initialize other components
  initializeApp();
});

function initializeApp() {
  // Set up basic event listeners
  setupMenuToggle();
  setupChatInterface();
}

function setupMenuToggle() {
  const menuBtn = document.getElementById('menuBtn');
  const drawer = document.getElementById('drawer');
  const backdrop = document.getElementById('drawerBackdrop');
  const closeBtn = document.getElementById('drawerClose');
  
  if (menuBtn && drawer && backdrop) {
    menuBtn.onclick = () => {
      drawer.classList.remove('hidden');
      backdrop.classList.remove('hidden');
    };
    
    const closeDrawer = () => {
      drawer.classList.add('hidden');
      backdrop.classList.add('hidden');
    };
    
    if (closeBtn) closeBtn.onclick = closeDrawer;
    backdrop.onclick = closeDrawer;
  }
}

function setupChatInterface() {
  const sendBtn = document.getElementById('chatSend');
  const input = document.getElementById('chatInput');
  const newChatBtn = document.getElementById('newChatBtn');
  
  if (sendBtn && input) {
    sendBtn.onclick = sendMessage;
    input.onkeydown = (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        sendMessage();
      }
    };
  }
  
  if (newChatBtn) {
    newChatBtn.onclick = clearChat;
  }
}

async function sendMessage() {
  const input = document.getElementById('chatInput');
  const messagesContainer = document.getElementById('chatMessages');
  
  if (!input || !messagesContainer) return;
  
  const message = input.value.trim();
  if (!message) return;
  
  // Add user message
  addMessage('user', message);
  input.value = '';
  
  try {
    // Check if message looks like an agent request
    if (isAgentRequest(message)) {
      await handleAgentRequest(message);
    } else {
      // Handle as regular chat
      await handleRegularChat(message);
    }
  } catch (error) {
    addMessage('assistant', `错误: ${error.message}`);
  }
}

function isAgentRequest(message) {
  const agentKeywords = ['agent', 'spawn', 'create', '创建', '生成', '启动'];
  const lowerMessage = message.toLowerCase();
  return agentKeywords.some(keyword => lowerMessage.includes(keyword));
}

async function handleAgentRequest(message) {
  // Simple agent request parsing
  let agentType = 'general';
  if (message.includes('research') || message.includes('研究')) {
    agentType = 'researcher';
  } else if (message.includes('code') || message.includes('编程') || message.includes('代码')) {
    agentType = 'coder';
  }
  
  const description = `User request: ${message}`;
  
  try {
    const result = await fetch('/api/agents/spawn', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agent_type: agentType,
        description,
        prompt: message,
        background: false
      })
    });
    
    const data = await result.json();
    
    if (data.status === 'completed') {
      addMessage('assistant', data.result);
    } else if (data.status === 'background') {
      addMessage('assistant', `Agent已在后台启动 (ID: ${data.agentId})`);
    } else {
      addMessage('assistant', `Agent状态: ${data.status}`);
    }
  } catch (error) {
    addMessage('assistant', `Agent请求失败: ${error.message}`);
  }
}

async function handleRegularChat(message) {
  // Handle regular chat through existing API
  addMessage('assistant', '正在处理您的请求...');
  
  try {
    const result = await fetch('/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: message,
        memory: { enabled: true },
        tools: { enabled: true }
      })
    });
    
    const data = await result.json();
    
    // Remove "processing" message
    const messages = document.getElementById('chatMessages');
    if (messages && messages.lastChild) {
      messages.removeChild(messages.lastChild);
    }
    
    addMessage('assistant', data.response || '处理完成');
  } catch (error) {
    addMessage('assistant', `处理失败: ${error.message}`);
  }
}

function addMessage(role, content) {
  const messagesContainer = document.getElementById('chatMessages');
  if (!messagesContainer) return;
  
  const msgDiv = document.createElement('div');
  msgDiv.className = `msg ${role}`;
  
  const msgCol = document.createElement('div');
  msgCol.className = 'msgCol';
  
  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  
  if (typeof content === 'string') {
    bubble.innerHTML = content.replace(/\n/g, '<br>');
  } else {
    bubble.textContent = String(content);
  }
  
  msgCol.appendChild(bubble);
  msgDiv.appendChild(msgCol);
  messagesContainer.appendChild(msgDiv);
  
  // Scroll to bottom
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function clearChat() {
  const messagesContainer = document.getElementById('chatMessages');
  if (messagesContainer) {
    messagesContainer.innerHTML = '';
  }
}