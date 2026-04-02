// Chat module for conversational interface
import { BaseModule } from './BaseModule.js';
import { marked } from '/vendor/marked/lib/marked.esm.js';
import DOMPurify from '/vendor/dompurify/dist/purify.es.mjs';
import hljs from '/vendor/highlight.js/es/common.js';

export class ChatModule extends BaseModule {
  constructor(api, config) {
    super(api, config);
    this.messages = [];
    this.contextMessages = [];
    this.summary = '';
    this.isPreviewMode = false;
    
    this.setupMarkdown();
  }

  setupMarkdown() {
    const renderer = new marked.Renderer();
    renderer.link = (href, title, text) => {
      const safeHref = this.safeLinkHref(href);
      const safeTitle = title ? String(title) : '';
      const t = String(text || '');
      if (!safeHref) return t;
      const titleAttr = safeTitle ? ` title="${safeTitle.replace(/"/g, '&quot;')}"` : '';
      return `<a href="${safeHref}" target="_blank" rel="noopener noreferrer"${titleAttr}>${t}</a>`;
    };
    
    marked.setOptions({ gfm: true, breaks: true, renderer });
  }

  safeLinkHref(href) {
    if (typeof href !== 'string') return '';
    const raw = href.trim();
    if (!raw) return '';
    try {
      const u = new URL(raw, window.location.origin);
      if (u.protocol === 'http:' || u.protocol === 'https:' || u.protocol === 'mailto:') {
        return u.toString();
      }
    } catch {}
    return '';
  }

  async onActivate() {
    this.element = document.getElementById('chat-page');
    if (!this.element) return;

    this.setupEventListeners();
    this.renderMessages();
    
    // Initialize with welcome message if empty
    if (this.messages.length === 0) {
      this.addMessage('assistant', '你好，我是 skill-router。把你的任务发给我，必要时可以附带文档。');
    }
  }

