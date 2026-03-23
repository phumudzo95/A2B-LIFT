import "dotenv/config";
import express from "express";
import type { Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import * as fs from "fs";
import * as path from "path";
import { createProxyMiddleware } from "http-proxy-middleware";

const app = express();
const log = console.log;

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

function setupCors(app: express.Application) {
  app.use((req, res, next) => {
    const origins = new Set<string>();

    // Add production domains
    origins.add("https://a2b-lift.onrender.com");
    origins.add("https://peaceful-mousse-459c85.netlify.app");

    // Railway domains — wildcard handled below via includes check
    if (process.env.RAILWAY_PUBLIC_DOMAIN) {
      origins.add(`https://${process.env.RAILWAY_PUBLIC_DOMAIN}`);
    }

    if (process.env.REPLIT_DEV_DOMAIN) {
      origins.add(`https://${process.env.REPLIT_DEV_DOMAIN}`);
    }

    if (process.env.REPLIT_DOMAINS) {
      process.env.REPLIT_DOMAINS.split(",").forEach((d) => {
        origins.add(`https://${d.trim()}`);
      });
    }

    const origin = req.header("origin");

    // Allow localhost, local IPs, and tunnel domains for Expo development
    const isLocalhost =
      origin?.startsWith("http://localhost:") ||
      origin?.startsWith("http://127.0.0.1:") ||
      origin?.startsWith("http://192.168.") ||
      origin?.startsWith("http://10.") ||
      origin?.includes(".exp.direct") ||
      origin?.includes(".trycloudflare.com") ||
      origin?.includes(".serveousercontent.com") ||
      origin?.includes(".gitpod.dev") ||
      origin?.includes(".up.railway.app") ||
      origin?.includes(".netlify.app") ||
      (origin?.match(/^http:\/\/172\.(1[6-9]|2[0-9]|3[0-1])\./) !== null);

    if (origin && (origins.has(origin) || isLocalhost)) {
      res.header("Access-Control-Allow-Origin", origin);
      res.header(
        "Access-Control-Allow-Methods",
        "GET, POST, PUT, DELETE, OPTIONS",
      );
      res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
      res.header("Access-Control-Allow-Credentials", "true");
    }

    if (req.method === "OPTIONS") {
      return res.sendStatus(200);
    }

    next();
  });
}

function setupSecurity(app: express.Application) {
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://unpkg.com"],
          scriptSrcElem: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://unpkg.com"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:", "https:"],
          connectSrc: ["'self'", "https:", "wss:"],
          frameAncestors: ["'self'", "https://*.replit.dev", "https://*.repl.co", "https://*.replit.com", "https://*.replit.app"],
        },
      },
      frameguard: false,
    })
  );
  app.use(cookieParser());
}

function setupBodyParsing(app: express.Application) {
  app.use(
    express.json({
      limit: "20mb",
      verify: (req, _res, buf) => {
        req.rawBody = buf;
      },
    }),
  );

  app.use(express.urlencoded({ extended: false }));
}

