import express, { type NextFunction, type Request, type Response } from "express";
import session from "express-session";
import { createServer } from "http";
import { Server } from "socket.io";
import { createServer as createViteServer } from "vite";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import nodemailer from "nodemailer";
import { spawn } from "child_process";

const PORT = Number(process.env.PORT || 5000);
const DATA_DIR = path.join(process.cwd(), "data");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const STATE_FILE = path.join(DATA_DIR, "app-state.json");
const isProduction = process.env.NODE_ENV === "production";
const automationProcesses = new Map<string, ReturnType<typeof spawn>>();

interface UserRecord {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  createdAt: string;
}

interface CourseConfig {
  code: string;
  term: string;
  checkWaitlist: boolean;
}

interface UserState {
  username: string;
  password: string;
  email: string;
  courses: CourseConfig[];
  status: "running" | "stopped";
  results: Record<string, { sections: Array<Record<string, string | number>>; timestamp: string }>;
  logs: string[];
}

interface PublicUser {
  id: string;
  name: string;
  email: string;
}

declare module "express-session" {
  interface SessionData {
    userId?: string;
  }
}

function ensureDataFiles() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, "[]");
  if (!fs.existsSync(STATE_FILE)) fs.writeFileSync(STATE_FILE, "{}");
}

function readJson<T>(filePath: string, fallback: T): T {
  ensureDataFiles();
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return fallback;
  }
}

function writeJson<T>(filePath: string, data: T) {
  ensureDataFiles();
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function hashPassword(password: string) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, storedHash: string) {
  const [salt, hash] = storedHash.split(":");
  if (!salt || !hash) return false;
  const candidate = crypto.scryptSync(password, salt, 64);
  const stored = Buffer.from(hash, "hex");
  return stored.length === candidate.length && crypto.timingSafeEqual(stored, candidate);
}

function getUsers() {
  return readJson<UserRecord[]>(USERS_FILE, []);
}

function saveUsers(users: UserRecord[]) {
  writeJson(USERS_FILE, users);
}

function getAllState() {
  return readJson<Record<string, UserState>>(STATE_FILE, {});
}

function getDefaultState(user?: PublicUser): UserState {
  return {
    username: "",
    password: "",
    email: user?.email || "",
    courses: [],
    status: "stopped",
    results: {},
    logs: ["Session authenticated. Automation engine is ready."],
  };
}

function getUserState(userId: string, user?: PublicUser) {
  const state = getAllState();
  if (!state[userId]) {
    state[userId] = getDefaultState(user);
    writeJson(STATE_FILE, state);
  }
  return state[userId];
}

function saveUserState(userId: string, nextState: UserState) {
  const state = getAllState();
  state[userId] = nextState;
  writeJson(STATE_FILE, state);
}

function toPublicUser(user: UserRecord): PublicUser {
  return { id: user.id, name: user.name, email: user.email };
}

function getCurrentUser(req: Request) {
  const userId = req.session.userId;
  if (!userId) return null;
  const user = getUsers().find((item) => item.id === userId);
  return user ? toPublicUser(user) : null;
}

