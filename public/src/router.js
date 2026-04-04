// Enhanced production-grade client-side router
export class Router {
  constructor(options = {}) {
    this.routes = new Map();
    this.currentRoute = null;
    this.guards = [];
    this.history = [];
    this.maxHistoryLength = options.maxHistoryLength || 50;
    this.notFoundHandler = options.notFoundHandler || null;
    this.beforeEachHooks = [];
    this.afterEachHooks = [];
    this.isNavigating = false;
    this.routeParams = {};
    this.queryParams = {};
  }

  // Add a route with optional metadata
  addRoute(path, handler, meta = {}) {
    const route = {
      path,
      handler,
      meta,
      paramNames: this.extractParamNames(path),
      regex: this.pathToRegex(path)
    };
    this.routes.set(path, route);
  }

  // Extract parameter names from path (e.g., /user/:id => ['id'])
  extractParamNames(path) {
    const paramNames = [];
    const paramRegex = /:([a-zA-Z_][a-zA-Z0-9_]*)/g;
    let match;
    while ((match = paramRegex.exec(path)) !== null) {
      paramNames.push(match[1]);
    }
    return paramNames;
  }

  // Convert path pattern to regex
  pathToRegex(path) {
    let regexPath = path
      .replace(/\./g, '\\.')
      .replace(/\*/g, '.*')
      .replace(/:([a-zA-Z_][a-zA-Z0-9_]*)/g, '([^/]+)');
    return new RegExp(`^${regexPath}$`);
  }

  // Parse query string from URL
  parseQueryString(search) {
    const params = {};
    const searchParams = new URLSearchParams(search);
    for (const [key, value] of searchParams) {
      params[key] = value;
    }
    return params;
  }

  // Add before navigation guard
  beforeEach(hook) {
    this.beforeEachHooks.push(hook);
  }

  // Add after navigation hook
  afterEach(hook) {
    this.afterEachHooks.push(hook);
  }

  // Set 404 handler
  setNotFoundHandler(handler) {
    this.notFoundHandler = handler;
  }

  async init() {
    window.addEventListener('popstate', async (e) => {
      await this.handleRoute(window.location.pathname, window.location.search, false);
    });

    const initialPath = window.location.pathname;
    const initialSearch = window.location.search;
    await this.handleRoute(initialPath, initialSearch, false);
  }

  async navigate(path, options = {}) {
    if (this.isNavigating) {
      console.warn('Router: Navigation already in progress');
      return;
    }

    const { replace = false, state = {} } = options;
    const fullPath = path + (options.query ? '?' + new URLSearchParams(options.query).toString() : '');
    
    if (replace) {
      window.history.replaceState(state, '', fullPath);
    } else {
      window.history.pushState(state, '', fullPath);
    }

    await this.handleRoute(path, options.query ? '?' + new URLSearchParams(options.query).toString() : '', true);
  }

  async handleRoute(path, search = '', pushToHistory = true) {
    this.isNavigating = true;

    try {
      this.queryParams = this.parseQueryString(search);
      
      let matchedRoute = null;
      let params = {};

      for (const [, route] of this.routes) {
        const match = path.match(route.regex);
        if (match) {
          matchedRoute = route;
          route.paramNames.forEach((name, index) => {
            params[name] = match[index + 1];
          });
          break;
        }
      }

      if (!matchedRoute) {
        if (this.notFoundHandler) {
          await this.notFoundHandler(path);
          return;
        }
        const rootRoute = this.routes.get('/');
        if (rootRoute) {
          matchedRoute = rootRoute;
        } else {
          console.error('Router: No route found and no 404 handler');
          return;
        }
      }

      this.routeParams = params;
      const to = { path, params, query: this.queryParams, meta: matchedRoute.meta };
      const from = this.currentRoute ? { 
        path: this.currentRoute.path, 
        params: this.currentRoute.params,
        query: this.currentRoute.query,
        meta: this.currentRoute.meta 
      } : null;

      for (const hook of this.beforeEachHooks) {
        const result = await hook(to, from);
        if (result === false) {
          this.isNavigating = false;
          return;
        }
        if (typeof result === 'string') {
          this.isNavigating = false;
          await this.navigate(result);
          return;
        }
      }

      if (pushToHistory && this.currentRoute) {
        this.history.push({
          path: this.currentRoute.path,
          params: this.currentRoute.params,
          query: this.currentRoute.query,
          timestamp: Date.now()
        });
        if (this.history.length > this.maxHistoryLength) {
          this.history.shift();
        }
      }

      this.currentRoute = to;
      await matchedRoute.handler(params, this.queryParams);

      for (const hook of this.afterEachHooks) {
        await hook(to, from);
      }

    } catch (error) {
      console.error('Router: Navigation error:', error);
      this.emit('error', { error, path });
    } finally {
      this.isNavigating = false;
    }
  }

  goBack() {
    if (this.history.length > 0) {
      window.history.back();
    }
  }

  getParams() {
    return { ...this.routeParams };
  }

  getQuery() {
    return { ...this.queryParams };
  }

  getCurrentRoute() {
    return this.currentRoute ? { ...this.currentRoute } : null;
  }

  getHistory() {
    return [...this.history];
  }

  // Event emitter
  listeners = new Map();

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
  }

  off(event, callback) {
    if (this.listeners.has(event)) {
      const callbacks = this.listeners.get(event);
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  emit(event, data) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).forEach(callback => callback(data));
    }
  }

  destroy() {
    this.listeners.clear();
    this.beforeEachHooks = [];
    this.afterEachHooks = [];
    this.routes.clear();
    this.history = [];
  }
}