  setupEventListeners() {
    // Send button
    this.addEventListener('#chat-send', 'click', () => this.sendMessage());
    
    // Input keydown
    this.addEventListener('#chat-input', 'keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });

    // Preview toggle
    this.addEventListener('#chat-preview-btn', 'click', () => this.togglePreview());
    
    // New chat
    this.addEventListener('#new-chat-btn', 'click', () => this.newChat());
  }

  async sendMessage() {
    const input = this.element.querySelector('#chat-input');
    const fileInput = this.element.querySelector('#chat-file-input');
    
    const message = input.value.trim();
    if (!message) return;

    const files = Array.from(fileInput?.files || []);
    
    // Add user message
    this.addMessage('user', message);
    input.value = '';
    if (fileInput) fileInput.value = '';
    
    // Add thinking message
    const thinkingIndex = this.messages.length;
    this.addMessage('assistant', '思考中…', '进行中：等待服务端响应');
    
    try {
      let result;
      const config = this.config.getConfig();
      
      if (files.length > 0) {
        // Handle file upload
        const formData = new FormData();
        formData.append('query', message);
        files.forEach(file => formData.append('file', file, file.name));
        formData.append('messages', JSON.stringify([
          ...this.contextMessages,
          { role: 'user', content: message, sessionId: this.config.sessionId }
        ]));
        if (this.summary) formData.append('summary', this.summary);
        formData.append('memory_enabled', config.memoryEnabled ? '1' : '0');
        if (config.ocrBackend) formData.append('ocr_backend', config.ocrBackend);
        if (config.ocrLanguage) formData.append('ocr_language', config.ocrLanguage);
        if (config.hfEndpoint) formData.append('hf_endpoint', config.hfEndpoint);
        formData.append('ocr_auto_download', config.ocrAutoDownload ? '1' : '0');
        if (config.systemContent) formData.append('systemContent', config.systemContent);

        result = await this.api.streamRequest('/run', formData, (eventType, data) => {
          this.handleStreamEvent(eventType, data, thinkingIndex);
        });
      } else {
        // Handle text-only message
        const requestBody = {
          query: message,
          messages: [
            ...this.contextMessages,
            { role: 'user', content: message, sessionId: this.config.sessionId }
          ],
          summary: this.summary,
          memory: { enabled: config.memoryEnabled },
          ...(config.ocrBackend && { ocr_backend: config.ocrBackend }),
          ...(config.ocrLanguage && { ocr_language: config.ocrLanguage }),
          ...(config.ocrAutoDownload !== undefined && { ocr_auto_download: config.ocrAutoDownload }),
          ...(config.hfEndpoint && { hf_endpoint: config.hfEndpoint }),
          ...(config.systemContent && { systemContent: config.systemContent })
        };

        result = await this.api.streamRequest('/run', requestBody, (eventType, data) => {
          this.handleStreamEvent(eventType, data, thinkingIndex);
        });
      }

      // Update final message
      const response = result?.response || '(empty)';
      this.updateMessage(thinkingIndex, response, this.buildMetadata(result || {}));
      
      // Update context
      if (result?.summary) this.summary = result.summary;
      if (result?.messages && Array.isArray(result.messages)) {
        this.contextMessages = result.messages.map(m => ({
          role: m.role === 'assistant' ? 'assistant' : 'user',
          content: String(m.content || m.text || ''),
          sessionId: this.config.sessionId
        }));
      } else {
        this.contextMessages = [
          ...this.contextMessages,
          { role: 'user', content: message, sessionId: this.config.sessionId },
          { role: 'assistant', content: response, sessionId: this.config.sessionId }
        ];
      }

    } catch (error) {
      this.updateMessage(thinkingIndex, `错误：${error.message}`, null, true);
    }
  }

  handleStreamEvent(eventType, data, messageIndex) {
    if (eventType === 'stage') {
      try {
        const stage = JSON.parse(data);
        const message = stage.message || '处理中';
        this.updateMessage(messageIndex, '思考中…', `进行中：${message}`);
      } catch (e) {
        console.warn('Failed to parse stage event:', e);
        console.warn('Raw stage data:', data);
      }
    } else if (eventType === 'result') {
      // Final result will be handled after stream ends
    } else if (eventType === 'error') {
      try {
        // Clean data to remove any leading/trailing whitespace
        const cleanedData = data.trim();
        const error = JSON.parse(cleanedData);
        throw new Error(error.error || '服务端错误');
      } catch (e) {
        console.warn('Failed to parse error event:', e);
        console.warn('Raw error data:', data);
        throw new Error(data || '服务端错误');
      }
    }
  }

  buildMetadata(result) {
    const parts = [];
    
    if (result.chosen?.skill) {
      parts.push(`route: ${result.chosen.skill}`);
    }
    
    if (result.used_skills && Array.isArray(result.used_skills)) {
      parts.push(`skills: ${result.used_skills.join(', ') || 'none'}`);
    }
    
    if (result.models?.chat) {
      parts.push(`model: ${result.models.chat}`);
    }
    
    if (result.models?.embedding) {
      const emb = result.models.embedding;
      if (emb.provider === 'kreuzberg') {
        parts.push(`emb: kreuzberg/${emb.preset || ''}${emb.dimensions ? ` (${emb.dimensions})` : ''}`);
      } else if (emb.provider === 'openai_compatible') {
        parts.push(`emb: openai/${emb.model || ''}`);
      } else if (emb.model) {
        parts.push(`emb: ${emb.model}`);
      }
    }
    
    if (result.memory) {
      const mem = result.memory;
      if (mem.retrieval_called) {
        parts.push(`mem: ${mem.used_in_prompt ? 'on' : 'off'}${typeof mem.retrieved_count === 'number' ? ` (${mem.retrieved_count})` : ''}`);
      }
    }
    
    return parts.join(' · ');
  }

  addMessage(role, content, metadata = null) {
    const message = {
      role,
      content,
      metadata,
      timestamp: new Date()
    };
    
    this.messages.push(message);
    this.renderMessages();
    return this.messages.length - 1;
  }

  updateMessage(index, content, metadata = null, isError = false) {
    if (index >= 0 && index < this.messages.length) {
      this.messages[index].content = content;
      if (metadata !== null) this.messages[index].metadata = metadata;
      if (isError) this.messages[index].isError = true;
      this.renderMessages();
    }
  }

  renderMessages() {
    const container = this.element?.querySelector('#chat-messages');
    if (!container) return;

    container.innerHTML = '';
    
    this.messages.forEach(message => {
      const messageEl = this.createElement('div', `message ${message.role}`);
      
      const bubble = this.createElement('div', 'message-bubble');
      bubble.innerHTML = this.renderMarkdown(message.content);
      this.highlightCode(bubble);
      
      if (message.isError) {
        bubble.classList.add('error');
      }
      
      messageEl.appendChild(bubble);
      
      if (message.metadata) {
        const meta = this.createElement('div', 'message-meta', message.metadata);
        messageEl.appendChild(meta);
      }
      
      container.appendChild(messageEl);
    });
    
    // Scroll to bottom
    container.scrollTop = container.scrollHeight;
  }

  renderMarkdown(text) {
    const raw = marked.parse(String(text || ''));
    return DOMPurify.sanitize(raw, { USE_PROFILES: { html: true } });
  }

  highlightCode(element) {
    const codeBlocks = element.querySelectorAll('pre code');
    codeBlocks.forEach(block => hljs.highlightElement(block));
  }

  togglePreview() {
    const input = this.element.querySelector('#chat-input');
    const preview = this.element.querySelector('#chat-preview');
    const button = this.element.querySelector('#chat-preview-btn');
    
    this.isPreviewMode = !this.isPreviewMode;
    
    if (this.isPreviewMode) {
      input.style.display = 'none';
      preview.style.display = 'block';
      preview.innerHTML = this.renderMarkdown(input.value);
      this.highlightCode(preview);
      button.textContent = '编辑';
    } else {
      input.style.display = 'block';
      preview.style.display = 'none';
      button.textContent = '预览';
    }
  }

  newChat() {
    this.messages = [];
    this.contextMessages = [];
    this.summary = '';
    
    // Clear inputs
    const input = this.element.querySelector('#chat-input');
    const fileInput = this.element.querySelector('#chat-file-input');
    if (input) input.value = '';
    if (fileInput) fileInput.value = '';
    
    // Reset preview mode
    if (this.isPreviewMode) {
      this.togglePreview();
    }
    
    // Add welcome message
    this.addMessage('assistant', '你好，我是 skill-router。把你的任务发给我，必要时可以附带文档。');
  }
}