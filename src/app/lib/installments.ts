import type { Frequency, Installment } from '../../../shared/types';

export const DIAS_SEMANA_NOMES = [
  { day: 0, label: 'Domingo', short: 'Dom' },
  { day: 1, label: 'Segunda-feira', short: 'Seg' },
  { day: 2, label: 'Terça-feira', short: 'Ter' },
  { day: 3, label: 'Quarta-feira', short: 'Qua' },
  { day: 4, label: 'Quinta-feira', short: 'Qui' },
  { day: 5, label: 'Sexta-feira', short: 'Sex' },
  { day: 6, label: 'Sábado', short: 'Sáb' },
];

export const DIAS_UTEIS_PADRAO = [1, 2, 3, 4, 5]; // Seg a Sex
export const DIAS_SEG_SAB = [1, 2, 3, 4, 5, 6]; // Seg a Sáb
export const DIAS_TODOS = [0, 1, 2, 3, 4, 5, 6]; // Dom a Sáb
export const DIAS_ALTERNADOS = [1, 3, 5]; // Seg, Qua, Sex

/**
 * Calcula a prestação mensal base (PMT), juros totais e montante total a pagar
 * usando a fórmula padrão da Tabela Price (ou SAC).
 *
 * Fórmula Price:
 * PMT = (PV * i) / (1 - (1 + i)^(-n))
 * Total a Pagar = PMT * n
 * Juros Totais = Total a Pagar - PV
 *
 * Exemplo:
 * 50.000 MT a 30% a.m. por 2 meses:
 * PMT = (50000 * 0.30) / (1 - (1.30)^-2) = 36.739,14 MT
 * Total a Pagar = 73.478,26 MT
 * Juros Totais = 23.478,26 MT
 */
export function calculateFinancialSummary(
  principal: number,
  periodMonths: number,
  monthlyRatePercent: number,
  method: "price" | "sac" | string = "price"
) {
  const pv = Math.max(0, Number(principal) || 0);
  const n = Math.max(1, Number(periodMonths) || 1);
  const i = Math.max(0, Number(monthlyRatePercent) || 0) / 100;

  if (pv === 0) {
    return {
      principal: 0,
      periodMonths: n,
      monthlyRatePercent,
      monthlyPayment: 0,
      totalInterest: 0,
      totalToPay: 0,
    };
  }

  if (i === 0) {
    const pmt = Number((pv / n).toFixed(2));
    return {
      principal: pv,
      periodMonths: n,
      monthlyRatePercent: 0,
      monthlyPayment: pmt,
      totalInterest: 0,
      totalToPay: pv,
    };
  }

  if (method === "sac") {
    const totalInterest = Number(((pv * i * (n + 1)) / 2).toFixed(2));
    const totalToPay = Number((pv + totalInterest).toFixed(2));
    const avgMonthlyPayment = Number((totalToPay / n).toFixed(2));
    return {
      principal: pv,
      periodMonths: n,
      monthlyRatePercent,
      monthlyPayment: avgMonthlyPayment,
      totalInterest,
      totalToPay,
    };
  }

  // Tabela Price (Padrão)
  const factor = Math.pow(1 + i, -n);
  const monthlyPayment = Number(((pv * i) / (1 - factor)).toFixed(2));
  const totalToPay = Number((monthlyPayment * n).toFixed(2));
  const totalInterest = Number((totalToPay - pv).toFixed(2));

  return {
    principal: pv,
    periodMonths: n,
    monthlyRatePercent,
    monthlyPayment,
    totalInterest,
    totalToPay,
  };
}

/**
 * Calcula o cronograma de parcelas e datas de vencimento reais.
 */
export function generateInstallmentSchedule(
  amount: number,
  periodMonths: number,
  frequency: Frequency | string,
  daysOfWeek: number[] = DIAS_UTEIS_PADRAO,
  startDate: Date = new Date()
): Installment[] {
  const prazo = Math.max(1, Number(periodMonths) || 1);
  const totalAmount = Math.max(0, Number(amount) || 0);
  const freqNorm = String(frequency || 'monthly').toLowerCase();
  const activeDays = Array.isArray(daysOfWeek) && daysOfWeek.length > 0 ? daysOfWeek : DIAS_UTEIS_PADRAO;
  const dueDates: Date[] = [];

  if (freqNorm === 'weekly' || freqNorm === 'semanal') {
    const count = prazo * 4;
    for (let i = 1; i <= count; i++) {
      const d = new Date(startDate.getTime());
      d.setDate(d.getDate() + i * 7);
      dueDates.push(d);
    }
  } else if (freqNorm === 'biweekly' || freqNorm === 'quinzenal') {
    const count = prazo * 2;
    for (let i = 1; i <= count; i++) {
      const d = new Date(startDate.getTime());
      d.setDate(d.getDate() + i * 15);
      dueDates.push(d);
    }
  } else if (freqNorm === 'monthly' || freqNorm === 'mensal') {
    const count = prazo;
    for (let i = 1; i <= count; i++) {
      const d = new Date(startDate.getFullYear(), startDate.getMonth() + i, startDate.getDate());
      dueDates.push(d);
    }
  } else {
    // Diário ou Dias Alternados (daily / custom_days / diario)
    const totalDaysSpan = prazo * 30;
    const curr = new Date(startDate.getTime());
    curr.setDate(curr.getDate() + 1);
    for (let dayOffset = 1; dayOffset <= totalDaysSpan; dayOffset++) {
      if (activeDays.includes(curr.getDay())) {
        dueDates.push(new Date(curr.getTime()));
      }
      curr.setDate(curr.getDate() + 1);
    }
    if (dueDates.length === 0) {
      const fallback = new Date(startDate.getTime());
      fallback.setDate(fallback.getDate() + 1);
      for (let dayOffset = 1; dayOffset <= totalDaysSpan; dayOffset++) {
        if ([1, 2, 3, 4, 5].includes(fallback.getDay())) {
          dueDates.push(new Date(fallback.getTime()));
        }
        fallback.setDate(fallback.getDate() + 1);
      }
    }
  }

  const totalCount = dueDates.length > 0 ? dueDates.length : 1;
  const baseValue = Number((totalAmount / totalCount).toFixed(2));
  let runningSum = 0;

  return dueDates.map((dt, idx) => {
    const isLast = idx === totalCount - 1;
    const val = isLast ? Number((totalAmount - runningSum).toFixed(2)) : baseValue;
    runningSum += baseValue;

    return {
      numParcela: idx + 1,
      dataVencimento: dt.toLocaleDateString("pt-PT"),
      valor: Math.max(0, val),
      status: "pendente",
      valorPago: 0,
    };
  });
}