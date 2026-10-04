import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { Lock, Mail, Eye, EyeOff, AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { apiFetch } from "../../lib/api";
import { setAuth } from "../../lib/auth";

const REMEMBER_ME_KEY = "microcredit_remember_me";

export default function LoginPage() {
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [requireMfa, setRequireMfa] = useState(false);
  const [rememberMe, setRememberMe] = useState(() => localStorage.getItem(REMEMBER_ME_KEY) !== "false");
  const [showRecovery, setShowRecovery] = useState(false);
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [recoveryOtp, setRecoveryOtp] = useState("");
  const [recoveryPassword, setRecoveryPassword] = useState("");
  const [recoveryConfirmPassword, setRecoveryConfirmPassword] = useState("");
  const [recoveryStep, setRecoveryStep] = useState<"request" | "verify" | "success">("request");
  const [recoveryMessage, setRecoveryMessage] = useState("");
  const [recoveryLoading, setRecoveryLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [subscriptionWarning, setSubscriptionWarning] = useState("");
  const [pendingHomeRoute, setPendingHomeRoute] = useState("/");

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMessage("");
    setSubscriptionWarning("");
    setLoading(true);

    try {
      const payload = await apiFetch<{
        token: string;
        homeRoute?: string;
        subscriptionWarning?: string;
        user: { id: number; fullName: string; email: string; role: string; companyId?: number | null; companyName?: string };
      }>(
        "/auth/login",
        {
          method: "POST",
          body: JSON.stringify({ email, password, mfaCode }),
          auth: false,
        },
      );
      localStorage.setItem(REMEMBER_ME_KEY, rememberMe ? "true" : "false");
      setAuth(payload.token, payload.user, rememberMe);
      const targetRoute = payload.homeRoute || "/";
      // Show subscription warning if present (grace period)
      if (payload.subscriptionWarning) {
        setPendingHomeRoute(targetRoute);
        setSubscriptionWarning(payload.subscriptionWarning);
        setLoading(false);
        return; // Stay on login page to show warning, user can click to proceed
      }
      navigate(targetRoute);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Nao foi possivel autenticar.";
      if (/mfa obrigatorio|codigo mfa invalido/i.test(message)) {
        setRequireMfa(true);
        setErrorMessage("Verificacao adicional necessaria para concluir o acesso.");
      } else {
        setErrorMessage(message);
      }
    } finally {
      setLoading(false);
    }
  };

  const resetRecovery = () => {
    setShowRecovery(false);
    setRecoveryEmail("");
    setRecoveryOtp("");
    setRecoveryPassword("");
    setRecoveryConfirmPassword("");
    setRecoveryStep("request");
    setRecoveryMessage("");
    setRecoveryLoading(false);
  };

  const handleRecoveryRequest = async (e: FormEvent) => {
    e.preventDefault();
    setRecoveryMessage("");
    setRecoveryLoading(true);

    try {
      const payload = await apiFetch<{ message: string }>(
        "/auth/password-recovery/request",
        {
          method: "POST",
          body: JSON.stringify({ email: recoveryEmail }),
          auth: false,
        },
      );
      setRecoveryStep("verify");
      setRecoveryMessage(payload.message || "Codigo OTP enviado.");
    } catch (error) {
      setRecoveryMessage(error instanceof Error ? error.message : "Nao foi possivel solicitar o OTP.");
    } finally {
      setRecoveryLoading(false);
    }
  };

  const handleRecoveryVerify = async (e: FormEvent) => {
    e.preventDefault();
    setRecoveryMessage("");

    if (recoveryPassword !== recoveryConfirmPassword) {
      setRecoveryMessage("As senhas nao coincidem.");
      return;
    }

    setRecoveryLoading(true);
    try {
      const payload = await apiFetch<{ message: string }>(
        "/auth/password-recovery/verify",
        {
          method: "POST",
          body: JSON.stringify({
            email: recoveryEmail,
            otpCode: recoveryOtp,
            newPassword: recoveryPassword,
          }),
          auth: false,
        },
      );
      setRecoveryStep("success");
      setRecoveryMessage(payload.message || "Senha atualizada com sucesso.");
    } catch (error) {
      setRecoveryMessage(error instanceof Error ? error.message : "Nao foi possivel validar o OTP.");
    } finally {
      setRecoveryLoading(false);
    }
  };

  if (showRecovery) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-900 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-2xl shadow-2xl p-8">
            <div className="text-center mb-8">
              <div className="w-16 h-16 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl mx-auto mb-4 flex items-center justify-center shadow-lg">
                <Lock className="w-8 h-8 text-white" />
              </div>
              <h1 className="text-2xl font-bold text-slate-900">Recuperar Palavra-passe</h1>
              <p className="text-sm text-slate-600 mt-2">Recupere o acesso com seguranca</p>
            </div>

            {recoveryStep === "success" ? (
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg mb-6">
                <div className="flex items-center gap-2 text-emerald-800">
                  <CheckCircle2 className="w-5 h-5" />
                  <p className="text-sm font-medium">{recoveryMessage || "Senha atualizada com sucesso."}</p>
                </div>
                <Button type="button" onClick={resetRecovery} className="w-full mt-4">
                  Voltar ao login
                </Button>
              </div>
            ) : recoveryStep === "request" ? (
              <form onSubmit={handleRecoveryRequest} className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-slate-700 block mb-2">E-mail corporativo</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <Input
                      type="email"
                      placeholder="seu.email@empresa.mz"
                      value={recoveryEmail}
                      onChange={(e) => setRecoveryEmail(e.target.value)}
                      className="pl-10"
                      required
                    />
                  </div>
                </div>

                <Button
                  type="submit"
                  disabled={recoveryLoading}
                  className="w-full bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700"
                >
                  {recoveryLoading ? "A enviar..." : "Enviar codigo de verificacao"}
                </Button>

                {recoveryMessage && (
                  <p className="text-sm text-blue-700 bg-blue-50 border border-blue-200 rounded-md px-3 py-2">
                    {recoveryMessage}
                  </p>
                )}

                <button
                  type="button"
                  onClick={resetRecovery}
                  className="w-full text-sm text-slate-600 hover:text-slate-900 transition-colors"
                >
                  Voltar ao login
                </button>
              </form>
            ) : (
              <form onSubmit={handleRecoveryVerify} className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-slate-700 block mb-2">E-mail</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <Input
                      type="email"
                      value={recoveryEmail}
                      onChange={(e) => setRecoveryEmail(e.target.value)}
                      className="pl-10"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium text-slate-700 block mb-2">Codigo de verificacao</label>
                  <Input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={recoveryOtp}
                    onChange={(e) => setRecoveryOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="Ex: 123456"
                    required
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-slate-700 block mb-2">Nova senha</label>
                  <Input
                    type="password"
                    value={recoveryPassword}
                    onChange={(e) => setRecoveryPassword(e.target.value)}
                    placeholder="Minimo de 8 caracteres"
                    required
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-slate-700 block mb-2">Confirmar nova senha</label>
                  <Input
                    type="password"
                    value={recoveryConfirmPassword}
                    onChange={(e) => setRecoveryConfirmPassword(e.target.value)}
                    required
                  />
                </div>

                <Button
                  type="submit"
                  disabled={recoveryLoading}
                  className="w-full bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700"
                >
                  {recoveryLoading ? "A validar..." : "Redefinir senha"}
                </Button>

                {recoveryMessage && (
                  <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                    {recoveryMessage}
                  </p>
                )}

                <button
                  type="button"
                  onClick={() => setRecoveryStep("request")}
                  className="w-full text-sm text-slate-600 hover:text-slate-900 transition-colors"
                >
                  Solicitar novo OTP
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl mx-auto mb-4 flex items-center justify-center shadow-lg">
              <Lock className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900">SiGeM</h1>
            <p className="text-sm text-slate-600 mt-2">Sistema de Gerenciamento de Microcredito</p>
            <p className="text-xs text-slate-500 mt-1">Acesso profissional e seguro</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="text-sm font-medium text-slate-700 block mb-2">Utilizador</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <Input
                  type="email"
                  placeholder="seu.utilizador@empresa.mz"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-10"
                  required
                />
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-slate-700 block mb-2">Palavra-passe</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <Input
                  type={showPassword ? "text" : "password"}
                  placeholder="********"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10 pr-10"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {requireMfa && (
              <div>
                <label className="text-sm font-medium text-slate-700 block mb-2">Codigo de verificacao</label>
                <Input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="Ex: 123456"
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                />
              </div>
            )}

            <div className="flex items-center justify-between text-sm">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  className="rounded border-slate-300"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                />
                <span className="text-slate-600">Lembrar-me</span>
              </label>
              <button
                type="button"
                onClick={() => setShowRecovery(true)}
                className="text-emerald-600 hover:text-emerald-700 font-medium"
              >
                Esqueceu a palavra-passe?
              </button>
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700"
            >
              {loading ? "A autenticar..." : "Entrar"}
            </Button>

            {errorMessage && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                {errorMessage}
              </p>
            )}

            {subscriptionWarning && (
              <div className="space-y-3">
                <div className="p-4 bg-amber-50 border border-amber-300 rounded-lg">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold text-amber-800">Atencao: Assinatura a expirar</p>
                      <p className="text-sm text-amber-700 mt-1">{subscriptionWarning}</p>
                    </div>
                  </div>
                </div>
                <Button
                  type="button"
                  onClick={() => navigate(pendingHomeRoute)}
                  className="w-full bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600"
                >
                  Continuar para o Sistema
                </Button>
                <button
                  type="button"
                  onClick={() => { setSubscriptionWarning(""); setErrorMessage(""); }}
                  className="w-full text-sm text-slate-600 hover:text-slate-900 transition-colors"
                >
                  Voltar ao login
                </button>
              </div>
            )}
          </form>

          <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex gap-2">
              <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0" />
              <div>
                <p className="text-xs font-medium text-blue-900">Seguranca</p>
                <p className="text-xs text-blue-700 mt-1">
                  Nunca compartilhe credenciais. Todas as atividades sao registradas.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="text-center mt-6">
          <p className="text-sm text-slate-400">(c) 2026 SiGeM - Sistema de Gerenciamento de Microcredito</p>
        </div>
      </div>
    </div>
  );
}