function requireAuth(req: Request, res: Response, next: NextFunction) {
  const user = getCurrentUser(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  res.locals.user = user;
  next();
}

function appendLog(userId: string, message: string) {
  const state = getUserState(userId);
  const nextState = { ...state, logs: [...state.logs, message].slice(-200) };
  saveUserState(userId, nextState);
  return nextState;
}

async function startServer() {
  ensureDataFiles();

  const app = express();
  app.set("trust proxy", 1);

  const frontendOrigin = process.env.FRONTEND_ORIGIN;
  app.use((req, res, next) => {
    if (frontendOrigin && req.headers.origin === frontendOrigin) {
      res.setHeader("Access-Control-Allow-Origin", frontendOrigin);
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
      res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
    }
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  });

  const sessionMiddleware = session({
    name: "swamp.sid",
    secret: process.env.SESSION_SECRET || "replace-this-session-secret-before-deploying",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? "none" : "lax",
      maxAge: 1000 * 60 * 60 * 24 * 7,
    },
  });

  app.use(express.json({ limit: "1mb" }));
  app.use(sessionMiddleware);

  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: frontendOrigin ? { origin: frontendOrigin, credentials: true } : undefined,
  });

  io.engine.use(sessionMiddleware as never);

  app.post("/api/auth/signup", (req, res) => {
    const name = String(req.body.name || "").trim();
    const email = normalizeEmail(String(req.body.email || ""));
    const password = String(req.body.password || "");

    if (!name || !email || !password) return res.status(400).json({ error: "Name, email, and password are required." });
    if (!email.includes("@")) return res.status(400).json({ error: "Enter a valid email address." });
    if (password.length < 8) return res.status(400).json({ error: "Password must be at least 8 characters." });

    const users = getUsers();
    if (users.some((user) => user.email === email)) return res.status(409).json({ error: "An account with this email already exists." });

    const user: UserRecord = {
      id: crypto.randomUUID(),
      name,
      email,
      passwordHash: hashPassword(password),
      createdAt: new Date().toISOString(),
    };

    users.push(user);
    saveUsers(users);
    req.session.userId = user.id;
    getUserState(user.id, toPublicUser(user));
    res.status(201).json({ user: toPublicUser(user) });
  });

  app.post("/api/auth/login", (req, res) => {
    const email = normalizeEmail(String(req.body.email || ""));
    const password = String(req.body.password || "");
    const user = getUsers().find((item) => item.email === email);

    if (!user || !verifyPassword(password, user.passwordHash)) return res.status(401).json({ error: "Invalid email or password." });

    req.session.userId = user.id;
    res.json({ user: toPublicUser(user) });
  });

  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy(() => {
      res.clearCookie("swamp.sid");
      res.json({ success: true });
    });
  });

  app.get("/api/auth/me", (req, res) => {
    const user = getCurrentUser(req);
    res.json({ user });
  });

  app.get("/api/config", requireAuth, (req, res) => {
    res.json(getUserState(res.locals.user.id, res.locals.user));
  });

  app.post("/api/config", requireAuth, (req, res) => {
    const user = res.locals.user as PublicUser;
    const current = getUserState(user.id, user);
    const courses = Array.isArray(req.body.courses) ? req.body.courses : current.courses;
    const nextState: UserState = {
      ...current,
      username: String(req.body.username ?? current.username),
      password: String(req.body.password ?? current.password),
      email: String(req.body.email ?? current.email),
      courses: courses.map((course: CourseConfig) => ({
        code: String(course.code || "").trim().toUpperCase(),
        term: String(course.term || "2268"),
        checkWaitlist: Boolean(course.checkWaitlist),
      })).filter((course: CourseConfig) => course.code),
    };
    saveUserState(user.id, nextState);
    io.to(user.id).emit("log", "Configuration saved for this session account.");
    res.json(nextState);
  });

  app.get("/api/results", requireAuth, (req, res) => {
    res.json(getUserState(res.locals.user.id, res.locals.user).results);
  });

  app.get("/api/logs", requireAuth, (req, res) => {
    res.json({ logs: getUserState(res.locals.user.id, res.locals.user).logs });
  });

  app.get("/api/status", requireAuth, (req, res) => {
    res.json({ status: getUserState(res.locals.user.id, res.locals.user).status });
  });

  app.post("/api/start", requireAuth, (req, res) => {
    const user = res.locals.user as PublicUser;
    const current = getUserState(user.id, user);
    if (!current.username || !current.password) return res.status(400).json({ error: "Save portal credentials before starting." });
    if (current.courses.length === 0) return res.status(400).json({ error: "Add at least one course to monitor." });
    if (automationProcesses.has(user.id)) return res.status(400).json({ error: "Automation is already running for this account." });

    const nextState = {
      ...current,
      status: "running" as const,
      logs: [...current.logs, `Monitor armed for ${current.courses.length} course${current.courses.length === 1 ? "" : "s"}.`, "Launching automation.ts now."].slice(-200),
    };

    saveUserState(user.id, nextState);
    io.to(user.id).emit("status", "running");
    io.to(user.id).emit("log", nextState.logs[nextState.logs.length - 2]);
    io.to(user.id).emit("log", nextState.logs[nextState.logs.length - 1]);

    const automationProcess = spawn("npx", ["tsx", "automation.ts"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        CONFIG_JSON: JSON.stringify({
          username: current.username,
          password: current.password,
          email: current.email,
          courses: current.courses,
        }),
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    automationProcesses.set(user.id, automationProcess);

    const handleLine = (rawLine: string) => {
      const line = rawLine.trim();
      if (!line) return;

      if (line.startsWith("SCREENSHOT:")) {
        io.to(user.id).emit("log", "Screenshot captured from automation.");
        appendLog(user.id, "Screenshot captured from automation.");
        return;
      }

      if (line.startsWith("COURSE_RESULTS:")) {
        const payload = line.replace("COURSE_RESULTS:", "").trim();
        try {
          const resultData = JSON.parse(payload);
          const state = getUserState(user.id, user);
          saveUserState(user.id, {
            ...state,
            results: {
              ...state.results,
              [resultData.name]: {
                sections: resultData.sections || [],
                timestamp: resultData.timestamp || new Date().toISOString(),
              },
            },
          });
          io.to(user.id).emit("log", `Results updated for ${resultData.name}.`);
          appendLog(user.id, `Results updated for ${resultData.name}.`);
        } catch {
          io.to(user.id).emit("log", "Could not parse course results from automation.");
          appendLog(user.id, "Could not parse course results from automation.");
        }
        return;
      }

      if (line.startsWith("PROGRESS:")) {
        try {
          const progress = JSON.parse(line.replace("PROGRESS:", "").trim());
          const progressMessage = `Progress: ${progress.course} is ${progress.status}.`;
          io.to(user.id).emit("log", progressMessage);
          appendLog(user.id, progressMessage);
        } catch {
          io.to(user.id).emit("log", line);
          appendLog(user.id, line);
        }
        return;
      }

      const message = line.includes("DUO_START")
        ? "DUO approval is required on your phone."
        : line.includes("DUO_SUCCESS")
          ? "DUO approval received."
          : line.includes("DUO_TIMEOUT")
            ? "DUO approval timed out."
            : line.startsWith("DUO_CODE:")
              ? `DUO code: ${line.replace("DUO_CODE:", "").trim()}`
              : line;

      io.to(user.id).emit("log", message);
      appendLog(user.id, message);
    };

    automationProcess.stdout.on("data", (chunk) => {
      chunk.toString().split("\n").forEach(handleLine);
    });

    automationProcess.stderr.on("data", (chunk) => {
      chunk.toString().split("\n").forEach((line: string) => {
        const message = line.trim();
        if (!message) return;
        io.to(user.id).emit("log", `ERROR: ${message}`);
        appendLog(user.id, `ERROR: ${message}`);
      });
    });

    automationProcess.on("close", (code) => {
      automationProcesses.delete(user.id);
      const state = getUserState(user.id, user);
      saveUserState(user.id, {
        ...state,
        status: "stopped",
        logs: [...state.logs, `Automation exited with code ${code}.`].slice(-200),
      });
      io.to(user.id).emit("status", "stopped");
      io.to(user.id).emit("log", `Automation exited with code ${code}.`);
    });

    automationProcess.on("error", (error) => {
      automationProcesses.delete(user.id);
      const state = getUserState(user.id, user);
      saveUserState(user.id, {
        ...state,
        status: "stopped",
        logs: [...state.logs, `Automation failed to launch: ${error.message}`].slice(-200),
      });
      io.to(user.id).emit("status", "stopped");
      io.to(user.id).emit("log", `Automation failed to launch: ${error.message}`);
    });

    res.json({ success: true, status: "running" });
  });

  app.post("/api/stop", requireAuth, (req, res) => {
    const user = res.locals.user as PublicUser;
    const current = getUserState(user.id, user);
    const automationProcess = automationProcesses.get(user.id);
    if (automationProcess) {
      automationProcess.kill();
      automationProcesses.delete(user.id);
    }
    const nextState = { ...current, status: "stopped" as const, logs: [...current.logs, "Monitor stopped for this session."].slice(-200) };
    saveUserState(user.id, nextState);
    io.to(user.id).emit("status", "stopped");
    io.to(user.id).emit("log", "Monitor stopped for this session.");
    res.json({ success: true, status: "stopped" });
  });

  app.post("/api/test-email", requireAuth, async (req, res) => {
    const email = String(req.body.email || res.locals.user.email || "").trim();
    const senderEmail = String(process.env.SENDER_EMAIL || "").trim();
    const senderPass = String(process.env.SENDER_PASSWORD || "").trim();

    if (!email) return res.status(400).json({ error: "Email is required." });
    if (!senderEmail || !senderPass) return res.status(501).json({ error: "Email credentials are not configured on the server." });

    try {
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || "smtp.gmail.com",
        port: Number(process.env.SMTP_PORT || 465),
        secure: process.env.SMTP_SECURE !== "false",
        auth: { user: senderEmail, pass: senderPass },
      });
      const info = await transporter.sendMail({
        from: senderEmail,
        to: email,
        subject: "SwampSeatCheck alerts are ready",
        text: "Your alert channel is configured. You will receive updates when your monitor worker reports open seats.",
      });
      appendLog(res.locals.user.id, `Test email sent to ${email}.`);
      res.json({ success: true, messageId: info.messageId });
    } catch (error) {
      res.status(500).json({ error: "Failed to send email.", details: error instanceof Error ? error.message : String(error) });
    }
  });

  io.on("connection", (socket) => {
    const request = socket.request as Request;
    const userId = request.session?.userId;
    if (!userId) return socket.disconnect(true);
    socket.join(userId);
    socket.emit("log", "Live session channel connected.");
  });

  if (!isProduction) {
    const vite = await createViteServer({
      server: { middlewareMode: true, allowedHosts: true, hmr: process.env.DISABLE_HMR !== "true" },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer().catch((error) => {
  console.error(error);
  process.exit(1);
});
