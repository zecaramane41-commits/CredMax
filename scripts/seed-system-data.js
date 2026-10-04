/**
 * Script de popular dados de exemplo para o sistema MSU Microcrédito
 * Execução: node scripts/seed-system-data.js
 * 
 * Este script cria:
 * - 5 clientes (1 singular, 1 empresa, 1 grupo com 3 membros)
 * - 3 pedidos de crédito em diferentes estágios
 * - 1 crédito ativo desembolsado com parcelas
 * - 1 histórico de reembolsos
 */

const { JSDOM } = require("jsdom");

function seedSystemData() {
  console.log("🌱 Inicializando sistema com dados de exemplo...");

  // Setup localStorage
  const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>");
  global.localStorage = dom.window.localStorage;
  global.console = console;

  // --- Clientes de Exemplo ---
  const clientes = [
    {
      id: 1,
      name: "Maria Celestina",
      type: "singular",
      nuit: "123456789",
      phone: "+258841234567",
      email: "maria@example.com",
      monthlyIncome: 8500,
      monthlyExpenses: 4200,
      score: 720,
      status: "active",
      loans: 0,
      debt: 0,
      registrationDate: "2024-01-15",
      documentType: "BI",
      documentNumber: "123456789",
      occupation: "Vendedora",
      businessName: "",
      businessSector: "",
      groupName: "",
      employerName: "Loja Central",
    },
    {
      id: 2,
      name: "João Export-Import Lda",
      type: "empresa",
      nuit: "987654321",
      phone: "+258842567890",
      email: "joao@empresa.co.mz",
      monthlyIncome: 150000,
      monthlyExpenses: 90000,
      score: 780,
      status: "active",
      loans: 0,
      debt: 0,
      registrationDate: "2024-02-20",
      documentType: "NUIT",
      documentNumber: "987654321",
      occupation: "Comerciante",
      businessName: "João Export-Import Lda",
      businessSector: "Comércio Internacional",
      groupName: "",
      employerName: "",
    },
    {
      id: 3,
      name: "Grupo Esperança",
      type: "grupo",
      nuit: "",
      phone: "+258843456789",
      email: "",
      monthlyIncome: 25000,
      monthlyExpenses: 12000,
      score: 700,
      status: "active",
      loans: 0,
      debt: 0,
      registrationDate: "2024-03-01",
      documentType: "BI",
      documentNumber: "",
      occupation: "",
      businessName: "",
      businessSector: "",
      groupName: "Grupo Esperança",
      employerName: "",
      groupDescription: "Grupo solidário de 3 mulheres empreendedoras",
      groupLeaderName: "Maria Celestina",
      groupMembers: [
        { memberClientId: 1, memberName: "Maria Celestina", allocationAmount: 15000 },
        { memberClientId: 4, memberName: "Ana Paulo", allocationAmount: 10000 },
        { memberClientId: 5, memberName: "Rosa", allocationAmount: 8000 },
      ],
    },
    {
      id: 4,
      name: "Ana Paulo",
      type: "singular",
      nuit: "456789123",
      phone: "+258844567890",
      email: "ana@example.com",
      monthlyIncome: 6500,
      monthlyExpenses: 3000,
      score: 680,
      status: "active",
      loans: 0,
      debt: 0,
      registrationDate: "2024-03-10",
      documentType: "BI",
      documentNumber: "456789123",
      occupation: "Costureira",
      businessName: "",
      businessSector: "",
      groupName: "Grupo Esperança",
      employerName: "",
    },
    {
      id: 5,
      name: "Rosa Fernando",
      type: "singular",
      nuit: "789123456",
      phone: "+258845678901",
      email: "rosa@example.com",
      monthlyIncome: 5500,
      monthlyExpenses: 2500,
      score: 690,
      status: "active",
      loans: 0,
      debt: 0,
      registrationDate: "2024-03-12",
      documentType: "BI",
      documentNumber: "789123456",
      occupation: "Vendedora ambulante",
      businessName: "",
      businessSector: "",
      groupName: "Grupo Esperança",
      employerName: "",
    },
  ];

  localStorage.setItem("msu_clients", JSON.stringify(clientes));
  console.log(`✅ ${clientes.length} clientes criados`);

  // --- Pedidos de Crédito ---
  const pedidos = [
    {
      id: 1001,
      clienteId: 1,
      cliente: "Maria Celestina",
      clienteType: "singular",
      valor: 25000,
      tipoCredito: "Consumo",
      prazo: 12,
      taxa: 5,
      frequencia: "Mensal",
      mesReferencia: "2024-06",
      reemprestimo: false,
      isGrupo: false,
      membros: [],
      estado: "pendente",
      data: "2024-06-15",
      valorAprovado: 25000,
      valorAutorizado: 25000,
      valorDesembolsado: 25000,
      dataAnalise: "2024-06-16",
      dataAprovacao: "2024-06-17",
      dataAutorizacao: "2024-06-18",
      dataDesembolso: "2024-06-20",
      valorPago: 0,
      aprovadoPor: "Ana Silva",
      autorizadoPor: "Carlos Santos",
      desembolsadoPor: "Pedro Costa",
    },
    {
      id: 1002,
      clienteId: 2,
      cliente: "João Export-Import Lda",
      clienteType: "empresa",
      valor: 500000,
      tipoCredito: "Negócio",
      prazo: 24,
      taxa: 4.5,
      frequencia: "Mensal",
      mesReferencia: "2024-06",
      reemprestimo: false,
      isGrupo: false,
      membros: [],
      estado: "em_analise",
      data: "2024-06-18",
      dataAnalise: "",
      dataAprovacao: "",
      dataAutorizacao: "",
      dataDesembolso: "",
      valorPago: 0,
    },
    {
      id: 1003,
      clienteId: 3,
      cliente: "Grupo Esperança",
      clienteType: "grupo",
      valor: 33000,
      tipoCredito: "Negócio",
      prazo: 12,
      taxa: 5,
      frequencia: "Mensal",
      mesReferencia: "2024-06",
      reemprestimo: false,
      isGrupo: true,
      membros: [
        { memberName: "Maria Celestina", amount: 15000 },
        { memberName: "Ana Paulo", amount: 10000 },
        { memberName: "Rosa Fernando", amount: 8000 },
      ],
      estado: "aprovado",
      data: "2024-06-10",
      dataAnalise: "2024-06-11",
      dataAprovacao: "2024-06-12",
      valorAprovado: 33000,
      valorAutorizado: 0,
      valorDesembolsado: 0,
      valorPago: 0,
      aprovadoPor: "Carlos Santos",
      autorizadoPor: "",
      desembolsadoPor: "",
    },
  ];

  localStorage.setItem("msu_pedidos", JSON.stringify(pedidos));
  console.log(`✅ ${pedidos.length} pedidos de crédito criados`);

  // --- Crédito Ativo (Desembolsado) ---
  const hoje = new Date();
  const parcelas = [];
  const valorParcela = 25000 * (1 + 0.05 * 12) / 12;

  for (let i = 1; i <= 12; i++) {
    const venc = new Date(hoje.getFullYear(), hoje.getMonth() + i, 15);
    const vencStr = `${String(venc.getDate()).padStart(2, "0")}/${String(venc.getMonth() + 1).padStart(2, "0")}/${venc.getFullYear()}`;
    const pago = i <= 2;
    parcelas.push({
      numParcela: i,
      dataVencimento: vencStr,
      valor: valorParcela,
      status: pago ? "pago" : "pendente",
      dataPagamento: pago ? vencStr : null,
      valorPago: pago ? valorParcela : 0,
    });
  }

  const creditosAtivos = [
    {
      id: 5001,
      pedidoId: 1001,
      clienteId: 1,
      cliente: "Maria Celestina",
      clienteType: "singular",
      contrato: `CT-2024-${String(1001).slice(-5)}`,
      valorSolicitado: 25000,
      totalAPagar: 40000,
      totalPago: 4600,
      saldoDevedor: 35400,
      prazo: 12,
      taxa: 5,
      frequencia: "Mensal",
      tipoCredito: "Consumo",
      mesReferencia: "2024-06",
      reemprestimo: false,
      membros: [],
      parcelas,
      estado: "ativo",
      dataDesembolso: `${String(hoje.getDate()).padStart(2, "0")}/${String(hoje.getMonth() + 1).padStart(2, "0")}/${hoje.getFullYear()}`,
      mora: 0,
      prestacoesAtrasadas: 0,
    },
  ];

  localStorage.setItem("msu_creditos_ativos", JSON.stringify(creditosAtivos));
  console.log(`✅ ${creditosAtivos.length} créditos ativos criados`);

  // --- Histórico de Reembolsos ---
  const historico = [
    {
      id: 9001,
      data: `${String(hoje.getDate() - 30).padStart(2, "0")}/${String(hoje.getMonth() + 1).padStart(2, "0")}/${hoje.getFullYear()}`,
      cliente: "Maria Celestina",
      gestor: "Pedro Costa",
      parcela: 1,
      valor: 2300,
      mora: 0,
      capital: 2100,
      contaDestino: "EMOLA",
      numeroRecibo: "REC-2024-001",
      observacao: "Pagamento pontual",
    },
    {
      id: 9002,
      data: `${String(hoje.getDate() - 15).padStart(2, "0")}/${String(hoje.getMonth() + 1).padStart(2, "0")}/${hoje.getFullYear()}`,
      cliente: "Maria Celestina",
      gestor: "Ana Silva",
      parcela: 2,
      valor: 2300,
      mora: 0,
      capital: 2100,
      contaDestino: "MPESA",
      numeroRecibo: "REC-2024-002",
      observacao: "Pagamento pontual",
    },
  ];

  localStorage.setItem("msu_historico_pagamentos", JSON.stringify(historico));
  console.log(`✅ ${historico.length} reembolsos registados`);

  console.log("\n✅ Sistema populado com dados de exemplo com sucesso!");
  console.log("   Os dados estão disponíveis no localStorage do browser.");
}

seedSystemData();