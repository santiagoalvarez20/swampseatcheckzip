import React, { useEffect, useMemo, useState } from "react";
import { io, Socket } from "socket.io-client";
import { Toaster, toast } from "sonner";
import { motion } from "framer-motion";
import {
  Activity,
  BellRing,
  BookOpen,
  CheckCircle2,
  Eye,
  EyeOff,
  Lock,
  LogOut,
  Mail,
  Plus,
  Radar,
  Save,
  ShieldCheck,
  Sparkles,
  Square,
  Terminal,
  Trash2,
  User,
  Waves,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const API_BASE = import.meta.env.VITE_API_URL || "";
const TERM_NAMES: Record<string, string> = {
  "2268": "Fall 2026",
  "2266": "Summer 2026",
  "2261": "Spring 2026",
};

type User = {
  id: string;
  name: string;
  email: string;
};

type Course = {
  code: string;
  term: string;
  checkWaitlist: boolean;
};

type AppConfig = {
  username: string;
  password: string;
  email: string;
  courses: Course[];
  status: "running" | "stopped";
  results: Record<string, { sections: Array<Record<string, string | number>>; timestamp: string }>;
  logs: string[];
};

const emptyConfig: AppConfig = {
  username: "",
  password: "",
  email: "",
  courses: [],
  status: "stopped",
  results: {},
  logs: [],
};

async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data;
}

