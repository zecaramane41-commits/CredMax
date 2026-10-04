/**
 * Gerador de Documentos Oficiais Pós-Desembolso (Crédito Concedido)
 * Contrato de Crédito, Confissão de Dívida, Termo de Entrega de Bens,
 * Declaração de Garantia, Autorização de Desconto Salarial, Termo de Compromisso e Comprovativo de Desembolso.
 */

import { openCorporatePrintWindow, getCachedCompanyProfile } from "./print";
import { formatCurrencyMT } from "./format";
import { getUser } from "./auth";

export type DocumentPartyData = {
  // Dados do Crédito
  contrato: string;
  valor: number;
  totalAPagar?: number;
  prazo: number;
  taxa: number;
  frequencia: string;
  tipoCredito?: string;
  dataDesembolso?: string;
  dataAprovacao?: string;
  aprovadoPor?: string;
  autorizadoPor?: string;
  desembolsadoPor?: string;
  metodoPagamento?: string;
  contaOuCarteira?: string;
  // Dados do Cliente
  clienteId?: number;
  clienteNome: string;
  clienteTipo?: string;
  nuit?: string;
  documentType?: string;
  documentNumber?: string;
  birthDate?: string;
  gender?: string;
  maritalStatus?: string;
  nationality?: string;
  naturalidade?: string;
  province?: string;
  city?: string;
  district?: string;
  neighborhood?: string;
  addressLine?: string;
  houseNumber?: string;
  occupation?: string;
  employerName?: string;
  phone?: string;
  email?: string;
  // Garantias / Avalistas
  garantiasDescricao?: string;
  garantiasValor?: number;
  avalistaNome?: string;
  avalistaNuit?: string;
  avalistaPhone?: string;
};

function getDocStyle(): string {
  return `
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700&family=Inter:wght@400;500;600;700&family=Lora:ital,wght@0,400;0,600;1,400&display=swap');
      
      * { box-sizing: border-box; }
      body {
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        color: #1e293b;
        background: #ffffff;
        font-size: 13px;
        line-height: 1.65;
        margin: 0;
        padding: 15mm 15mm 20mm 15mm;
      }

      .doc-page {
        page-break-after: always;
        position: relative;
        min-height: 250mm;
      }
      .doc-page:last-child {
        page-break-after: auto;
      }

      .doc-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        border-bottom: 2px solid #0f172a;
        padding-bottom: 12px;
        margin-bottom: 18px;
      }

      .doc-brand {
        display: flex;
        flex-direction: column;
      }

      .doc-brand-title {
        font-family: 'Cinzel', serif;
        font-size: 18px;
        font-weight: 700;
        color: #0f172a;
        letter-spacing: 0.5px;
      }

      .doc-brand-sub {
        font-size: 10px;
        color: #64748b;
        font-weight: 500;
        text-transform: uppercase;
        letter-spacing: 1px;
      }

      .doc-meta-right {
        text-align: right;
        font-size: 11px;
        color: #334155;
        line-height: 1.4;
      }

      .doc-meta-right .time { font-weight: 600; font-family: monospace; }
      .doc-meta-right .operator { font-weight: 700; color: #0f172a; text-transform: uppercase; }

      .doc-title-box {
        border: 1.5px solid #0f172a;
        background: #f8fafc;
        padding: 8px 16px;
        text-align: center;
        margin: 16px 0 24px 0;
      }

      .doc-title-text {
        font-family: 'Cinzel', serif;
        font-size: 15px;
        font-weight: 700;
        color: #0f172a;
        letter-spacing: 1px;
        margin: 0;
        text-transform: uppercase;
      }

      .doc-body {
        text-align: justify;
        font-size: 12.5px;
        color: #1e293b;
        line-height: 1.75;
      }

      .doc-body p {
        margin: 0 0 14px 0;
        text-indent: 20px;
      }

      .doc-body p.no-indent {
        text-indent: 0;
      }

      .doc-highlight {
        font-weight: 600;
        color: #0f172a;
      }

      .doc-clause {
        margin-bottom: 12px;
      }

      .doc-clause-title {
        font-weight: 700;
        color: #0f172a;
        text-transform: uppercase;
        font-size: 11.5px;
        margin-bottom: 2px;
      }

      .doc-table {
        width: 100%;
        border-collapse: collapse;
        margin: 14px 0;
        font-size: 11.5px;
      }

      .doc-table th, .doc-table td {
        border: 1px solid #cbd5e1;
        padding: 6px 10px;
        text-align: left;
      }

      .doc-table th {
        background: #f1f5f9;
        font-weight: 600;
        color: #334155;
      }

      .doc-signatures {
        margin-top: 40px;
        display: flex;
        justify-content: space-around;
        gap: 30px;
        text-align: center;
      }

      .doc-signature-block {
        flex: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
      }

      .doc-sig-line {
        width: 80%;
        border-top: 1px solid #0f172a;
        margin-bottom: 6px;
      }

      .doc-sig-name {
        font-weight: 700;
        font-size: 12px;
        color: #0f172a;
      }

      .doc-sig-role {
        font-size: 10.5px;
        color: #64748b;
      }

      .doc-footer-bar {
        position: absolute;
        bottom: 0;
        left: 0;
        right: 0;
        border-top: 1px solid #cbd5e1;
        padding-top: 8px;
        font-size: 9.5px;
        color: #64748b;
        text-align: center;
        line-height: 1.4;
      }

      @media print {
        body { padding: 0; }
        .doc-page { min-height: 100vh; }
      }
    </style>
  `;
}

