import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { http, formatApiErrorDetail } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowLeft, Loader2, Mail, KeyRound, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

const MODES = {
  LOGIN: "login",
  REGISTER: "register",
  REGISTER_OTP: "register-otp",
  FORGOT_EMAIL: "forgot-email",
  FORGOT_OTP: "forgot-otp",
  FORGOT_NEW: "forgot-new",
};

export default function Auth() {
  const [mode, setMode] = useState(MODES.LOGIN);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [loading, setLoading] = useState(false);

  // Forgot-password state
  const [otp, setOtp] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const cooldownRef = useRef(null);

  // Signup OTP state
  const [signupOtp, setSignupOtp] = useState("");
  const [signupCooldown, setSignupCooldown] = useState(0);
  const signupCooldownRef = useRef(null);

  const { login, signupRequest, signupVerify } = useAuth();
  const navigate = useNavigate();

  useEffect(() => () => {
    if (cooldownRef.current) clearInterval(cooldownRef.current);
    if (signupCooldownRef.current) clearInterval(signupCooldownRef.current);
  }, []);

  const startCooldown = (seconds) => {
    setCooldown(seconds);
    if (cooldownRef.current) clearInterval(cooldownRef.current);
    cooldownRef.current = setInterval(() => {
      setCooldown((s) => {
        if (s <= 1) { clearInterval(cooldownRef.current); return 0; }
        return s - 1;
      });
    }, 1000);
  };

  const startSignupCooldown = (seconds) => {
    setSignupCooldown(seconds);
    if (signupCooldownRef.current) clearInterval(signupCooldownRef.current);
    signupCooldownRef.current = setInterval(() => {
      setSignupCooldown((s) => {
        if (s <= 1) { clearInterval(signupCooldownRef.current); return 0; }
        return s - 1;
      });
    }, 1000);
  };

  const resetForgotState = () => {
    setOtp("");
    setResetToken("");
    setNewPassword("");
    setConfirmPassword("");
    setCooldown(0);
    if (cooldownRef.current) clearInterval(cooldownRef.current);
  };

  const resetSignupState = () => {
    setSignupOtp("");
    setSignupCooldown(0);
    if (signupCooldownRef.current) clearInterval(signupCooldownRef.current);
  };

  const goLogin = () => { resetForgotState(); resetSignupState(); setMode(MODES.LOGIN); };

  const submitLoginOrRegister = async (e) => {
    e.preventDefault();
    setLoading(true);
    if (mode === MODES.LOGIN) {
      const res = await login(email, password, remember);
      setLoading(false);
      if (res.ok) {
        toast.success("Welcome back");
        const ent = res.user?.entitlements;
        const admin = res.user?.full_access;
        if (!admin && ent && !ent.is_active) navigate("/app/upgrade");
        else navigate("/app");
      } else toast.error(res.error);
      return;
    }
    // REGISTER — send OTP first
    const res = await signupRequest(name, email, password);
    setLoading(false);
    if (res.ok) {
      toast.success(`Verification code sent to ${email}`);
      setSignupOtp("");
      startSignupCooldown(60);
      setMode(MODES.REGISTER_OTP);
    } else {
      toast.error(res.error);
    }
  };

  const resendSignupOtp = async () => {
    if (signupCooldown > 0) return;
    setLoading(true);
    const res = await signupRequest(name, email, password);
    setLoading(false);
    if (res.ok) {
      toast.success("A new code has been sent");
      startSignupCooldown(60);
    } else {
      toast.error(res.error);
    }
  };

  const verifySignupOtp = async (e) => {
    e.preventDefault();
    if (!/^\d{4,8}$/.test(signupOtp.trim())) { toast.error("Enter the code you received"); return; }
    setLoading(true);
    const res = await signupVerify(email.trim().toLowerCase(), signupOtp.trim());
    setLoading(false);
    if (res.ok) {
      toast.success("Email verified — welcome to Citetail");
      resetSignupState();
      const ent = res.user?.entitlements;
      const admin = res.user?.full_access;
      if (!admin && ent && !ent.is_active) navigate("/app/upgrade");
      else navigate("/app");
    } else {
      toast.error(res.error);
    }
  };

  const requestOtp = async (e) => {
    if (e) e.preventDefault();
    if (!email.trim()) { toast.error("Enter your email"); return; }
    setLoading(true);
    try {
      const { data } = await http.post("/auth/forgot-password/request", { email: email.trim().toLowerCase() });
      toast.success(`Code sent to ${data.delivered_to || email}`);
      setMode(MODES.FORGOT_OTP);
      startCooldown(60);
    } catch (err) {
      toast.error(formatApiErrorDetail(err) || "Could not send code");
    } finally {
      setLoading(false);
    }
  };

  const resendOtp = async () => {
    if (cooldown > 0) return;
    setLoading(true);
    try {
      await http.post("/auth/forgot-password/request", { email: email.trim().toLowerCase() });
      toast.success("A new code has been sent");
      startCooldown(60);
    } catch (err) {
      toast.error(formatApiErrorDetail(err) || "Could not resend code");
    } finally {
      setLoading(false);
    }
  };

  const verifyOtp = async (e) => {
    e.preventDefault();
    if (!/^\d{4,8}$/.test(otp.trim())) { toast.error("Enter the code you received"); return; }
    setLoading(true);
    try {
      const { data } = await http.post("/auth/forgot-password/verify", {
        email: email.trim().toLowerCase(),
        code: otp.trim(),
      });
      setResetToken(data.reset_token);
      toast.success("Code verified");
      setMode(MODES.FORGOT_NEW);
    } catch (err) {
      toast.error(formatApiErrorDetail(err) || "Invalid code");
    } finally {
      setLoading(false);
    }
  };

  const setNewPasswordSubmit = async (e) => {
    e.preventDefault();
    if (newPassword.length < 8) { toast.error("Password must be at least 8 characters"); return; }
    if (newPassword !== confirmPassword) { toast.error("Passwords do not match"); return; }
    setLoading(true);
    try {
      await http.post("/auth/forgot-password/reset", {
        email: email.trim().toLowerCase(),
        reset_token: resetToken,
        new_password: newPassword,
      });
      toast.success("Password updated — signing you in…");
      const res = await login(email.trim().toLowerCase(), newPassword, false);
      resetForgotState();
      setPassword("");
      if (res.ok) {
        const ent = res.user?.entitlements;
        const admin = res.user?.full_access;
        if (!admin && ent && !ent.is_active) navigate("/app/upgrade");
        else navigate("/app");
      } else {
        setMode(MODES.LOGIN);
      }
    } catch (err) {
      toast.error(formatApiErrorDetail(err) || "Could not reset password");
    } finally {
      setLoading(false);
    }
  };

  const headerTitle = {
    [MODES.LOGIN]: "Sign in",
    [MODES.REGISTER]: "Create account",
    [MODES.REGISTER_OTP]: "Verify your email",
    [MODES.FORGOT_EMAIL]: "Reset password",
    [MODES.FORGOT_OTP]: "Enter verification code",
    [MODES.FORGOT_NEW]: "Set a new password",
  }[mode];

  const headerSub = {
    [MODES.LOGIN]: "Access your analyses and score history.",
    [MODES.REGISTER]: "Start scoring content in seconds.",
    [MODES.REGISTER_OTP]: `We sent a 6-digit code to ${email || "your inbox"}. It expires in 10 minutes.`,
    [MODES.FORGOT_EMAIL]: "Enter your email and we'll send you a one-time code.",
    [MODES.FORGOT_OTP]: `We sent a 6-digit code to ${email || "your inbox"}. It expires in 10 minutes.`,
    [MODES.FORGOT_NEW]: "Choose a strong password (min 8 characters).",
  }[mode];

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      <div className="hidden lg:flex flex-col justify-between relative overflow-hidden bg-[#0B0B0F] p-12">
        <div className="absolute -top-32 -left-24 w-[520px] h-[520px] rounded-full opacity-60 blur-3xl"
          style={{ background: "radial-gradient(circle, rgba(99, 102, 241,0.45) 0%, rgba(99, 102, 241,0) 70%)" }} />
        <div className="absolute bottom-0 right-0 w-[420px] h-[420px] rounded-full opacity-40 blur-3xl"
          style={{ background: "radial-gradient(circle, rgba(99, 102, 241,0.35) 0%, rgba(99, 102, 241,0) 70%)" }} />
        <div className="relative flex items-center gap-2.5">
          <img src="/logo.png" alt="Citetail logo" className="w-10 h-10 object-contain" />
          <span className="font-head font-extrabold text-2xl tracking-tight text-white">Cite<span className="gradient-text">tail</span></span>
        </div>
        <div className="relative text-white">
          <h2 className="font-head text-4xl font-extrabold tracking-tight leading-tight">Rank in the age of<br/>AI answers.</h2>
          <p className="text-white/60 mt-4 max-w-md text-base">Score any page for Generative &amp; Answer Engine Optimization. See exactly how ChatGPT, Perplexity, Claude and Gemini would cite you — and fix what they can&apos;t.</p>
          <div className="flex items-center gap-6 mt-8">
            {["Crawl-first analysis", "Verified citations", "Live AI rankings"].map((t) => (
              <div key={t} className="flex items-center gap-2 text-sm text-white/70">
                <span className="w-1.5 h-1.5 rounded-full bg-[#6366F1]" /> {t}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-sm">
          <div className="flex items-center gap-2.5 mb-8 lg:hidden">
            <img src="/logo.png" alt="Citetail logo" className="w-9 h-9 object-contain" />
            <span className="font-head font-extrabold text-xl tracking-tight">Cite<span className="text-[#6366F1]">tail</span></span>
          </div>

          {(mode === MODES.FORGOT_EMAIL || mode === MODES.FORGOT_OTP || mode === MODES.FORGOT_NEW || mode === MODES.REGISTER_OTP) && (
            <button
              type="button"
              onClick={goLogin}
              className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-4"
              data-testid="forgot-back"
            >
              <ArrowLeft size={14} /> Back to sign in
            </button>
          )}

          <h1 className="font-head text-3xl font-extrabold tracking-tight">{headerTitle}</h1>
          <p className="text-muted-foreground text-sm mt-2 mb-8">{headerSub}</p>

          {/* LOGIN / REGISTER */}
          {(mode === MODES.LOGIN || mode === MODES.REGISTER) && (
            <form onSubmit={submitLoginOrRegister} className="space-y-4" data-testid="auth-form">
              {mode === MODES.REGISTER && (
                <div>
                  <Label className="mb-1.5 block">Name</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Doe" data-testid="name-input" />
                </div>
              )}
              <div>
                <Label className="mb-1.5 block">Email</Label>
                <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" data-testid="email-input" />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <Label>Password</Label>
                  {mode === MODES.LOGIN && (
                    <button
                      type="button"
                      onClick={() => setMode(MODES.FORGOT_EMAIL)}
                      className="text-xs font-semibold text-[#6366F1] hover:underline"
                      data-testid="forgot-password-link"
                    >
                      Forgot password?
                    </button>
                  )}
                </div>
                <Input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" data-testid="password-input" />
              </div>
              {mode === MODES.LOGIN && (
                <label className="flex items-center gap-2 cursor-pointer select-none" data-testid="remember-me-label">
                  <Checkbox checked={remember} onCheckedChange={(v) => setRemember(!!v)} data-testid="remember-me-checkbox" />
                  <span className="text-sm text-muted-foreground">Keep me signed in for 15 days</span>
                </label>
              )}
              <Button type="submit" disabled={loading} className="w-full btn-brand transition-all" data-testid="auth-submit">
                {loading ? "Please wait…" : mode === MODES.LOGIN ? "Sign in" : "Continue"}
              </Button>
            </form>
          )}

          {/* SIGNUP OTP */}
          {mode === MODES.REGISTER_OTP && (
            <form onSubmit={verifySignupOtp} className="space-y-4" data-testid="signup-otp-form">
              <div>
                <Label className="mb-1.5 block">Verification code</Label>
                <div className="relative">
                  <KeyRound size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <Input
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    required
                    value={signupOtp}
                    onChange={(e) => setSignupOtp(e.target.value.replace(/[^0-9]/g, "").slice(0, 8))}
                    placeholder="123456"
                    className="pl-9 tracking-[0.4em] font-mono text-center"
                    data-testid="signup-otp-input"
                  />
                </div>
              </div>
              <Button type="submit" disabled={loading || signupOtp.trim().length < 4} className="w-full btn-brand" data-testid="signup-verify-btn">
                {loading ? <Loader2 className="animate-spin mr-2" size={16} /> : null}
                {loading ? "Verifying…" : "Verify & create account"}
              </Button>
              <div className="text-center text-sm">
                <button
                  type="button"
                  onClick={resendSignupOtp}
                  disabled={signupCooldown > 0 || loading}
                  className="text-[#6366F1] font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:underline"
                  data-testid="signup-resend-btn"
                >
                  {signupCooldown > 0 ? `Resend code in ${signupCooldown}s` : "Resend code"}
                </button>
              </div>
            </form>
          )}

          {/* STEP 1 — Enter email */}
          {mode === MODES.FORGOT_EMAIL && (
            <form onSubmit={requestOtp} className="space-y-4" data-testid="forgot-email-form">
              <div>
                <Label className="mb-1.5 block">Email</Label>
                <div className="relative">
                  <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <Input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@company.com"
                    className="pl-9"
                    data-testid="forgot-email-input"
                  />
                </div>
              </div>
              <Button type="submit" disabled={loading} className="w-full btn-brand" data-testid="forgot-request-btn">
                {loading ? <Loader2 className="animate-spin mr-2" size={16} /> : null}
                {loading ? "Sending code…" : "Send verification code"}
              </Button>
            </form>
          )}

          {/* STEP 2 — Verify OTP */}
          {mode === MODES.FORGOT_OTP && (
            <form onSubmit={verifyOtp} className="space-y-4" data-testid="forgot-otp-form">
              <div>
                <Label className="mb-1.5 block">Verification code</Label>
                <div className="relative">
                  <KeyRound size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <Input
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    required
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/[^0-9]/g, "").slice(0, 8))}
                    placeholder="123456"
                    className="pl-9 tracking-[0.4em] font-mono text-center"
                    data-testid="forgot-otp-input"
                  />
                </div>
              </div>
              <Button type="submit" disabled={loading || otp.trim().length < 4} className="w-full btn-brand" data-testid="forgot-verify-btn">
                {loading ? <Loader2 className="animate-spin mr-2" size={16} /> : null}
                {loading ? "Verifying…" : "Verify code"}
              </Button>
              <div className="text-center text-sm">
                <button
                  type="button"
                  onClick={resendOtp}
                  disabled={cooldown > 0 || loading}
                  className="text-[#6366F1] font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:underline"
                  data-testid="forgot-resend-btn"
                >
                  {cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}
                </button>
              </div>
            </form>
          )}

          {/* STEP 3 — New password */}
          {mode === MODES.FORGOT_NEW && (
            <form onSubmit={setNewPasswordSubmit} className="space-y-4" data-testid="forgot-new-form">
              <div>
                <Label className="mb-1.5 block">New password</Label>
                <div className="relative">
                  <ShieldCheck size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <Input
                    type="password"
                    required
                    minLength={8}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="At least 8 characters"
                    className="pl-9"
                    data-testid="forgot-new-password-input"
                  />
                </div>
              </div>
              <div>
                <Label className="mb-1.5 block">Confirm new password</Label>
                <Input
                  type="password"
                  required
                  minLength={8}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter password"
                  data-testid="forgot-confirm-password-input"
                />
              </div>
              <Button type="submit" disabled={loading} className="w-full btn-brand" data-testid="forgot-reset-btn">
                {loading ? <Loader2 className="animate-spin mr-2" size={16} /> : null}
                {loading ? "Updating…" : "Reset password & sign in"}
              </Button>
            </form>
          )}

          {mode === MODES.LOGIN && (
            <p className="text-sm text-muted-foreground mt-6">
              New here? <a className="font-semibold text-[#129E75] underline underline-offset-4" href="/pricing" data-testid="link-pricing">See plans &amp; sign up</a>
              <span className="mx-2 text-slate-300">·</span>
              <button type="button" className="font-semibold text-[#6366F1] underline underline-offset-4"
                onClick={() => setMode(MODES.REGISTER)} data-testid="toggle-register">
                Create a free account
              </button>
            </p>
          )}
          {mode === MODES.REGISTER && (
            <p className="text-sm text-muted-foreground mt-6">
              Already have an account? <button className="font-semibold text-[#129E75] underline underline-offset-4" data-testid="toggle-mode"
                onClick={() => setMode(MODES.LOGIN)}>Sign in</button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
