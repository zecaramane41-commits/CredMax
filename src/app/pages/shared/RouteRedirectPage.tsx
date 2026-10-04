import { Navigate, useLocation } from "react-router";

const REDIRECTS: Record<string, string> = {
  "/operations": "/operations/reembolsos",
  "/loans": "/credits?tab=pedidos",
  "/credits/pedidos": "/credits?tab=pedidos",
  "/credits/analise": "/credits?tab=analise",
  "/credits/aprovacao": "/credits?tab=aprovacao",
  "/credits/autorizacao": "/credits?tab=autorizacao",
  "/credits/desembolso": "/credits?tab=desembolso",
  "/credits/estado": "/credits?tab=estado",
  "/simulator": "/credits/simulador",
  "/credit-analysis": "/credits?tab=analise",
  "/disbursement": "/credits?tab=desembolso",
  "/reimbursements": "/operations/reembolsos",
  "/compliance": "/compliance",
  "/reports/reimbursements": "/reports?tab=operational",
  "/reports/disbursements": "/reports?tab=operational",
  "/reports/banco-mocambique": "/reports?tab=regulatory&code=banco_central",
  "/reports/clients": "/reports?tab=operational",
  "/reports/guia-iva": "/reports?tab=regulatory&code=fiscal",
};

export default function RouteRedirectPage() {
  const location = useLocation();
  const target = REDIRECTS[location.pathname] || "/";
  return <Navigate to={target} replace />;
}