function buildHeaderHtml(companyName: string, now: Date, operator: string): string {
  const timeStr = now.toTimeString().slice(0, 8);
  const dateStr = `${String(now.getDate()).padStart(2, "0")}/${String(now.getMonth() + 1).padStart(2, "0")}/${now.getFullYear()}`;
  return `
    <div class="doc-header">
      <div class="doc-brand">
        <span class="doc-brand-title">${companyName || "MSU MICROCRÉDITO"}</span>
        <span class="doc-brand-sub">Instituição de Finanças e Microcrédito</span>
      </div>
      <div class="doc-meta-right">
        <div class="time">${timeStr}</div>
        <div>${dateStr}</div>
        <div class="operator">${operator || "OPERADOR"}</div>
      </div>
    </div>
  `;
}

function buildFooterHtml(company: any): string {
  const name = company?.name || "Tin Microcrédito";
  const address = company?.address || "Moatize En7, 1º Andar, Paragem Matchikitchiki";
  const email = company?.email || "hoyohoyomicrocredito1@gmail.com";
  const phone = company?.phone || "878591645";
  const nuit = company?.nuit || "117078361";

  return `
    <div class="doc-footer-bar">
      ${name} — ${address} · ${email} · Tel: ${phone} · NUIT: ${nuit}
    </div>
  `;
}

/**
 * 1. AUTORIZAÇÃO DE DESCONTO SALARIAL
 * Modelo idêntico ao modelo oficial institucional fornecido.
 */
export function buildAutorizacaoDescontoSalarialHtml(data: DocumentPartyData, company: any, operator: string): string {
  const now = new Date();
  const companyName = company?.name || "Tin Microcrédito";
  const clientName = data.clienteNome || "Nome do Cliente";
  const maritalStatus = data.maritalStatus || "solteiro(a)";
  const docType = data.documentType || "BI (Bilhete de Identidade)";
  const docNumber = data.documentNumber || "—";
  const naturalidade = data.naturalidade || data.province || "Tete";
  const residencia = data.city || data.province || "Tete";
  const bairro = data.neighborhood || "Bairro Central";
  const quarteirao = data.houseNumber || "0";
  const contrato = data.contrato || "S/N";

  return `
    <div class="doc-page">
      ${buildHeaderHtml(companyName, now, operator)}
      
      <div class="doc-title-box">
        <h1 class="doc-title-text">AUTORIZAÇÃO DO DESCONTO SALÁRIAL</h1>
      </div>

      <div class="doc-body">
        <p>
          De acordo com o empréstimo contraído na <span class="doc-highlight">${companyName}</span>, comprovado pelo contrato de crédito nº <span class="doc-highlight">${contrato}</span> em anexo, eu, <span class="doc-highlight">${clientName}</span>, ${maritalStatus}, portador(a) do(a) ${docType} Nº <span class="doc-highlight">${docNumber}</span>, natural de ${naturalidade}, residente em ${residencia}, Bairro do(a) ${bairro}, quarteirão Nº ${quarteirao}, casa Nº ${data.houseNumber || "S/N"}, autorizo a empresa empregadora para descontar do meu salário a prestação mais juros de mora, sempre que ${companyName} o solicite e de forma imediata.
        </p>

        <p class="no-indent" style="margin-top: 24px; font-weight: 500;">
          Esta autorização é válida até que o crédito seja amortizado por completo.
        </p>

        <p class="no-indent" style="margin-top: 24px; font-weight: 500;">
          O referido valor deve ser pago directamente ao crédito no respectivo balcão ou nas respectivas contas bancárias da instituição credora.
        </p>

        <div style="text-align: center; margin-top: 60px;">
          <p class="no-indent" style="font-size: 13px; font-weight: 600; margin-bottom: 50px;">Saudações</p>
          
          <div style="display: inline-block; width: 320px; border-top: 1px solid #0f172a; padding-top: 6px;">
            <div style="font-weight: 700; font-size: 13px; color: #0f172a;">${clientName}</div>
            <div style="font-size: 11px; color: #64748b;">Assinatura do(a) Proponente</div>
          </div>
        </div>
      </div>

      ${buildFooterHtml(company)}
    </div>
  `;
}

