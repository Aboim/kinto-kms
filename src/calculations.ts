import type { ContractSettings, Entry } from './types';

export function getContractStartDate(sortedHistory: Entry[], settings: ContractSettings): Date {
  if (sortedHistory.length === 0) return new Date(settings.startDate || '2024-08-28');
  return new Date(sortedHistory[0].DATA);
}

export function calculateValues(dateStr: string, kms: number, sortedHistory: Entry[], settings: ContractSettings) {
  const startDate = getContractStartDate(sortedHistory, settings);
  const date = new Date(dateStr);
  const diffTime = Math.max(0, date.getTime() - startDate.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  const lastEntry = sortedHistory.filter(e => new Date(e.DATA) < date).pop();

  const kmDiff = lastEntry ? kms - lastEntry["KM's"] : kms;
  const daysDiff = lastEntry ? (date.getTime() - new Date(lastEntry.DATA).getTime()) / (1000 * 60 * 60 * 24) : diffDays;
  const kmPerDay = daysDiff > 0 ? kmDiff / daysDiff : 0;

  const avgDaily = diffDays > 0 ? kms / diffDays : 0;

  const fixedTarget = 65000;
  const fixedBase = 50000;

  const yearlyLimit = fixedTarget / (settings.duration / 12);
  const yearlyBase = fixedBase / (settings.duration / 12);

  const theoreticalTarget = (yearlyLimit / 365) * diffDays;
  const diffTarget = kms - theoreticalTarget;
  const prevTheoreticalTarget = lastEntry ? (yearlyLimit / 365) * Math.ceil(Math.max(0, new Date(lastEntry.DATA).getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) : 0;
  const varTarget = kmDiff - (theoreticalTarget - prevTheoreticalTarget);

  const theoreticalBase = (yearlyBase / 365) * diffDays;
  const diffBase = kms - theoreticalBase;
  const prevTheoreticalBase = lastEntry ? (yearlyBase / 365) * Math.ceil(Math.max(0, new Date(lastEntry.DATA).getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) : 0;
  const varBase = kmDiff - (theoreticalBase - prevTheoreticalBase);

  const cost = Math.max(0, diffTarget * settings.costPerKm);

  return { diffDays, kmDiff, kmPerDay, avgDaily, theoreticalTarget, diffTarget, varTarget, theoreticalBase, diffBase, varBase, cost };
}

export function generateProjections(sortedHistory: Entry[], settings: ContractSettings) {
  if (sortedHistory.length === 0) return null;
  
  const oldestEntry = sortedHistory[0];
  const lastEntry = sortedHistory[sortedHistory.length - 1];
  
  const totalKmsDriven = lastEntry["KM's"] - oldestEntry["KM's"];
  const totalDaysSoFar = Math.max(1, (new Date(lastEntry.DATA).getTime() - new Date(oldestEntry.DATA).getTime()) / (1000 * 60 * 60 * 24));
  const avgMonthlyKms = (totalKmsDriven / totalDaysSoFar) * 30.44;
  
  const contractMonths = settings.duration;
  const totalContractDays = contractMonths * 30.44;
  const daysRemaining = Math.max(0, totalContractDays - totalDaysSoFar);
  
  const projectedFinalKms = lastEntry["KM's"] + (avgMonthlyKms * (daysRemaining / 30.44));
  
  const targetLimit = 65000;
  const deviation = projectedFinalKms - targetLimit;
  const projectedCost = Math.max(0, deviation * settings.costPerKm);

  // Calcular Data de Fim de Contrato
  const startDate = getContractStartDate(sortedHistory, settings);
  const contractEndDate = new Date(startDate.getTime());
  contractEndDate.setMonth(contractEndDate.getMonth() + settings.duration);

  // Previsão de Data Crítica (65k)
  const totalKms = lastEntry["KM's"] - oldestEntry["KM's"];
  const kmsPerDay = totalKms / totalDaysSoFar;
  const kmsTo65k = 65000 - lastEntry["KM's"];
  const daysTo65k = kmsPerDay > 0 ? kmsTo65k / kmsPerDay : Infinity;
  let criticalDate = new Date(new Date(lastEntry.DATA).getTime() + (daysTo65k * 24 * 60 * 60 * 1000));

  // A data crítica não pode ser superior à data final do contrato
  if (criticalDate > contractEndDate) {
    criticalDate = contractEndDate;
  }

  // Previsão de Data 50k
  const kmsTo50k = 50000 - lastEntry["KM's"];
  const daysTo50k = kmsPerDay > 0 ? kmsTo50k / kmsPerDay : Infinity;
  let dateTo50k: Date | string = new Date(new Date(lastEntry.DATA).getTime() + (daysTo50k * 24 * 60 * 60 * 1000));
  
  if (lastEntry["KM's"] >= 50000) {
    dateTo50k = "Atingido";
  } else if (dateTo50k > contractEndDate) {
    dateTo50k = contractEndDate;
  }

  // Insights de Sazonalidade
  const insights = getSeasonalityInsights(sortedHistory);

  // Eco-Driving Score
  const monthlyTarget = targetLimit / settings.duration;
  const ecoScore = Math.min(100, Math.max(0, ((monthlyTarget - avgMonthlyKms) / monthlyTarget) * 100));

  return { projectedFinalKms, avgMonthlyKms, deviation, projectedCost, contractMonths, criticalDate, dateTo50k, contractEndDate, ecoScore, insights };
}

function getSeasonalityInsights(history: Entry[]): string[] {
  if (history.length < 3) return [];
  
  const monthlyData: { [key: number]: number[] } = {};
  for (let i = 1; i < history.length; i++) {
    const prev = history[i-1];
    const curr = history[i];
    const month = new Date(curr.DATA).getMonth(); // 0-11
    const diff = curr["KM's"] - prev["KM's"];
    if (!monthlyData[month]) monthlyData[month] = [];
    monthlyData[month].push(diff);
  }

  const monthlyAverages = Object.entries(monthlyData).map(([m, vals]) => ({
    month: parseInt(m),
    avg: vals.reduce((a, b) => a + b, 0) / vals.length
  }));

  const insights: string[] = [];
  
  // Summer Detection (Jun, Jul, Aug, Sep - 5, 6, 7, 8)
  const summerMonths = [5, 6, 7, 8];
  const summerAvg = monthlyAverages.filter(m => summerMonths.includes(m.month)).reduce((a, b) => a + b.avg, 0) / 4 || 0;
  const otherAvg = monthlyAverages.filter(m => !summerMonths.includes(m.month)).reduce((a, b) => a + b.avg, 0) / 8 || 0;

  if (summerAvg > otherAvg * 1.15 && otherAvg > 0) {
    const pct = Math.round(((summerAvg - otherAvg) / otherAvg) * 100);
    insights.push(`☀️ Costuma conduzir ${pct}% mais nos meses de Verão. Ajuste o seu planeamento.`);
  }

  // Peak Month
  const peak = [...monthlyAverages].sort((a, b) => b.avg - a.avg)[0];
  if (peak && peak.avg > 0) {
    const monthNames = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    insights.push(`📈 O seu mês de maior utilização é ${monthNames[peak.month]}.`);
  }

  return insights;
}
