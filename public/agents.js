// Agent Management Functions

let availableAgents = [];
let runningAgents = [];
let agentPollingInterval = null;

// Agent API functions
async function apiJson(method, path, body = null, cfg = {}) {
  const headers = { "Content-Type": "application/json" };
  
  // Add custom headers from config
  if (cfg.customHeaders && Array.isArray(cfg.customHeaders)) {
    cfg.customHeaders.forEach(h => {
      if (h.key && h.value) {
        headers[h.key] = h.value;
      }
    });
  }
  
  const options = { method, headers };
  if (body) {
    options.body = JSON.stringify(body);
  }
  
  const response = await fetch(path, options);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  
  return response.json();
}

// Load available agents
async function loadAvailableAgents() {
  try {
    const data = await apiJson("GET", "/api/agents");
    availableAgents = data.available || [];
    runningAgents = data.running || [];
    renderAgentsList();
    renderRunningAgents();
  } catch (error) {
    console.error("Failed to load agents:", error);
    showAgentError("Failed to load agents: " + error.message);
  }
}

// Render agents list
function renderAgentsList() {
  const tbody = document.getElementById("agentsBody");
  if (!tbody) return;
  
  tbody.innerHTML = "";
  
  availableAgents.forEach(agent => {
    const row = document.createElement("tr");
    
    const typeCell = document.createElement("td");
    typeCell.textContent = agent.agentType;
    
    const nameCell = document.createElement("td");
    nameCell.textContent = agent.name;
    
    const descCell = document.createElement("td");
    descCell.textContent = agent.description;
    
    const statusCell = document.createElement("td");
    const statusSpan = document.createElement("span");
    statusSpan.className = "pill";
    statusSpan.textContent = agent.background ? "后台" : "同步";
    if (agent.color) {
      statusSpan.style.borderColor = agent.color;
    }
    statusCell.appendChild(statusSpan);
    
    row.appendChild(typeCell);
    row.appendChild(nameCell);
    row.appendChild(descCell);
    row.appendChild(statusCell);
    
    tbody.appendChild(row);
  });
}

// Render running agents
function renderRunningAgents() {
  const container = document.getElementById("runningAgentsList");
  if (!container) return;
  
  container.innerHTML = "";
  
  if (runningAgents.length === 0) {
    container.innerHTML = '<div class="memNode"><div class="memPath muted">暂无运行中的Agent</div></div>';
    return;
  }
  
  runningAgents.forEach(agent => {
    const row = document.createElement("div");
    row.className = "memNode";
    
    const left = document.createElement("div");
    left.className = "memPath";
    left.innerHTML = `
      <strong>${agent.name}</strong><br>
      <small class="muted">${agent.description}</small>
    `;
    
    const actions = document.createElement("div");
    actions.className = "memActions";
    
    const statusPill = document.createElement("span");
    statusPill.className = "pill";
    statusPill.textContent = "运行中";
    statusPill.style.color = "#81c784";
    
    const killBtn = document.createElement("button");
    killBtn.className = "memBtn secondary";
    killBtn.textContent = "停止";
    killBtn.onclick = () => killAgent(agent.id);
    
    actions.appendChild(statusPill);
    actions.appendChild(killBtn);
    
    row.appendChild(left);
    row.appendChild(actions);
    
    container.appendChild(row);
  });
}

// Show/hide agent form
function toggleAgentForm(show) {
  const form = document.getElementById("agentForm");
  const btn = document.getElementById("newAgentBtn");
  
  if (!form || !btn) return;
  
  if (show) {
    form.classList.remove("vHidden");
    btn.textContent = "取消";
  } else {
    form.classList.add("vHidden");
    btn.textContent = "创建Agent";
    clearAgentForm();
  }
}

// Clear agent form
function clearAgentForm() {
  const form = document.getElementById("agentForm");
  if (!form) return;
  
  form.querySelector("#agentType").value = "general";
  form.querySelector("#agentDescription").value = "";
  form.querySelector("#agentPrompt").value = "";
  form.querySelector("#agentBackground").checked = false;
}

