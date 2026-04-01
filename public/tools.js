// Tool Management Functions

let availableTools = [];
let toolExecutionHistory = [];

// Tool API functions
async function loadAvailableTools() {
  try {
    const data = await apiJson("GET", "/api/tools");
    availableTools = data.tools || [];
    renderToolsList();
  } catch (error) {
    console.error("Failed to load tools:", error);
    showToolError("Failed to load tools: " + error.message);
  }
}

// Render tools list
function renderToolsList() {
  const tbody = document.getElementById("toolsBody");
  if (!tbody) return;
  
  tbody.innerHTML = "";
  
  availableTools.forEach(tool => {
    const row = document.createElement("tr");
    
    const nameCell = document.createElement("td");
    nameCell.textContent = tool.name;
    
    const descCell = document.createElement("td");
    descCell.textContent = tool.searchHint || tool.description || "No description";
    
    const typeCell = document.createElement("td");
    const typeSpan = document.createElement("span");
    typeSpan.className = "pill";
    typeSpan.textContent = tool.isReadOnly ? "只读" : "读写";
    typeSpan.style.borderColor = tool.isReadOnly ? "#81c784" : "#ffb74d";
    typeCell.appendChild(typeSpan);
    
    const actionsCell = document.createElement("td");
    const executeBtn = document.createElement("button");
    executeBtn.className = "memBtn primary";
    executeBtn.textContent = "执行";
    executeBtn.onclick = () => showToolExecuteForm(tool);
    actionsCell.appendChild(executeBtn);
    
    row.appendChild(nameCell);
    row.appendChild(descCell);
    row.appendChild(typeCell);
    row.appendChild(actionsCell);
    
    tbody.appendChild(row);
  });
}

// Show tool execution form
function showToolExecuteForm(tool) {
  const modal = document.getElementById("toolExecuteModal");
  const form = document.getElementById("toolExecuteForm");
  const title = document.getElementById("toolExecuteTitle");
  const paramsContainer = document.getElementById("toolExecuteParams");
  
  if (!modal || !form || !title || !paramsContainer) return;
  
  title.textContent = `执行工具: ${tool.name}`;
  paramsContainer.innerHTML = "";
  
  // Generate form fields based on tool schema
  if (tool.parameters && tool.parameters.properties) {
    Object.entries(tool.parameters.properties).forEach(([key, schema]) => {
      const fieldDiv = document.createElement("div");
      fieldDiv.className = "formField";
      
      const label = document.createElement("label");
      label.textContent = key;
      label.setAttribute("for", `param_${key}`);
      
      const input = createInputForSchema(key, schema);
      input.id = `param_${key}`;
      input.name = key;
      
      if (tool.parameters.required && tool.parameters.required.includes(key)) {
        input.required = true;
        label.textContent += " *";
      }
      
      fieldDiv.appendChild(label);
      fieldDiv.appendChild(input);
      paramsContainer.appendChild(fieldDiv);
    });
  }
  
  // Store tool reference for execution
  form.dataset.toolName = tool.name;
  
  modal.classList.remove("vHidden");
}

// Create input element based on schema
function createInputForSchema(key, schema) {
  const type = schema.type || "string";
  
  switch (type) {
    case "boolean":
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      return checkbox;
      
    case "number":
    case "integer":
      const numberInput = document.createElement("input");
      numberInput.type = "number";
      if (schema.minimum !== undefined) numberInput.min = schema.minimum;
      if (schema.maximum !== undefined) numberInput.max = schema.maximum;
      return numberInput;
      
    case "array":
      const textarea = document.createElement("textarea");
      textarea.placeholder = "Enter JSON array, e.g., [\"item1\", \"item2\"]";
      textarea.rows = 3;
      return textarea;
      
    case "object":
      const objectTextarea = document.createElement("textarea");
      objectTextarea.placeholder = "Enter JSON object, e.g., {\"key\": \"value\"}";
      objectTextarea.rows = 4;
      return objectTextarea;
      
    default:
      const textInput = document.createElement("input");
      textInput.type = "text";
      if (schema.description) textInput.placeholder = schema.description;
      return textInput;
  }
}

// Execute tool
async function executeTool() {
  const form = document.getElementById("toolExecuteForm");
  const toolName = form.dataset.toolName;
  
  if (!toolName) return;
  
  const formData = new FormData(form);
  const params = {};
  
  // Collect form data
  for (const [key, value] of formData.entries()) {
    const input = form.querySelector(`[name="${key}"]`);
    
    if (input.type === "checkbox") {
      params[key] = input.checked;
    } else if (input.type === "number") {
      params[key] = parseFloat(value) || 0;
    } else if (input.tagName === "TEXTAREA" && (value.startsWith("[") || value.startsWith("{"))) {
      try {
        params[key] = JSON.parse(value);
      } catch (e) {
        showToolError(`Invalid JSON for ${key}: ${e.message}`);
        return;
      }
    } else {
      params[key] = value;
    }
  }
  
  try {
    showToolStatus("正在执行工具...");
    
    const result = await apiJson("POST", "/api/tools/execute", {
      tool_calls: [{
        id: `tool_${Date.now()}`,
        name: toolName,
        arguments: params
      }]
    });
    
    hideToolExecuteForm();
    showToolResult(result);
    addToExecutionHistory(toolName, params, result);
    
  } catch (error) {
    showToolError("工具执行失败: " + error.message);
  }
}