function AuthShell({ onAuthenticated }: { onAuthenticated: (user: User) => void }) {
  const [mode, setMode] = useState<"login" | "signup">("signup");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "" });

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (mode === "signup" && !form.name.trim()) {
      toast.error("Name is required");
      return;
    }
    if (!form.email.trim() || !form.password) {
      toast.error("Email and password are required");
      return;
    }
    if (form.password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    setIsSubmitting(true);
    try {
      const endpoint = mode === "signup" ? "/api/auth/signup" : "/api/auth/login";
      const payload = mode === "signup" ? form : { email: form.email, password: form.password };
      const data = await api<{ user: User }>(endpoint, { method: "POST", body: JSON.stringify(payload) });
      toast.success(mode === "signup" ? "Account created" : "Welcome back", { description: "Your secure session is active." });
      onAuthenticated(data.user);
    } catch (error) {
      toast.error("Authentication failed", { description: error instanceof Error ? error.message : String(error) });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#07111f] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,#24d6a355,transparent_34%),radial-gradient(circle_at_78%_12%,#ff7a1a44,transparent_30%),linear-gradient(135deg,#07111f,#101827_55%,#031b2d)]" />
      <div className="absolute left-1/2 top-16 h-80 w-80 -translate-x-1/2 rounded-full bg-cyan-400/10 blur-3xl" />
      <div className="relative grid min-h-screen gap-10 px-6 py-8 lg:grid-cols-[1.1fr_0.9fr] lg:px-14">
        <section className="flex flex-col justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-slate-950 shadow-2xl shadow-cyan-500/20">
              <Radar className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm uppercase tracking-[0.42em] text-cyan-200/80">SwampSeatCheck</p>
              <h1 className="text-xl font-semibold">Session-first monitor</h1>
            </div>
          </div>

          <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} className="max-w-3xl py-16 lg:py-0">
            <Badge className="mb-6 border-cyan-300/30 bg-cyan-300/10 text-cyan-100" variant="outline">
              <Sparkles className="mr-1 h-3 w-3" /> Render-ready backend scaffold
            </Badge>
            <h2 className="text-5xl font-black leading-[0.98] tracking-tight md:text-7xl">
              Course seats, watched from a private command deck.
            </h2>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300">
              I replaced the Firebase dependency with cookie-based sessions, then reshaped the UI into a moody operations console for watchlists, alerts, and live backend events.
            </p>
            <div className="mt-10 grid max-w-2xl gap-4 sm:grid-cols-3">
              {[
                [ShieldCheck, "Session auth", "HTTP-only cookie"],
                [Waves, "Live updates", "Socket session bridge"],
                [BellRing, "Alert hooks", "Email-ready endpoint"],
              ].map(([Icon, title, detail]) => (
                <div key={String(title)} className="rounded-3xl border border-white/10 bg-white/[0.06] p-4 backdrop-blur">
                  {typeof Icon !== "string" && <Icon className="mb-5 h-6 w-6 text-cyan-200" />}
                  <p className="font-semibold">{String(title)}</p>
                  <p className="mt-1 text-sm text-slate-400">{String(detail)}</p>
                </div>
              ))}
            </div>
          </motion.div>

          <p className="text-sm text-slate-500">Designed for the frontend here and a Node backend on Render.</p>
        </section>

        <section className="flex items-center justify-center">
          <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-md">
            <Card className="border-white/10 bg-white/[0.08] text-white shadow-2xl shadow-black/30 backdrop-blur-2xl">
              <CardHeader className="space-y-2 px-6 pt-6">
                <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-cyan-300 text-slate-950 shadow-lg shadow-cyan-500/25">
                  <Lock className="h-7 w-7" />
                </div>
                <CardTitle className="text-2xl font-black">{mode === "signup" ? "Create your cockpit" : "Unlock your cockpit"}</CardTitle>
                <CardDescription className="text-slate-300">
                  {mode === "signup" ? "Your account is backed by an Express session, ready to deploy." : "Sign in to restore your protected watchlist."}
                </CardDescription>
              </CardHeader>
              <CardContent className="px-6 pb-6">
                <form onSubmit={submit} className="space-y-4">
                  {mode === "signup" && (
                    <div className="space-y-2">
                      <Label className="text-slate-200">Name</Label>
                      <div className="relative">
                        <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        <Input required autoComplete="name" className="h-12 border-white/10 bg-white/10 pl-10 text-white placeholder:text-slate-500" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Jane Gator" />
                      </div>
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label className="text-slate-200">Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <Input required autoComplete="email" className="h-12 border-white/10 bg-white/10 pl-10 text-white placeholder:text-slate-500" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="you@example.com" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-slate-200">Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <Input required minLength={8} autoComplete={mode === "signup" ? "new-password" : "current-password"} className="h-12 border-white/10 bg-white/10 px-10 text-white placeholder:text-slate-500" type={showPassword ? "text" : "password"} value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} placeholder="Minimum 8 characters" />
                      <button className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" type="button" onClick={() => setShowPassword(!showPassword)}>
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                  <Button type="submit" disabled={isSubmitting} className="h-12 w-full rounded-2xl bg-cyan-300 text-base font-black text-slate-950 hover:bg-cyan-200">
                    {isSubmitting ? "Securing..." : mode === "signup" ? "Create session account" : "Sign in"}
                  </Button>
                </form>
                <button className="mt-5 w-full text-center text-sm text-slate-300 hover:text-white" onClick={() => setMode(mode === "signup" ? "login" : "signup")}>
                  {mode === "signup" ? "Already have an account? Sign in" : "Need an account? Create one"}
                </button>
              </CardContent>
            </Card>
          </motion.div>
        </section>
      </div>
    </div>
  );
}

function Dashboard({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [config, setConfig] = useState<AppConfig>(emptyConfig);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [newCourse, setNewCourse] = useState({ code: "", term: "2268", checkWaitlist: false });
  const [socket, setSocket] = useState<Socket | null>(null);

  const completion = useMemo(() => {
    const checks = [config.username, config.password, config.email, config.courses.length > 0];
    return Math.round((checks.filter(Boolean).length / checks.length) * 100);
  }, [config]);

  const loadConfig = async () => {
    setIsLoading(true);
    try {
      const data = await api<AppConfig>("/api/config");
      setConfig({ ...emptyConfig, ...data, logs: data.logs || [] });
    } catch (error) {
      toast.error("Could not load dashboard", { description: error instanceof Error ? error.message : String(error) });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadConfig();
    const channel = io(API_BASE || undefined, { withCredentials: true });
    channel.on("log", (message: string) => setConfig((prev) => ({ ...prev, logs: [...prev.logs, message].slice(-200) })));
    channel.on("status", (status: "running" | "stopped") => setConfig((prev) => ({ ...prev, status })));
    setSocket(channel);
    return () => {
      channel.disconnect();
    };
  }, []);

  const saveConfig = async () => {
    setIsSaving(true);
    try {
      const data = await api<AppConfig>("/api/config", { method: "POST", body: JSON.stringify(config) });
      setConfig({ ...emptyConfig, ...data, logs: config.logs });
      toast.success("Saved", { description: "Your protected session config was updated." });
    } catch (error) {
      toast.error("Save failed", { description: error instanceof Error ? error.message : String(error) });
    } finally {
      setIsSaving(false);
    }
  };

  const addCourse = () => {
    const code = newCourse.code.trim().toUpperCase();
    if (!code) return toast.error("Enter a course code");
    if (config.courses.some((course) => course.code === code)) return toast.info("That course is already on your radar");
    setConfig((prev) => ({ ...prev, courses: [...prev.courses, { ...newCourse, code }] }));
    setNewCourse({ code: "", term: "2268", checkWaitlist: false });
  };

  const removeCourse = (code: string) => {
    setConfig((prev) => ({ ...prev, courses: prev.courses.filter((course) => course.code !== code) }));
  };

  const start = async () => {
    try {
      await saveConfig();
      await api("/api/start", { method: "POST" });
      toast.success("Monitor armed", { description: "The backend scaffold accepted the launch request." });
    } catch (error) {
      toast.error("Could not start", { description: error instanceof Error ? error.message : String(error) });
    }
  };

  const stop = async () => {
    try {
      await api("/api/stop", { method: "POST" });
      toast.info("Monitor stopped");
    } catch (error) {
      toast.error("Could not stop", { description: error instanceof Error ? error.message : String(error) });
    }
  };

  const logout = async () => {
    await socket?.disconnect();
    await api("/api/auth/logout", { method: "POST" });
    onLogout();
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-8 text-center shadow-2xl">
          <Radar className="mx-auto mb-4 h-10 w-10 animate-pulse text-cyan-300" />
          <p className="font-semibold">Calibrating your dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#07111f] text-slate-100">
      <div className="fixed inset-0 bg-[radial-gradient(circle_at_12%_10%,#22d3ee24,transparent_28%),radial-gradient(circle_at_92%_5%,#fb923c24,transparent_25%),linear-gradient(180deg,#07111f,#0f172a)]" />
      <div className="relative mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
        <header className="mb-6 flex flex-col gap-4 rounded-[2rem] border border-white/10 bg-white/[0.06] p-4 shadow-2xl shadow-black/20 backdrop-blur-xl md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-cyan-300 text-slate-950 shadow-lg shadow-cyan-400/20">
              <Radar className="h-7 w-7" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.32em] text-cyan-200">SwampSeatCheck</p>
              <h1 className="text-2xl font-black">Operations deck</h1>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Badge className={config.status === "running" ? "bg-emerald-400 text-slate-950" : "border-white/10 bg-white/10 text-slate-200"} variant="outline">
              <Activity className="mr-1 h-3 w-3" /> {config.status === "running" ? "Live" : "Idle"}
            </Badge>
            <div className="rounded-2xl bg-white/10 px-3 py-2 text-sm text-slate-300">{user.name} · {user.email}</div>
            <Button variant="outline" className="border-white/10 bg-white/10 text-white hover:bg-white/20" onClick={logout}>
              <LogOut className="mr-2 h-4 w-4" /> Logout
            </Button>
          </div>
        </header>

        <main className="grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
          <section className="space-y-6">
            <Card className="border-white/10 bg-white/[0.07] text-white shadow-2xl shadow-black/20 backdrop-blur-xl">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-xl font-black"><ShieldCheck className="h-5 w-5 text-cyan-300" /> Session health</CardTitle>
                <CardDescription className="text-slate-400">Protected routes, socket updates, and Render deployment hooks are wired.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="mb-5 h-3 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full rounded-full bg-gradient-to-r from-cyan-300 to-emerald-300" style={{ width: `${completion}%` }} />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {[
                    ["Portal login", config.username ? "Ready" : "Needed"],
                    ["Alert email", config.email ? "Ready" : "Needed"],
                    ["Watchlist", `${config.courses.length} courses`],
                    ["Backend", "Scaffolded"],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-2xl border border-white/10 bg-slate-950/35 p-4">
                      <p className="text-xs uppercase tracking-[0.24em] text-slate-500">{label}</p>
                      <p className="mt-2 font-bold">{value}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="border-white/10 bg-white/[0.07] text-white shadow-2xl shadow-black/20 backdrop-blur-xl">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-xl font-black"><Zap className="h-5 w-5 text-orange-300" /> Launch controls</CardTitle>
                <CardDescription className="text-slate-400">Start and stop are protected by your session.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2">
                <Button className="h-12 rounded-2xl bg-emerald-300 font-black text-slate-950 hover:bg-emerald-200" onClick={start}>
                  <CheckCircle2 className="mr-2 h-4 w-4" /> Arm monitor
                </Button>
                <Button className="h-12 rounded-2xl border-white/10 bg-white/10 text-white hover:bg-white/20" variant="outline" onClick={stop}>
                  <Square className="mr-2 h-4 w-4" /> Stand down
                </Button>
              </CardContent>
            </Card>
          </section>

          <section>
            <Tabs defaultValue="setup" className="w-full">
              <TabsList className="mb-4 border border-white/10 bg-white/10 text-slate-300">
                <TabsTrigger value="setup" className="data-active:bg-cyan-300 data-active:text-slate-950">Setup</TabsTrigger>
                <TabsTrigger value="watchlist" className="data-active:bg-cyan-300 data-active:text-slate-950">Watchlist</TabsTrigger>
                <TabsTrigger value="logs" className="data-active:bg-cyan-300 data-active:text-slate-950">Console</TabsTrigger>
              </TabsList>

              <TabsContent value="setup">
                <Card className="border-white/10 bg-white/[0.07] text-white shadow-2xl shadow-black/20 backdrop-blur-xl">
                  <CardHeader>
                    <CardTitle className="text-xl font-black">Credentials and alerts</CardTitle>
                    <CardDescription className="text-slate-400">This stores your config behind the session scaffold. Swap the JSON persistence for your Render database when ready.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label className="text-slate-300">Portal username</Label>
                        <Input className="h-11 border-white/10 bg-slate-950/40 text-white" value={config.username} onChange={(event) => setConfig({ ...config, username: event.target.value })} placeholder="UF username" />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-slate-300">Portal password</Label>
                        <Input className="h-11 border-white/10 bg-slate-950/40 text-white" type="password" value={config.password} onChange={(event) => setConfig({ ...config, password: event.target.value })} placeholder="••••••••" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-slate-300">Alert email</Label>
                      <Input className="h-11 border-white/10 bg-slate-950/40 text-white" type="email" value={config.email} onChange={(event) => setConfig({ ...config, email: event.target.value })} placeholder="alerts@example.com" />
                    </div>
                    <Button disabled={isSaving} className="h-11 rounded-2xl bg-cyan-300 font-black text-slate-950 hover:bg-cyan-200" onClick={saveConfig}>
                      <Save className="mr-2 h-4 w-4" /> {isSaving ? "Saving..." : "Save secure config"}
                    </Button>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="watchlist">
                <Card className="border-white/10 bg-white/[0.07] text-white shadow-2xl shadow-black/20 backdrop-blur-xl">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-xl font-black"><BookOpen className="h-5 w-5 text-cyan-300" /> Course radar</CardTitle>
                    <CardDescription className="text-slate-400">Add classes to pass into your Render worker.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-3 md:grid-cols-[1fr_0.7fr_auto_auto]">
                      <Input className="h-11 border-white/10 bg-slate-950/40 text-white" value={newCourse.code} onChange={(event) => setNewCourse({ ...newCourse, code: event.target.value })} placeholder="COP3502C" />
                      <select className="h-11 rounded-lg border border-white/10 bg-slate-950/40 px-3 text-sm text-white" value={newCourse.term} onChange={(event) => setNewCourse({ ...newCourse, term: event.target.value })}>
                        {Object.entries(TERM_NAMES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </select>
                      <label className="flex h-11 items-center gap-2 rounded-lg border border-white/10 bg-slate-950/40 px-3 text-sm text-slate-300">
                        <input checked={newCourse.checkWaitlist} type="checkbox" onChange={(event) => setNewCourse({ ...newCourse, checkWaitlist: event.target.checked })} /> Waitlist
                      </label>
                      <Button className="h-11 rounded-2xl bg-cyan-300 font-black text-slate-950 hover:bg-cyan-200" onClick={addCourse}><Plus className="mr-2 h-4 w-4" /> Add</Button>
                    </div>

                    <div className="grid gap-3">
                      {config.courses.length === 0 ? (
                        <div className="rounded-3xl border border-dashed border-white/15 bg-slate-950/30 p-8 text-center text-slate-400">No courses yet. Add one to light up the radar.</div>
                      ) : config.courses.map((course) => (
                        <div key={course.code} className="flex items-center justify-between rounded-3xl border border-white/10 bg-slate-950/35 p-4">
                          <div>
                            <p className="text-lg font-black">{course.code}</p>
                            <p className="text-sm text-slate-400">{TERM_NAMES[course.term] || course.term} · {course.checkWaitlist ? "Seat + waitlist" : "Seat only"}</p>
                          </div>
                          <Button variant="ghost" className="text-slate-300 hover:bg-red-500/10 hover:text-red-200" onClick={() => removeCourse(course.code)}><Trash2 className="h-4 w-4" /></Button>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="logs">
                <Card className="border-white/10 bg-white/[0.07] text-white shadow-2xl shadow-black/20 backdrop-blur-xl">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-xl font-black"><Terminal className="h-5 w-5 text-emerald-300" /> Live console</CardTitle>
                    <CardDescription className="text-slate-400">Session socket messages from the backend scaffold.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[360px] overflow-auto rounded-3xl border border-white/10 bg-black/60 p-4 font-mono text-sm text-emerald-200 shadow-inner">
                      {config.logs.length === 0 ? <p className="text-slate-500">Awaiting backend events...</p> : config.logs.map((log, index) => <p key={`${log}-${index}`} className="mb-2"><span className="text-cyan-300">$</span> {log}</p>)}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </section>
        </main>
      </div>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isBooting, setIsBooting] = useState(true);

  useEffect(() => {
    api<{ user: User | null }>("/api/auth/me")
      .then((data) => setUser(data.user))
      .catch(() => setUser(null))
      .finally(() => setIsBooting(false));
  }, []);

  if (isBooting) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#07111f] text-white">
        <Toaster richColors position="top-right" />
        <Radar className="h-10 w-10 animate-pulse text-cyan-300" />
      </div>
    );
  }

  return (
    <>
      <Toaster richColors position="top-right" />
      {user ? <Dashboard user={user} onLogout={() => setUser(null)} /> : <AuthShell onAuthenticated={setUser} />}
    </>
  );
}