/**
 * 2. CONTRATO DE CRÉDITO / MÚTUO
 */
export function buildContratoCreditoHtml(data: DocumentPartyData, company: any, operator: string): string {
  const now = new Date();
  const companyName = company?.name || "Tin Microcrédito";
  const clientName = data.clienteNome || "Nome do Cliente";
  const docType = data.documentType || "BI";
  const docNumber = data.documentNumber || "—";
  const valor = formatCurrencyMT(data.valor || 0);
  const total = formatCurrencyMT(data.totalAPagar || (data.valor * (1 + (data.taxa || 5) / 100)));
  const taxa = data.taxa || 5;
  const prazo = data.prazo || 1;
  const frequencia = data.frequencia || "mensal";
  const contrato = data.contrato || "S/N";

  return `
    <div class="doc-page">
      ${buildHeaderHtml(companyName, now, operator)}
      
      <div class="doc-title-box">
        <h1 class="doc-title-text">CONTRATO DE CONCESSÃO DE CRÉDITO Nº ${contrato}</h1>
      </div>

      <div class="doc-body">
        <p>
          Entre a <span class="doc-highlight">${companyName}</span>, doravante denominada <strong>CREDORA</strong>, e <span class="doc-highlight">${clientName}</span>, titular do NUIT <span class="doc-highlight">${data.nuit || "—"}</span>, portador(a) do ${docType} nº <span class="doc-highlight">${docNumber}</span>, residente em ${data.city || data.province || "Moçambique"}, doravante denominado(a) <strong>DEVEDOR(A)</strong>, é celebrado o presente Contrato de Crédito, que se rege pelas seguintes cláusulas:
        </p>

        <div class="doc-clause">
          <div class="doc-clause-title">Cláusula 1ª (Objecto e Montante)</div>
          <div>A CREDORA concede ao DEVEDOR um empréstimo no valor de <span class="doc-highlight">${valor}</span>, a ser amortizado no prazo de <span class="doc-highlight">${prazo} meses</span> com periodicidade <span class="doc-highlight">${frequencia}</span>.</div>
        </div>

        <div class="doc-clause">
          <div class="doc-clause-title">Cláusula 2ª (Remuneração e Encargos)</div>
          <div>O montante mutuado vence juros mensais à taxa acordada de <span class="doc-highlight">${taxa}%</span>, perfazendo o montante global de reembolso de <span class="doc-highlight">${total}</span>.</div>
        </div>

        <div class="doc-clause">
          <div class="doc-clause-title">Cláusula 3ª (Pagamentos e Mora)</div>
          <div>O não pagamento de qualquer prestação na data de vencimento estipulada constitui o DEVEDOR em mora automática, sujeitando-se à aplicação da taxa de penalização em vigor e ao vencimento antecipado de toda a dívida.</div>
        </div>

        <div class="doc-clause">
          <div class="doc-clause-title">Cláusula 4ª (Garantias e Execução)</div>
          <div>O cumprimento integral das obrigações assumidas é garantido pelo património pessoal do DEVEDOR e pelas garantias materiais/pessoais associadas.</div>
        </div>

        <table class="doc-table">
          <thead>
            <tr><th>Nº Contrato</th><th>Capital Mutuado</th><th>Taxa Mensal</th><th>Prazo</th><th>Total a Reembolsar</th></tr>
          </thead>
          <tbody>
            <tr>
              <td><strong>${contrato}</strong></td>
              <td>${valor}</td>
              <td>${taxa}%</td>
              <td>${prazo} meses (${frequencia})</td>
              <td><strong>${total}</strong></td>
            </tr>
          </tbody>
        </table>

        <div class="doc-signatures">
          <div class="doc-signature-block">
            <div class="doc-sig-line"></div>
            <div class="doc-sig-name">${clientName}</div>
            <div class="doc-sig-role">O(A) Devedor(a)</div>
          </div>
          <div class="doc-signature-block">
            <div class="doc-sig-line"></div>
            <div class="doc-sig-name">${companyName}</div>
            <div class="doc-sig-role">Pela Credora / Direcção</div>
          </div>
        </div>
      </div>

      ${buildFooterHtml(company)}
    </div>
  `;
}

