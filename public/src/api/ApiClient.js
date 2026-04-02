// API client for backend communication
export class ApiClient {
  constructor(configManager) {
    this.config = configManager;
  }

  getHeaders(additionalHeaders = {}) {
    const config = this.config.getConfig();
    const headers = {
      'Content-Type': 'application/json',
      ...additionalHeaders
    };

    // Add custom headers from config
    if (config.defaultHeaders && Array.isArray(config.defaultHeaders)) {
      config.defaultHeaders.forEach(header => {
        if (header.key && header.value) {
          headers[header.key] = header.value;
        }
      });
    }

    // Add OpenAI headers
    if (config.apiKey) headers['X-OpenAI-API-Key'] = config.apiKey;
    if (config.baseUrl) headers['X-OpenAI-Base-URL'] = config.baseUrl;
    if (config.model) headers['X-OpenAI-Model'] = config.model;
    if (config.embeddingModel) headers['X-OpenAI-Embedding-Model'] = config.embeddingModel;
    if (config.hfEndpoint) headers['X-HF-Endpoint'] = config.hfEndpoint;

    return headers;
  }

  resolveUrl(path) {
    if (path.startsWith('http')) return path;
    if (!path.startsWith('/')) path = '/' + path;
    
    // Handle file:// protocol for local development
    if (window.location.protocol === 'file:') {
      const params = new URLSearchParams(window.location.search);
      const apiBase = params.get('api') || 'http://127.0.0.1:8080';
      return apiBase.replace(/\/+$/, '') + path;
    }
    
    return path;
  }

  async request(method, path, options = {}) {
    const url = this.resolveUrl(path);
    const headers = this.getHeaders(options.headers);
    
    const fetchOptions = {
      method,
      headers,
      ...options
    };

    if (options.body && typeof options.body === 'object' && !options.formData) {
      fetchOptions.body = JSON.stringify(options.body);
    } else if (options.body) {
      fetchOptions.body = options.body;
      if (options.formData) {
        delete headers['Content-Type']; // Let browser set it for FormData
      }
    }

    try {
      const response = await fetch(url, fetchOptions);
      
      if (!response.ok) {
        const errorText = await response.text();
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { error: errorText };
        }
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
      }

      const contentType = response.headers.get('content-type');
      if (contentType && contentType.toLowerCase().includes('application/json')) {
        return await response.json();
      } else {
        return await response.text();
      }
    } catch (error) {
      console.error(`API request failed: ${method} ${url}`, error);
      throw error;
    }
  }

  async get(path, options = {}) {
    return this.request('GET', path, options);
  }

  async post(path, body, options = {}) {
    return this.request('POST', path, { ...options, body });
  }

  async put(path, body, options = {}) {
    return this.request('PUT', path, { ...options, body });
  }

  async delete(path, options = {}) {
    return this.request('DELETE', path, options);
  }

  // Tool execution API
  async executeTools(toolCalls) {
    return this.post('/api/tools/execute', { tool_calls: toolCalls });
  }

  async getTools() {
    return this.get('/api/tools');
  }

  // Agent management API
  async getAgents() {
    return this.get('/api/agents');
  }

  async spawnAgent(agentType, prompt, options = {}) {
    return this.post('/api/agents/spawn', {
      agent_type: agentType,
      prompt,
      ...options
    });
  }

  async killAgent(agentId) {
    return this.post('/api/agents/kill', { agentId });
  }

  // Streaming request for SSE
  async streamRequest(path, body, onEvent) {
    const url = this.resolveUrl(path);
    const headers = this.getHeaders({
      'Accept': 'text/event-stream'
    });

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: body instanceof FormData ? body : JSON.stringify(body)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || `HTTP ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let finalResult = null;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        
        // Process complete SSE messages
        while (true) {
          const messageEnd = buffer.indexOf('\n\n');
          if (messageEnd === -1) break;

          const messageText = buffer.slice(0, messageEnd);
          buffer = buffer.slice(messageEnd + 2);

          const lines = messageText.split('\n');
          let eventType = 'message';
          let data = '';

          for (const line of lines) {
            if (line.startsWith('event:')) {
              eventType = line.slice(6).trim();
            } else if (line.startsWith('data:')) {
              data += line.slice(5).trim();
            }
          }

          if (data) {
            // Clean data to remove any leading/trailing whitespace and ensure it's valid JSON
            const cleanedData = data.trim();
            onEvent(eventType, cleanedData);
            
            // Capture the final result
            if (eventType === 'result') {
              try {
                finalResult = JSON.parse(cleanedData);
              } catch (e) {
                console.warn('Failed to parse result event:', e);
                console.warn('Raw data:', data);
              }
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
    
    return finalResult;
  }
}