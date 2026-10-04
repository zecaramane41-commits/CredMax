import { getUser } from "./auth";

type PrintOptions = {
  title: string;
  bodyHtml: string;
  landscape?: boolean;
  browserControls?: boolean;
  company?: {
    name?: string;
    legalName?: string;
    nuit?: string;
    logoUrl?: string;
  } | null;
};

function escapeHtml(value: string) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function roleLabel(role: string) {
  const normalized = String(role || "").trim().toLowerCase();
  if (normalized === "admin") return "Administrador";
  if (normalized === "manager") return "Gestor";
  if (normalized === "agent") return "Agente de Credito";
  if (normalized === "operator") return "Operador";
  return normalized || "-";
}

export function getCachedCompanyProfile() {
  try {
    const raw = localStorage.getItem("microcredit_company_profile");
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { name?: string; legalName?: string; nuit?: string; logoUrl?: string; address?: string; email?: string; phone?: string };
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function buildCorporateFooterHtml({
  companyName,
  legalName,
  nuit,
  generatedBy,
  generatedRole,
  generatedAt,
}: {
  companyName: string;
  legalName: string;
  nuit: string;
  generatedBy: string;
  generatedRole: string;
  generatedAt: string;
}) {
  return `
    <div class="corp-global-footer" data-corp-footer="1">
      <div class="corp-global-footer-company">
        <strong>${escapeHtml(companyName)}</strong>
        ${legalName ? `<span> | Razao Social: ${escapeHtml(legalName)}</span>` : ""}
        ${nuit ? `<span> | NUIT: ${escapeHtml(nuit)}</span>` : ""}
      </div>
      <div class="corp-global-footer-meta">
        <span>Emitido por: ${escapeHtml(generatedBy)} (${escapeHtml(generatedRole)})</span>
        <span> | Data/Hora: ${escapeHtml(generatedAt)}</span>
      </div>
    </div>
  `;
}

const CORPORATE_FOOTER_STYLE = `
  .corp-global-footer {
    margin-top: 14px;
    padding-top: 8px;
    border-top: 1px solid #cbd5e1;
    color: #475569;
    font-size: 10px;
    line-height: 1.4;
    display: flex;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
  }
  .corp-global-footer-company { font-weight: 500; }
  .corp-global-footer-meta { color: #64748b; }
`;

const BROWSER_PRINT_CONTROLS_STYLE = `
  .corp-print-controls {
    position: sticky;
    top: 0;
    z-index: 9999;
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
    padding: 8px 10px;
    margin: -6px -6px 10px;
    border: 1px solid #cbd5e1;
    border-radius: 8px;
    background: #f8fafc;
  }
  .corp-print-btn {
    border: 1px solid #0f766e;
    background: #0f766e;
    color: #ffffff;
    border-radius: 6px;
    padding: 6px 10px;
    font-size: 12px;
    cursor: pointer;
  }
  .corp-print-btn.secondary {
    border-color: #0f172a;
    background: #0f172a;
  }
  .corp-print-note {
    color: #475569;
    font-size: 11px;
  }
  @media print {
    .corp-print-controls { display: none !important; }
  }
`;

const BROWSER_PRINT_CONTROLS_SCRIPT = `
  <script id="corp-print-controls-script">
    function corpPrintDocument() {
      window.print();
    }
    function corpDownloadPdfDocument() {
      window.print();
    }
  </script>
`;

function buildBrowserControlsHtml(landscape: boolean) {
  return `
    <div class="corp-print-controls" data-corp-controls="1">
      <button type="button" class="corp-print-btn" onclick="corpPrintDocument()">Imprimir</button>
      <button type="button" class="corp-print-btn secondary" onclick="corpDownloadPdfDocument()">Baixar PDF</button>
      <span class="corp-print-note">Formato: A4 ${landscape ? "landscape" : "portrait"}</span>
    </div>
  `;
}

export function openCorporatePrintWindow({ title, bodyHtml, landscape = false, browserControls = false, company }: PrintOptions) {
  const user = getUser();
  const cached = getCachedCompanyProfile();
  const companyName = company?.name || cached?.name || user?.companyName || "Empresa";
  const legalName = company?.legalName || cached?.legalName || "";
  const nuit = company?.nuit || cached?.nuit || "";
  const logoUrl = company?.logoUrl || cached?.logoUrl || "";
  const generatedBy = user?.fullName || "Sistema";
  const generatedRole = roleLabel(user?.role || "");
  const generatedAt = new Date().toLocaleString("pt-PT");
  const footerHtml = buildCorporateFooterHtml({
    companyName,
    legalName,
    nuit,
    generatedBy,
    generatedRole,
    generatedAt,
  });
  const a4PageStyle = `@page { size: A4 ${landscape ? "landscape" : "portrait"} !important; }`;
  const hasFullHtmlDocument = /<html[\s>]/i.test(String(bodyHtml || "")) && /<body[\s>]/i.test(String(bodyHtml || ""));
  if (hasFullHtmlDocument) {
    let fullHtml = String(bodyHtml || "");
    if (!/<\/head>/i.test(fullHtml)) {
      fullHtml = fullHtml.replace(/<html[^>]*>/i, (match) => `${match}<head></head>`);
    }
    const fullStyle = `${a4PageStyle}\n${CORPORATE_FOOTER_STYLE}${browserControls ? `\n${BROWSER_PRINT_CONTROLS_STYLE}` : ""}`;
    if (/<style[^>]+id=["']corp-global-print-style["'][^>]*>/i.test(fullHtml)) {
      fullHtml = fullHtml.replace(
        /<style[^>]+id=["']corp-global-print-style["'][^>]*>[\s\S]*?<\/style>/i,
        `<style id="corp-global-print-style">${fullStyle}</style>`,
      );
    } else {
      fullHtml = fullHtml.replace(/<\/head>/i, `<style id="corp-global-print-style">${fullStyle}</style></head>`);
    }
    if (!/data-corp-footer=["']1["']/i.test(fullHtml)) {
      if (/<\/body>/i.test(fullHtml)) {
        fullHtml = fullHtml.replace(/<\/body>/i, `${footerHtml}</body>`);
      } else {
        fullHtml = `${fullHtml}${footerHtml}`;
      }
    }
    if (browserControls) {
      if (!/data-corp-controls=["']1["']/i.test(fullHtml)) {
        if (/<body[^>]*>/i.test(fullHtml)) {
          fullHtml = fullHtml.replace(/<body([^>]*)>/i, `<body$1>${buildBrowserControlsHtml(landscape)}`);
        } else {
          fullHtml = `${buildBrowserControlsHtml(landscape)}${fullHtml}`;
        }
      }
      if (!/<script[^>]+id=["']corp-print-controls-script["'][^>]*>/i.test(fullHtml)) {
        if (/<\/body>/i.test(fullHtml)) {
          fullHtml = fullHtml.replace(/<\/body>/i, `${BROWSER_PRINT_CONTROLS_SCRIPT}</body>`);
        } else {
          fullHtml = `${fullHtml}${BROWSER_PRINT_CONTROLS_SCRIPT}`;
        }
      }
    }
    const rawWindow = window.open("", "_blank", "width=1300,height=860");
    if (!rawWindow) return false;
    rawWindow.document.open();
    rawWindow.document.write(fullHtml);
    rawWindow.document.close();
    rawWindow.focus();
    if (!browserControls) {
      setTimeout(() => rawWindow.print(), 250);
    }
    return true;
  }

  const headerHtml = `
    <div class="corp-header">
      <div class="corp-brand">
        ${logoUrl ? `<img src="${escapeHtml(logoUrl)}" class="corp-logo" alt="Logo da Empresa" />` : `<div class="corp-logo-placeholder">LOGO</div>`}
        <div>
          <h1 class="corp-name">${escapeHtml(companyName)}</h1>
          ${legalName ? `<p class="corp-sub"><strong>Razao Social:</strong> ${escapeHtml(legalName)}</p>` : ""}
          ${nuit ? `<p class="corp-sub"><strong>NUIT:</strong> ${escapeHtml(nuit)}</p>` : ""}
        </div>
      </div>
      <div class="corp-meta">
        <p><strong>Documento:</strong> ${escapeHtml(title)}</p>
        <p><strong>Gerado por:</strong> ${escapeHtml(generatedBy)}</p>
        <p><strong>Funcao:</strong> ${escapeHtml(generatedRole)}</p>
        <p><strong>Data/Hora:</strong> ${escapeHtml(generatedAt)}</p>
      </div>
    </div>
    <div class="corp-ribbon"></div>
  `;

  const w = window.open("", "_blank", "width=1300,height=860");
  if (!w) return false;
  w.document.open();
  w.document.write(`
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(title)}</title>
        <style>
          @page { size: A4 ${landscape ? "landscape" : "portrait"}; margin: 10mm; }
          body { font-family: Arial, sans-serif; margin: 10mm; color: #0f172a; }
          .corp-header { border: 1px solid #cbd5e1; border-radius: 10px; padding: 10px; display: flex; justify-content: space-between; gap: 14px; margin-bottom: 8px; background: linear-gradient(90deg,#f8fafc,#ffffff); }
          .corp-ribbon { height: 6px; width: 100%; border-radius: 99px; background: linear-gradient(90deg,#0f766e,#14b8a6,#10b981); margin-bottom: 12px; }
          .corp-brand { display: flex; gap: 12px; align-items: center; }
          .corp-logo { width: 64px; height: 64px; object-fit: cover; border: 1px solid #cbd5e1; border-radius: 8px; }
          .corp-logo-placeholder { width: 64px; height: 64px; border: 1px dashed #94a3b8; border-radius: 8px; display:flex; align-items:center; justify-content:center; color:#64748b; font-size:11px; }
          .corp-name { font-size: 18px; margin: 0; }
          .corp-sub { margin: 2px 0; color: #475569; font-size: 11px; }
          .corp-meta { font-size: 11px; min-width: 260px; }
          .corp-meta p { margin: 3px 0; }
          table { width: 100%; border-collapse: collapse; margin-top: 8px; }
          th, td { border: 1px solid #cbd5e1; padding: 7px; text-align: left; font-size: 11px; }
          th { background: #f8fafc; }
          .title { font-size: 20px; font-weight: 700; margin: 0 0 6px; }
          .sub { margin: 0 0 10px; color: #475569; font-size: 12px; }
          .muted { color: #475569; font-size: 12px; }
          .block { border:1px solid #cbd5e1; border-radius:8px; padding:10px; margin-top:10px; }
          .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 12px; }
          .kpi { border: 1px solid #cbd5e1; border-radius: 8px; padding: 8px; }
          .kpi p { margin: 0; font-size: 12px; color: #475569; }
          .kpi h3 { margin: 4px 0 0; font-size: 16px; }
          ${CORPORATE_FOOTER_STYLE}
          ${browserControls ? BROWSER_PRINT_CONTROLS_STYLE : ""}
        </style>
      </head>
      <body>${browserControls ? buildBrowserControlsHtml(landscape) : ""}${headerHtml}${bodyHtml}${footerHtml}${browserControls ? BROWSER_PRINT_CONTROLS_SCRIPT : ""}</body>
    </html>
  `);
  w.document.close();
  w.focus();
  if (!browserControls) {
    setTimeout(() => w.print(), 250);
  }
  return true;
}