/**
 * 3. CONFISSÃO DE DÍVIDA
 */
export function buildConfissaoDividaHtml(data: DocumentPartyData, company: any, operator: string): string {
  const now = new Date();
  const companyName = company?.name || "Tin Microcrédito";
  const clientName = data.clienteNome || "Nome do Cliente";
  const valor = formatCurrencyMT(data.totalAPagar || data.valor || 0);
  const contrato = data.contrato || "S/N";

  return `
    <div class="doc-page">
      ${buildHeaderHtml(companyName, now, operator)}
      
      <div class="doc-title-box">
        <h1 class="doc-title-text">ESCRITURA PARTICULAR DE CONFISSÃO DE DÍVIDA</h1>
      </div>

      <div class="doc-body">
        <p>
          Pelo presente instrumento particular, eu, <span class="doc-highlight">${clientName}</span>, portador(a) do ${data.documentType || "BI"} nº <span class="doc-highlight">${data.documentNumber || "—"}</span>, com o NUIT <span class="doc-highlight">${data.nuit || "—"}</span>, residente em ${data.city || data.province || "Moçambique"}, <strong>RECONHEÇO E CONFESSO EXPRESSAMENTE</strong> ser devedor(a) à <span class="doc-highlight">${companyName}</span> da quantia líquida, certa e exigível de <span class="doc-highlight">${valor}</span>, referente ao crédito concedido sob o Contrato nº <span class="doc-highlight">${contrato}</span>.
        </p>

        <p>
          Comprometo-me, de forma irrevogável e irretratável, a liquidar o referido valor integralmente conforme o plano de pagamento aprovado. Em caso de incumprimento, autorizo a execução imediata deste título executivo extrajudicial, acrescido de todas as despesas judiciais e extrajudiciais decorrentes da cobrança.
        </p>

        <div style="margin-top: 30px;">
          <p class="no-indent" style="font-style: italic;">
            Por ser verdade e reflectir a minha livre vontade, assino o presente termo na presença de testemunhas idóneas.
          </p>
        </div>

        <div class="doc-signatures">
          <div class="doc-signature-block">
            <div class="doc-sig-line"></div>
            <div class="doc-sig-name">${clientName}</div>
            <div class="doc-sig-role">Devedor(a) Confitente</div>
          </div>
          ${
            data.avalistaNome
              ? `
              <div class="doc-signature-block">
                <div class="doc-sig-line"></div>
                <div class="doc-sig-name">${data.avalistaNome}</div>
                <div class="doc-sig-role">Avalista / Fiador Solidário</div>
              </div>
            `
              : `
              <div class="doc-signature-block">
                <div class="doc-sig-line"></div>
                <div class="doc-sig-name">Testemunha / Oficial de Crédito</div>
                <div class="doc-sig-role">${companyName}</div>
              </div>
            `
          }
        </div>
      </div>

      ${buildFooterHtml(company)}
    </div>
  `;
}