function setupRequestLogging(app: express.Application) {
  app.use((req, res, next) => {
    const start = Date.now();
    const requestPath = req.path;
    let capturedJsonResponse: Record<string, unknown> | undefined = undefined;

    const originalResJson = res.json;
    res.json = function (bodyJson, ...args) {
      capturedJsonResponse = bodyJson;
      return originalResJson.apply(res, [bodyJson, ...args]);
    };

    res.on("finish", () => {
      if (!requestPath.startsWith("/api")) return;

      const duration = Date.now() - start;

      let logLine = `${req.method} ${requestPath} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    });

    next();
  });
}

function getAppName(): string {
  try {
    const appJsonPath = path.resolve(process.cwd(), "app.json");
    const appJsonContent = fs.readFileSync(appJsonPath, "utf-8");
    const appJson = JSON.parse(appJsonContent);
    return appJson.expo?.name || "App Landing Page";
  } catch {
    return "App Landing Page";
  }
}

// Try 8080 first; if Metro grabbed 8081 due to a port collision, fall back
const METRO_PORTS = [8080, 8081];
let resolvedMetroPort = 8080;

async function detectMetroPort(): Promise<number> {
  const net = await import("net");
  for (const port of METRO_PORTS) {
    const open = await new Promise<boolean>((resolve) => {
      const s = net.createConnection({ port, host: "127.0.0.1" });
      s.once("connect", () => { s.destroy(); resolve(true); });
      s.once("error", () => resolve(false));
    });
    if (open) { resolvedMetroPort = port; return port; }
  }
  return resolvedMetroPort;
}

function hasStaticBuild(): boolean {
  return fs.existsSync(path.resolve(process.cwd(), "static-build", "index.html"));
}

// Proxy factory — always uses resolvedMetroPort so it stays current
function makeMetroProxy(port: number) {
  return createProxyMiddleware({
    target: `http://localhost:${port}`,
    changeOrigin: true,
    on: {
      proxyReq: (proxyReq: any) => {
        // Override Origin/Host so Metro's CORS check sees a localhost origin
        proxyReq.setHeader("Origin", `http://localhost:${port}`);
        proxyReq.setHeader("Host", `localhost:${port}`);
      },
      error: (_err: any, _req: any, res: any) => {
        if (res && typeof res.status === "function") {
          res.status(502).json({ error: "Metro bundler not reachable — is Start Frontend running?" });
        }
      },
    },
  });
}

// Start with default; detectMetroPort() will correct this on startup
let metroProxy = makeMetroProxy(8080);

function serveLandingPage({
  req,
  res,
  landingPageTemplate,
  appName,
}: {
  req: Request;
  res: Response;
  landingPageTemplate: string;
  appName: string;
}) {
  const forwardedProto = req.header("x-forwarded-proto");
  const protocol = forwardedProto || req.protocol || "https";
  const forwardedHost = req.header("x-forwarded-host");
  const host = forwardedHost || req.get("host");
  const baseUrl = `${protocol}://${host}`;
  const expsUrl = `${host}`;

  log(`baseUrl`, baseUrl);
  log(`expsUrl`, expsUrl);

  const html = landingPageTemplate
    .replace(/BASE_URL_PLACEHOLDER/g, baseUrl)
    .replace(/EXPS_URL_PLACEHOLDER/g, expsUrl)
    .replace(/APP_NAME_PLACEHOLDER/g, appName);

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.status(200).send(html);
}

async function configureExpoAndLanding(app: express.Application) {
  const adminTemplatePath = path.resolve(
    process.cwd(),
    "server",
    "templates",
    "admin.html",
  );
  const adminTemplate = fs.readFileSync(adminTemplatePath, "utf-8");

  // Detect which port Metro actually started on (8080 or 8081)
  const metroPort = await detectMetroPort();
  metroProxy = makeMetroProxy(metroPort);
  log(`Metro bundler detected on port ${metroPort}`);

  const staticBuildExists = hasStaticBuild();
  log(`Static build: ${staticBuildExists ? "found" : "not found"} — routing non-API traffic to Metro:${metroPort}`);

  // /admin → admin dashboard HTML
  app.get("/admin", (_req: Request, res: Response) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.status(200).send(adminTemplate);
  });

  // Serve local assets folder
  app.use("/assets", express.static(path.resolve(process.cwd(), "assets")));

  // If a static web build exists, serve it for non-API paths
  if (staticBuildExists) {
    app.use(express.static(path.resolve(process.cwd(), "static-build")));
    // Catch-all for SPA routing — still proxy native manifests
    app.use((req: Request, res: Response, next: NextFunction) => {
      if (req.path.startsWith("/api")) return next();
      const platform = req.header("expo-platform");
      if (platform === "ios" || platform === "android") {
        log(`[Metro proxy] ${platform} manifest → Metro:${metroPort}`);
        return (metroProxy as any)(req, res, next);
      }
      const staticIndex = path.resolve(process.cwd(), "static-build", "index.html");
      res.sendFile(staticIndex);
    });
  } else {
    // No static build — proxy everything (web + native) to Metro
    app.use((req: Request, res: Response, next: NextFunction) => {
      if (req.path.startsWith("/api")) return next();
      if (req.path === "/admin") return next(); // handled above
      if (req.path.startsWith("/socket.io")) return next(); // let Socket.IO handle this
      const platform = req.header("expo-platform") || "web";
      log(`[Metro proxy] ${platform} ${req.path} → Metro:${metroPort}`);
      return (metroProxy as any)(req, res, next);
    });
  }

  log("Expo routing configured");
}

function setupErrorHandler(app: express.Application) {
  app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    const error = err as {
      status?: number;
      statusCode?: number;
      message?: string;
    };

    const status = error.status || error.statusCode || 500;
    const message = error.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });
}

(async () => {
  setupCors(app);
  setupSecurity(app);
  setupBodyParsing(app);
  setupRequestLogging(app);

  await configureExpoAndLanding(app);

  const server = await registerRoutes(app);

  setupErrorHandler(app);

  // Use process.env.PORT for deployment (Heroku, Railway, Render, etc.)
  // Falls back to 5000 for local development
  const port = parseInt(process.env.PORT || "5000", 10);
  const portSource = process.env.PORT ? "process.env.PORT" : "default (5000)";
  
  server.listen(
    {
      port,
      host: "0.0.0.0", // Listen on all interfaces for deployment
      reusePort: true,
    },
    () => {
      log(`express server serving on port ${port} (from ${portSource})`);
    },
  );
})();