// Show tool result
function showToolResult(result) {
  const modal = document.getElementById("toolResultModal");
  const content = document.getElementById("toolResultContent");
  
  if (!modal || !content) return;
  
  let resultHtml = "";
  
  if (result.results && Array.isArray(result.results)) {
    result.results.forEach((toolResult, index) => {
      resultHtml += `<div class="toolResult">`;
      resultHtml += `<h4>工具: ${toolResult.name} (${toolResult.duration}ms)</h4>`;
      
      if (toolResult.error) {
        resultHtml += `<div class="error">错误: ${toolResult.error}</div>`;
      } else {
        const resultStr = typeof toolResult.result === 'string' 
          ? toolResult.result 
          : JSON.stringify(toolResult.result, null, 2);
        resultHtml += `<pre class="toolResultData">${resultStr}</pre>`;
      }
      
      resultHtml += `</div>`;
    });
  }
  
  if (result.formatted) {
    resultHtml += `<div class="formattedResult">`;
    resultHtml += `<h4>格式化结果:</h4>`;
    resultHtml += `<div class="markdown">${result.formatted}</div>`;
    resultHtml += `</div>`;
  }
  
  content.innerHTML = resultHtml;
  modal.classList.remove("vHidden");
}

// Add to execution history
function addToExecutionHistory(toolName, params, result) {
  const historyItem = {
    id: Date.now(),
    toolName,
    params,
    result,
    timestamp: new Date().toISOString(),
    success: !result.results?.some(r => r.error)
  };
  
  toolExecutionHistory.unshift(historyItem);
  
  // Keep only last 50 executions
  if (toolExecutionHistory.length > 50) {
    toolExecutionHistory = toolExecutionHistory.slice(0, 50);
  }
  
  renderExecutionHistory();
}

// Render execution history
function renderExecutionHistory() {
  const container = document.getElementById("toolHistoryList");
  if (!container) return;
  
  container.innerHTML = "";
  
  if (toolExecutionHistory.length === 0) {
    container.innerHTML = '<div class="memNode"><div class="memPath muted">暂无执行历史</div></div>';
    return;
  }
  
  toolExecutionHistory.forEach(item => {
    const row = document.createElement("div");
    row.className = "memNode";
    
    const left = document.createElement("div");
    left.className = "memPath";
    
    const time = new Date(item.timestamp).toLocaleString();
    const status = item.success ? "✅" : "❌";
    
    left.innerHTML = `
      <strong>${status} ${item.toolName}</strong><br>
      <small class="muted">${time}</small>
    `;
    
    const actions = document.createElement("div");
    actions.className = "memActions";
    
    const viewBtn = document.createElement("button");
    viewBtn.className = "memBtn secondary";
    viewBtn.textContent = "查看";
    viewBtn.onclick = () => showHistoryDetail(item);
    
    actions.appendChild(viewBtn);
    
    row.appendChild(left);
    row.appendChild(actions);
    
    container.appendChild(row);
  });
}

// Show history detail
function showHistoryDetail(item) {
  const modal = document.getElementById("toolHistoryModal");
  const content = document.getElementById("toolHistoryContent");
  
  if (!modal || !content) return;
  
  const paramsStr = JSON.stringify(item.params, null, 2);
  const resultStr = JSON.stringify(item.result, null, 2);
  
  content.innerHTML = `
    <h3>${item.toolName}</h3>
    <p><strong>执行时间:</strong> ${new Date(item.timestamp).toLocaleString()}</p>
    <p><strong>状态:</strong> ${item.success ? "成功" : "失败"}</p>
    
    <h4>参数:</h4>
    <pre class="codeBlock">${paramsStr}</pre>
    
    <h4>结果:</h4>
    <pre class="codeBlock">${resultStr}</pre>
  `;
  
  modal.classList.remove("vHidden");
}

// Hide tool execute form
function hideToolExecuteForm() {
  const modal = document.getElementById("toolExecuteModal");
  if (modal) {
    modal.classList.add("vHidden");
  }
}

// Hide tool result modal
function hideToolResultModal() {
  const modal = document.getElementById("toolResultModal");
  if (modal) {
    modal.classList.add("vHidden");
  }
}

// Hide history modal
function hideToolHistoryModal() {
  const modal = document.getElementById("toolHistoryModal");
  if (modal) {
    modal.classList.add("vHidden");
  }
}

// Show tool status message
function showToolStatus(message) {
  const statusEl = document.getElementById("toolStatus");
  if (statusEl) {
    statusEl.textContent = message;
    statusEl.className = "hint ok";
  }
}

// Show tool error message
function showToolError(message) {
  const statusEl = document.getElementById("toolStatus");
  if (statusEl) {
    statusEl.textContent = message;
    statusEl.className = "hint err";
  }
}

// Initialize tool management
function initToolManagement() {
  // Load tools on page load
  loadAvailableTools();
  
  // Set up event listeners
  const refreshBtn = document.getElementById("refreshTools");
  if (refreshBtn) {
    refreshBtn.onclick = loadAvailableTools;
  }
  
  const executeBtn = document.getElementById("executeToolBtn");
  if (executeBtn) {
    executeBtn.onclick = executeTool;
  }
  
  const cancelExecuteBtn = document.getElementById("cancelToolExecute");
  if (cancelExecuteBtn) {
    cancelExecuteBtn.onclick = hideToolExecuteForm;
  }
  
  const closeResultBtn = document.getElementById("closeToolResult");
  if (closeResultBtn) {
    closeResultBtn.onclick = hideToolResultModal;
  }
  
  const closeHistoryBtn = document.getElementById("closeToolHistory");
  if (closeHistoryBtn) {
    closeHistoryBtn.onclick = hideToolHistoryModal;
  }
}

// Export functions for global use
window.initToolManagement = initToolManagement;
window.loadAvailableTools = loadAvailableTools;
window.executeTool = executeTool;
window.showToolExecuteForm = showToolExecuteForm;
window.hideToolExecuteForm = hideToolExecuteForm;