/**
 * 4. TERMO DE ENTREGA DOS BENS
 */
export function buildTermoEntregaBensHtml(data: DocumentPartyData, company: any, operator: string): string {
  const now = new Date();
  const companyName = company?.name || "Tin Microcrédito";
  const clientName = data.clienteNome || "Nome do Cliente";
  const contrato = data.contrato || "S/N";
  const bens = data.garantiasDescricao || "Bens móveis/equipamentos/documentos de titularidade descritos na ficha cadastral.";
  const valorBens = data.garantiasValor ? formatCurrencyMT(data.garantiasValor) : "Conforme avaliação";

  return `
    <div class="doc-page">
      ${buildHeaderHtml(companyName, now, operator)}
      
      <div class="doc-title-box">
        <h1 class="doc-title-text">TERMO DE ENTREGA E DEPÓSITO DE BENS</h1>
      </div>

      <div class="doc-body">
        <p>
          Pelo presente instrumento, o(a) Sr(a). <span class="doc-highlight">${clientName}</span>, referente ao crédito nº <span class="doc-highlight">${contrato}</span>, procede à entrega física / caucionamento dos seguintes bens em favor da <span class="doc-highlight">${companyName}</span> como garantia de boa cobrança do crédito:
        </p>

        <div style="background: #f8fafc; border: 1px solid #cbd5e1; padding: 14px; border-radius: 6px; margin: 16px 0;">
          <div style="font-weight: 700; color: #0f172a; margin-bottom: 6px;">DISCRIMINAÇÃO DOS BENS ENTREGUES:</div>
          <div style="font-size: 12px; color: #334155;">${bens}</div>
          <div style="margin-top: 8px; font-weight: 600; color: #0f172a;">Valor Total Estimado: ${valorBens}</div>
        </div>

        <p>
          A CREDORA assume a responsabilidade de fiel depositária dos referidos bens, comprometendo-se a restituí-los em perfeito estado de conservação logo após a liquidação integral de todas as obrigações financeiras decorrentes do crédito contratado.
        </p>

        <div class="doc-signatures">
          <div class="doc-signature-block">
            <div class="doc-sig-line"></div>
            <div class="doc-sig-name">${clientName}</div>
            <div class="doc-sig-role">Depositante (Cliente)</div>
          </div>
          <div class="doc-signature-block">
            <div class="doc-sig-line"></div>
            <div class="doc-sig-name">${companyName}</div>
            <div class="doc-sig-role">Fiel Depositário (Credora)</div>
          </div>
        </div>
      </div>

      ${buildFooterHtml(company)}
    </div>
  `;
}

/**
 * 5. DECLARAÇÃO DE GARANTIA DOS BENS
 */
export function buildDeclaracaoGarantiaHtml(data: DocumentPartyData, company: any, operator: string): string {
  const now = new Date();
  const companyName = company?.name || "Tin Microcrédito";
  const clientName = data.clienteNome || "Nome do Cliente";
  const contrato = data.contrato || "S/N";
  const bens = data.garantiasDescricao || "Bens materiais e patrimoniais listados no processo de adesão de crédito.";

  return `
    <div class="doc-page">
      ${buildHeaderHtml(companyName, now, operator)}
      
      <div class="doc-title-box">
        <h1 class="doc-title-text">DECLARAÇÃO DE CONSTITUIÇÃO DE GARANTIA</h1>
      </div>

      <div class="doc-body">
        <p>
          Eu, <span class="doc-highlight">${clientName}</span>, titular do ${data.documentType || "BI"} nº <span class="doc-highlight">${data.documentNumber || "—"}</span>, <strong>DECLARO SOB COMPROMISSO DE HONRA</strong> ser o(a) único(a) e legítimo(a) proprietário(a) dos bens oferecidos em garantia ao empréstimo nº <span class="doc-highlight">${contrato}</span>, estando os mesmos livres e desembaraçados de quaisquer ónus, penhoras ou litígios judiciais:
        </p>

        <div style="background: #f8fafc; border: 1px solid #cbd5e1; padding: 14px; border-radius: 6px; margin: 16px 0;">
          <div style="font-weight: 700; color: #0f172a; margin-bottom: 4px;">ESPECIFICAÇÃO DA GARANTIA CONSTITUÍDA:</div>
          <div>${bens}</div>
        </div>

        <p>
          Declaro estar ciente de que a alienação, ocultação, danificação ou cedência destes bens a terceiros antes da extinção da dívida constituirá crime de burla e desobediência nos termos da legislação penal vigente.
        </p>

        <div class="doc-signatures">
          <div class="doc-signature-block">
            <div class="doc-sig-line"></div>
            <div class="doc-sig-name">${clientName}</div>
            <div class="doc-sig-role">Declarante / Titular dos Bens</div>
          </div>
          <div class="doc-signature-block">
            <div class="doc-sig-line"></div>
            <div class="doc-sig-name">${companyName}</div>
            <div class="doc-sig-role">Recepção e Visto</div>
          </div>
        </div>
      </div>

      ${buildFooterHtml(company)}
    </div>
  `;
}