// Spawn new agent
async function spawnAgent() {
  const agentType = document.getElementById("agentType").value;
  const description = document.getElementById("agentDescription").value.trim();
  const prompt = document.getElementById("agentPrompt").value.trim();
  const background = document.getElementById("agentBackground").checked;
  
  if (!description || !prompt) {
    showAgentError("请填写任务描述和详细任务");
    return;
  }
  
  try {
    showAgentStatus("正在启动Agent...");
    
    const result = await apiJson("POST", "/api/agents/spawn", {
      agent_type: agentType,
      description,
      prompt,
      background
    });
    
    if (result.status === "background") {
      showAgentStatus(`Agent已在后台启动 (ID: ${result.agentId})`);
      startAgentPolling();
    } else if (result.status === "completed") {
      showAgentStatus("Agent执行完成");
      showAgentResult(result.result);
    }
    
    toggleAgentForm(false);
    await loadAvailableAgents();
    
  } catch (error) {
    showAgentError("启动Agent失败: " + error.message);
  }
}

// Kill agent
async function killAgent(agentId) {
  if (!confirm("确定要停止这个Agent吗？")) return;
  
  try {
    await apiJson("POST", "/api/agents/kill", { agentId });
    showAgentStatus(`Agent ${agentId} 已停止`);
    await loadAvailableAgents();
  } catch (error) {
    showAgentError("停止Agent失败: " + error.message);
  }
}

// Show agent status message
function showAgentStatus(message) {
  const statusEl = document.getElementById("agentStatus");
  if (statusEl) {
    statusEl.textContent = message;
    statusEl.className = "hint ok";
  }
}

// Show agent error message
function showAgentError(message) {
  const statusEl = document.getElementById("agentStatus");
  if (statusEl) {
    statusEl.textContent = message;
    statusEl.className = "hint err";
  }
}

// Show agent result
function showAgentResult(result) {
  // Add result to chat messages
  addMessage("assistant", result);
}

// Start polling for running agents
function startAgentPolling() {
  if (agentPollingInterval) return;
  
  agentPollingInterval = setInterval(async () => {
    try {
      await loadAvailableAgents();
      
      // Stop polling if no running agents
      if (runningAgents.length === 0) {
        clearInterval(agentPollingInterval);
        agentPollingInterval = null;
      }
    } catch (error) {
      console.error("Agent polling error:", error);
    }
  }, 3000);
}

// Add message to chat (placeholder function)
function addMessage(role, content) {
  const messagesContainer = document.getElementById("chatMessages");
  if (!messagesContainer) return;
  
  const msgDiv = document.createElement("div");
  msgDiv.className = `msg ${role}`;
  
  const msgCol = document.createElement("div");
  msgCol.className = "msgCol";
  
  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.innerHTML = content;
  
  msgCol.appendChild(bubble);
  msgDiv.appendChild(msgCol);
  messagesContainer.appendChild(msgDiv);
  
  // Scroll to bottom
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Initialize agent management
function initAgentManagement() {
  // Load agents on page load
  loadAvailableAgents();
  
  // Set up event listeners
  const refreshBtn = document.getElementById("refreshAgents");
  if (refreshBtn) {
    refreshBtn.onclick = loadAvailableAgents;
  }
  
  const newAgentBtn = document.getElementById("newAgentBtn");
  if (newAgentBtn) {
    newAgentBtn.onclick = () => {
      const form = document.getElementById("agentForm");
      const isVisible = form && !form.classList.contains("vHidden");
      toggleAgentForm(!isVisible);
    };
  }
  
  const spawnBtn = document.getElementById("spawnAgent");
  if (spawnBtn) {
    spawnBtn.onclick = spawnAgent;
  }
  
  const cancelBtn = document.getElementById("cancelAgent");
  if (cancelBtn) {
    cancelBtn.onclick = () => toggleAgentForm(false);
  }
}

// Export functions for global use
window.initAgentManagement = initAgentManagement;
window.loadAvailableAgents = loadAvailableAgents;
window.spawnAgent = spawnAgent;
window.killAgent = killAgent;