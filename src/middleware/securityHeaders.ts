import http from "node:http";

export interface SecurityHeadersOptions {
  csp?: boolean | string;
  hsts?: boolean | { maxAge?: number; includeSubDomains?: boolean; preload?: boolean };
  xssProtection?: boolean;
  noSniff?: boolean;
  frameOptions?: boolean | "DENY" | "SAMEORIGIN";
  referrerPolicy?: boolean | string;
  poweredBy?: boolean | string;
  permissionsPolicy?: boolean | string;
  crossOriginOpenerPolicy?: boolean | string;
  crossOriginEmbedderPolicy?: boolean | string;
  expectCT?: boolean | { maxAge?: number; enforce?: boolean; reportUri?: string };
}

export const DEFAULT_OPTIONS: SecurityHeadersOptions = {
  csp: true,
  hsts: true,
  xssProtection: true,
  noSniff: true,
  frameOptions: "DENY",
  referrerPolicy: "strict-origin-when-cross-origin",
  poweredBy: false,
  permissionsPolicy: true,
  crossOriginOpenerPolicy: true,
  crossOriginEmbedderPolicy: true,
  expectCT: true,
};

const DEFAULT_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "font-src 'self' data:",
  "connect-src 'self' ws: wss:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const DEFAULT_PERMISSIONS_POLICY = [
  "accelerometer=()",
  "autoplay=()",
  "camera=()",
  "encrypted-media=()",
  "fullscreen=()",
  "geolocation=()",
  "gyroscope=()",
  "magnetometer=()",
  "microphone=()",
  "midi=()",
  "payment=()",
  "picture-in-picture=()",
  "publickey-credentials-get=()",
  "sync-xhr=(self)",
  "usb=()",
  "screen-wake-lock=()",
  "xr-spatial-tracking=()",
].join(", ");

export function applySecurityHeaders(
  res: http.ServerResponse,
  options: SecurityHeadersOptions = DEFAULT_OPTIONS
): void {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  if (opts.csp) {
    const cspValue = typeof opts.csp === "string" ? opts.csp : DEFAULT_CSP;
    res.setHeader("Content-Security-Policy", cspValue);
  }

  if (opts.hsts) {
    const hstsOpts = typeof opts.hsts === "object" ? opts.hsts : {};
    const maxAge = hstsOpts.maxAge || 31536000;
    const includeSubDomains = hstsOpts.includeSubDomains !== false;
    const preload = hstsOpts.preload || false;
    let hstsValue = `max-age=${maxAge}`;
    if (includeSubDomains) hstsValue += "; includeSubDomains";
    if (preload) hstsValue += "; preload";
    res.setHeader("Strict-Transport-Security", hstsValue);
  }

  if (opts.xssProtection) {
    res.setHeader("X-XSS-Protection", "1; mode=block");
  }

  if (opts.noSniff) {
    res.setHeader("X-Content-Type-Options", "nosniff");
  }

  if (opts.frameOptions) {
    const frameValue = typeof opts.frameOptions === "string" ? opts.frameOptions : "DENY";
    res.setHeader("X-Frame-Options", frameValue);
  }

  if (opts.referrerPolicy) {
    const referrerValue = typeof opts.referrerPolicy === "string"
      ? opts.referrerPolicy
      : "strict-origin-when-cross-origin";
    res.setHeader("Referrer-Policy", referrerValue);
  }

  if (opts.poweredBy === false) {
    res.removeHeader("X-Powered-By");
  } else if (typeof opts.poweredBy === "string") {
    res.setHeader("X-Powered-By", opts.poweredBy);
  }

  if (opts.permissionsPolicy) {
    const permissionsValue = typeof opts.permissionsPolicy === "string"
      ? opts.permissionsPolicy
      : DEFAULT_PERMISSIONS_POLICY;
    res.setHeader("Permissions-Policy", permissionsValue);
  }

  if (opts.crossOriginOpenerPolicy) {
    const coopValue = typeof opts.crossOriginOpenerPolicy === "string"
      ? opts.crossOriginOpenerPolicy
      : "same-origin";
    res.setHeader("Cross-Origin-Opener-Policy", coopValue);
  }

  if (opts.crossOriginEmbedderPolicy) {
    const coepValue = typeof opts.crossOriginEmbedderPolicy === "string"
      ? opts.crossOriginEmbedderPolicy
      : "require-corp";
    res.setHeader("Cross-Origin-Embedder-Policy", coepValue);
  }

  if (opts.expectCT) {
    const expectCTOpts = typeof opts.expectCT === "object" ? opts.expectCT : {};
    const maxAge = expectCTOpts.maxAge || 86400;
    const enforce = expectCTOpts.enforce || false;
    let expectCTValue = `max-age=${maxAge}`;
    if (enforce) expectCTValue += ", enforce";
    if (expectCTOpts.reportUri) expectCTValue += `, report-uri="${expectCTOpts.reportUri}"`;
    res.setHeader("Expect-CT", expectCTValue);
  }
}

export function getSecurityHeaders(options: SecurityHeadersOptions = DEFAULT_OPTIONS): Record<string, string> {
  const headers: Record<string, string> = {};
  const mockRes = {
    setHeader: (name: string, value: string) => { headers[name] = value; },
    removeHeader: (name: string) => { delete headers[name]; }
  } as unknown as http.ServerResponse;
  
  applySecurityHeaders(mockRes, options);
  return headers;
}