/**
 * 6. TERMO DE COMPROMISSO
 */
export function buildTermoCompromissoHtml(data: DocumentPartyData, company: any, operator: string): string {
  const now = new Date();
  const companyName = company?.name || "Tin Microcrédito";
  const clientName = data.clienteNome || "Nome do Cliente";
  const valor = formatCurrencyMT(data.valor || 0);
  const contrato = data.contrato || "S/N";

  return `
    <div class="doc-page">
      ${buildHeaderHtml(companyName, now, operator)}
      
      <div class="doc-title-box">
        <h1 class="doc-title-text">TERMO DE COMPROMISSO E RESPONSABILIDADE</h1>
      </div>

      <div class="doc-body">
        <p>
          Eu, <span class="doc-highlight">${clientName}</span>, beneficiário(a) do crédito no valor de <span class="doc-highlight">${valor}</span> sob o Contrato nº <span class="doc-highlight">${contrato}</span>, assumo perante a <span class="doc-highlight">${companyName}</span> o solene compromisso de honrar integralmente os pagamentos acordados, respeitando rigorosamente as datas de vencimento de cada prestação.
        </p>

        <p>
          Comprometo-me igualmente a informar de imediato à instituição qualquer alteração de residência, contacto telefónico, local de trabalho ou situação profissional até à total extinção do empréstimo.
        </p>

        <div class="doc-signatures">
          <div class="doc-signature-block">
            <div class="doc-sig-line"></div>
            <div class="doc-sig-name">${clientName}</div>
            <div class="doc-sig-role">Assinatura do(a) Mutuário(a)</div>
          </div>
          <div class="doc-signature-block">
            <div class="doc-sig-line"></div>
            <div class="doc-sig-name">${companyName}</div>
            <div class="doc-sig-role">Testemunha Institucional</div>
          </div>
        </div>
      </div>

      ${buildFooterHtml(company)}
    </div>
  `;
}

/**
 * 7. COMPROVATIVO DE DESEMBOLSO / RECIBO OFICIAL
 */
