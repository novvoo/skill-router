// Configuration management
export class ConfigManager {
  constructor() {
    this.storageKey = 'skill-router:config';
    this.sessionKey = 'skill-router:session_id';
    this.config = this.loadConfig();
    this.sessionId = this.getSessionId();
  }

  loadConfig() {
    try {
      const stored = localStorage.getItem(this.storageKey);
      const config = stored ? JSON.parse(stored) : {};
      
      // Normalize config values
      return {
        apiKey: config.apiKey || '',
        baseUrl: config.baseUrl || '',
        model: config.model || '',
        embeddingModel: config.embeddingModel || '',
        hfEndpoint: config.hfEndpoint || '',
        ocrBackend: config.ocrBackend || '',
        ocrLanguage: config.ocrLanguage || '',
        ocrAutoDownload: Boolean(config.ocrAutoDownload),
        memoryEnabled: config.memoryEnabled !== false,
        defaultHeaders: Array.isArray(config.defaultHeaders) ? config.defaultHeaders : [],
        systemContent: config.systemContent || '',
        ...config
      };
    } catch (error) {
      console.warn('Failed to load config:', error);
      return this.getDefaultConfig();
    }
  }

  getDefaultConfig() {
    return {
      apiKey: '',
      baseUrl: '',
      model: '',
      embeddingModel: '',
      hfEndpoint: '',
      ocrBackend: '',
      ocrLanguage: '',
      ocrAutoDownload: false,
      memoryEnabled: true,
      defaultHeaders: [],
      systemContent: ''
    };
  }

  saveConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.config));
      this.notifyConfigChange();
    } catch (error) {
      console.error('Failed to save config:', error);
    }
  }

  getConfig() {
    return { ...this.config };
  }

  clearConfig() {
    this.config = this.getDefaultConfig();
    try {
      localStorage.removeItem(this.storageKey);
      this.notifyConfigChange();
    } catch (error) {
      console.error('Failed to clear config:', error);
    }
  }

  getSessionId() {
    try {
      let sessionId = localStorage.getItem(this.sessionKey);
      if (!sessionId) {
        sessionId = 'sess_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
        localStorage.setItem(this.sessionKey, sessionId);
      }
      return sessionId;
    } catch (error) {
      return 'sess_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    }
  }

  // Event system for config changes
  notifyConfigChange() {
    window.dispatchEvent(new CustomEvent('configChanged', { 
      detail: this.config 
    }));
  }

  onConfigChange(callback) {
    window.addEventListener('configChanged', (e) => {
      callback(e.detail);
    });
  }
}