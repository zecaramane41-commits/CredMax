import { useEffect, useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router";
import { AlertCircle, Loader2, LogIn, UserPlus } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import {
  getPendingApplication,
  isPortalAuthenticated,
  portalFetch,
  setPortalAuth,
  type PortalAccount,
  type PortalCompany,
} from "../../lib/portal-api";

type AuthResponse = { token: string; account: PortalAccount };

/**
 * Registo e acesso do Portal do Cliente (Fase 2.2 — §5).
 * Dois modos: entrar com conta existente ou criar conta pública (ligada ao cliente).
 */
export default function PortalAccessPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [companies, setCompanies] = useState<PortalCompany[]>([]);
  const [companyId, setCompanyId] = useState<number | "">("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [documentNumber, setDocumentNumber] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const pending = getPendingApplication();

  useEffect(() => {
    portalFetch<{ companies: PortalCompany[] }>("/portal/companies", { auth: false })
      .then((data) => {
        setCompanies(data.companies);
        if (data.companies.length === 1) setCompanyId(data.companies[0].id);
      })
      .catch(() => {
        /* empresas são opcionais no login de empresa única */
      });
  }, []);

  const afterAuth = () => {
    // Com simulação pendente volta ao simulador (que submete o pedido); caso contrário, aos pedidos.
    navigate(pending ? "/credito" : "/credito/pedidos");
  };

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const payload = await portalFetch<AuthResponse>("/portal/login", {
        method: "POST",
        auth: false,
        body: JSON.stringify({
          email,
          password,
          ...(companyId !== "" ? { companyId } : {}),
        }),
      });
      setPortalAuth(payload.token, payload.account);
      afterAuth();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível autenticar.");
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    if (password !== confirmPassword) {
      setError("As palavras-passe não coincidem.");
      return;
    }
    setLoading(true);
    try {
      const payload = await portalFetch<AuthResponse>("/portal/register", {
        method: "POST",
        auth: false,
        body: JSON.stringify({
          fullName,
          email,
          phone,
          documentNumber,
          password,
          companyId: companyId !== "" ? companyId : companies.length === 1 ? companies[0].id : undefined,
        }),
      });
      setPortalAuth(payload.token, payload.account);
      afterAuth();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível criar a conta.");
    } finally {
      setLoading(false);
    }
  };

  if (isPortalAuthenticated()) {
    return <Navigate to={pending ? "/credito" : "/credito/pedidos"} replace />;
  }

  const showCompanySelect = companies.length > 1;
  const needsCompany = companies.length > 1 && companyId === "";

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-slate-900">
          {mode === "login" ? "Aceder à conta" : "Criar conta no portal"}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {mode === "login"
            ? "Entre para acompanhar os seus pedidos de crédito."
            : "Registe-se para simular e submeter pedidos de crédito."}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
        <button
          type="button"
          onClick={() => {
            setMode("login");
            setError("");
          }}
          className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
            mode === "login" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
          }`}
        >
          <LogIn className="h-4 w-4" />
          Entrar
        </button>
        <button
          type="button"
          onClick={() => {
            setMode("register");
            setError("");
          }}
          className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
            mode === "register" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
          }`}
        >
          <UserPlus className="h-4 w-4" />
          Criar conta
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <form
        onSubmit={mode === "login" ? handleLogin : handleRegister}
        className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6"
      >
        {showCompanySelect && (
          <div>
            <label htmlFor="access-company" className="mb-1 block text-sm font-medium text-slate-700">
              Empresa
            </label>
            <select
              id="access-company"
              value={companyId}
              onChange={(e) => setCompanyId(e.target.value ? Number(e.target.value) : "")}
              className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="">Selecione a empresa…</option>
              {companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {mode === "register" && (
          <>
            <div>
              <label htmlFor="access-name" className="mb-1 block text-sm font-medium text-slate-700">
                Nome completo
              </label>
              <Input
                id="access-name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Ex.: Ana Banda"
                required
                minLength={3}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="access-phone" className="mb-1 block text-sm font-medium text-slate-700">
                  Telefone
                </label>
                <Input
                  id="access-phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="Ex.: 841234567"
                  required
                  minLength={9}
                />
              </div>
              <div>
                <label htmlFor="access-doc" className="mb-1 block text-sm font-medium text-slate-700">
                  Documento de identificação
                </label>
                <Input
                  id="access-doc"
                  value={documentNumber}
                  onChange={(e) => setDocumentNumber(e.target.value)}
                  placeholder="Ex.: BI/BIlhete"
                  required
                  minLength={4}
                />
              </div>
            </div>
          </>
        )}

        <div>
          <label htmlFor="access-email" className="mb-1 block text-sm font-medium text-slate-700">
            Email
          </label>
          <Input
            id="access-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="nome@exemplo.com"
            required
          />
        </div>

        <div>
          <label htmlFor="access-password" className="mb-1 block text-sm font-medium text-slate-700">
            Palavra-passe
          </label>
          <Input
            id="access-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
          />
          {mode === "register" && (
            <p className="mt-1 text-xs text-slate-500">
              Mínimo 8 caracteres, com letra maiúscula, minúscula, número e símbolo.
            </p>
          )}
        </div>

        {mode === "register" && (
          <div>
            <label htmlFor="access-confirm" className="mb-1 block text-sm font-medium text-slate-700">
              Confirmar palavra-passe
            </label>
            <Input
              id="access-confirm"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={8}
            />
          </div>
        )}

        <Button type="submit" className="w-full" disabled={loading || needsCompany}>
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          {mode === "login" ? "Entrar" : "Criar conta"}
        </Button>
        {needsCompany && (
          <p className="text-center text-xs text-amber-600">Selecione a empresa para continuar.</p>
        )}
      </form>
    </div>
  );
}