export function buildComprovanteDesembolsoHtml(data: DocumentPartyData, company: any, operator: string): string {
  const now = new Date();
  const companyName = company?.name || "Tin Microcrédito";
  const clientName = data.clienteNome || "Nome do Cliente";
  const valor = formatCurrencyMT(data.valor || 0);
  const contrato = data.contrato || "S/N";
  const metodo = data.metodoPagamento || "Transferência Bancária / Carteira Móvel";

  return `
    <div class="doc-page">
      ${buildHeaderHtml(companyName, now, operator)}
      
      <div class="doc-title-box">
        <h1 class="doc-title-text">RECIBO / COMPROVATIVO OFICIAL DE DESEMBOLSO</h1>
      </div>

      <div class="doc-body">
        <p>
          A <span class="doc-highlight">${companyName}</span> declara ter efectuado o desembolso e a entrega integral dos fundos referentes ao Contrato de Crédito nº <span class="doc-highlight">${contrato}</span> a favor de <span class="doc-highlight">${clientName}</span>, nos termos abaixo discriminados:
        </p>

        <table class="doc-table">
          <tbody>
            <tr><th style="width: 35%;">Número do Contrato</th><td><strong>${contrato}</strong></td></tr>
            <tr><th>Beneficiário</th><td>${clientName} (${data.nuit || "NUIT não informado"})</td></tr>
            <tr><th>Montante Desembolsado</th><td><strong style="color: #059669; font-size: 13px;">${valor}</strong></td></tr>
            <tr><th>Modalidade de Pagamento</th><td>${metodo}</td></tr>
            <tr><th>Conta / Nº Destino</th><td>${data.contaOuCarteira || "Conforme acordado"}</td></tr>
            <tr><th>Data e Hora do Desembolso</th><td>${now.toLocaleString("pt-PT")}</td></tr>
            <tr><th>Operador Responsável</th><td>${operator || "Administração"}</td></tr>
          </tbody>
        </table>

        <p class="no-indent" style="margin-top: 20px; font-weight: 500;">
          Declaro que recebi o valor acima mencionado na sua totalidade e em perfeita conformidade com as condições acordadas.
        </p>

        <div class="doc-signatures">
          <div class="doc-signature-block">
            <div class="doc-sig-line"></div>
            <div class="doc-sig-name">${clientName}</div>
            <div class="doc-sig-role">Beneficiário(a) / Recebedor(a)</div>
          </div>
          <div class="doc-signature-block">
            <div class="doc-sig-line"></div>
            <div class="doc-sig-name">${companyName}</div>
            <div class="doc-sig-role">Tesouraria / Operações</div>
          </div>
        </div>
      </div>

      ${buildFooterHtml(company)}
    </div>
  `;
}

/**
 * Funções de Impressão Direta Corporativa
 */
export function printDocumentoCredito(
  tipo: "contrato" | "confissao" | "termo_bens" | "declaracao_garantia" | "desconto_salarial" | "termo_compromisso" | "recibo_desembolso" | "dossie_completo",
  data: DocumentPartyData,
) {
  const user = getUser();
  const company = getCachedCompanyProfile();
  const operator = user?.fullName || user?.name || "Operador";

  let bodyHtml = getDocStyle();
  let docTitle = "Documento de Crédito";

  switch (tipo) {
    case "desconto_salarial":
      docTitle = `Autorizacao_Desconto_Salarial_${data.contrato}`;
      bodyHtml += buildAutorizacaoDescontoSalarialHtml(data, company, operator);
      break;
    case "contrato":
      docTitle = `Contrato_Credito_${data.contrato}`;
      bodyHtml += buildContratoCreditoHtml(data, company, operator);
      break;
    case "confissao":
      docTitle = `Confissao_Divida_${data.contrato}`;
      bodyHtml += buildConfissaoDividaHtml(data, company, operator);
      break;
    case "termo_bens":
      docTitle = `Termo_Entrega_Bens_${data.contrato}`;
      bodyHtml += buildTermoEntregaBensHtml(data, company, operator);
      break;
    case "declaracao_garantia":
      docTitle = `Declaracao_Garantia_${data.contrato}`;
      bodyHtml += buildDeclaracaoGarantiaHtml(data, company, operator);
      break;
    case "termo_compromisso":
      docTitle = `Termo_Compromisso_${data.contrato}`;
      bodyHtml += buildTermoCompromissoHtml(data, company, operator);
      break;
    case "recibo_desembolso":
      docTitle = `Recibo_Desembolso_${data.contrato}`;
      bodyHtml += buildComprovanteDesembolsoHtml(data, company, operator);
      break;
    case "dossie_completo":
      docTitle = `Dossie_Completo_Credito_${data.contrato}`;
      bodyHtml += buildContratoCreditoHtml(data, company, operator);
      bodyHtml += buildConfissaoDividaHtml(data, company, operator);
      bodyHtml += buildAutorizacaoDescontoSalarialHtml(data, company, operator);
      bodyHtml += buildDeclaracaoGarantiaHtml(data, company, operator);
      bodyHtml += buildTermoEntregaBensHtml(data, company, operator);
      bodyHtml += buildTermoCompromissoHtml(data, company, operator);
      bodyHtml += buildComprovanteDesembolsoHtml(data, company, operator);
      break;
  }

  openCorporatePrintWindow({
    title: docTitle,
    bodyHtml,
    landscape: false,
    company,
  });
}
