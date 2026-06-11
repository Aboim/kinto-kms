import './style.css';
import { Chart, registerables } from 'chart.js';
import type { ContractSettings, Entry, SyncPayload } from './types';
import * as api from './api';
import * as calc from './calculations';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import Tesseract from 'tesseract.js';

Chart.register(...registerables);

const ACTIVE_PLATE_KEY = 'kinto_tracker_active_plate';
const THEME_KEY = 'kinto_theme';
const NOTIFICATIONS_KEY = 'kinto_notifications_enabled';

const defaultSettings: ContractSettings = {
  plate: '', startDate: '2024-08-28', duration: 60, limit: 50000, maxLimit: 65000, costPerKm: 0.069
};

let plates: string[] = [];
let activePlate: string = localStorage.getItem(ACTIVE_PLATE_KEY) || '';
let settings: ContractSettings = { ...defaultSettings };
let history: Entry[] = [];
let editingId: string | null = null;
let usageChart: Chart | null = null;
let seasonalityChart: Chart | null = null;
let notificationsEnabled: boolean = localStorage.getItem(NOTIFICATIONS_KEY) !== 'false';
const notifiedAlerts: Set<string> = new Set();

const UI = {
    dateInput: document.getElementById('date-input') as HTMLInputElement,
    kmsInput: document.getElementById('kms-input') as HTMLInputElement,
    saveBtn: document.getElementById('save-btn') as HTMLButtonElement,
    historyTable: document.getElementById('history-table-body') as HTMLTableSectionElement,
    chartCtx: document.getElementById('usage-chart') as HTMLCanvasElement,
    cancelBtn: document.getElementById('cancel-btn') as HTMLButtonElement,
    exportBtn: document.getElementById('export-btn') as HTMLButtonElement,
    projectionsContainer: document.getElementById('projections-container') as HTMLElement,
    formTitle: document.querySelector('.card h2') as HTMLElement,
    saveSettingsBtn: document.getElementById('save-settings-btn') as HTMLButtonElement,
    plateInput: document.getElementById('plate-input') as HTMLInputElement,
    startDateInput: document.getElementById('start-date-input') as HTMLInputElement,
    durationInput: document.getElementById('duration-input') as HTMLInputElement,
    limitInput: document.getElementById('limit-input') as HTMLInputElement,
    maxLimitInput: document.getElementById('max-limit-input') as HTMLInputElement,
    costInput: document.getElementById('cost-input') as HTMLInputElement,
    appTitle: document.querySelector('h1') as HTMLElement,
    vehicleSelector: document.getElementById('vehicle-selector') as HTMLElement,
    deleteVehicleBtn: document.getElementById('delete-vehicle-btn') as HTMLButtonElement,
    themeToggle: document.getElementById('theme-toggle') as HTMLButtonElement,
    importJson: document.getElementById('import-json') as HTMLInputElement,
    smartAlerts: document.getElementById('smart-alerts') as HTMLElement,
    ocrInput: document.getElementById('ocr-input') as HTMLInputElement,
    ocrModal: document.getElementById('ocr-modal') as HTMLElement,
    ocrValueDisplay: document.getElementById('ocr-value') as HTMLElement,
    ocrEditInput: document.getElementById('ocr-edit-input') as HTMLInputElement,
    ocrConfirmBtn: document.getElementById('ocr-confirm-btn') as HTMLButtonElement,
    ocrCancelBtnModal: document.getElementById('ocr-cancel-btn') as HTMLButtonElement,
    toastContainer: document.getElementById('toast-container') as HTMLElement,
    seasonalityChartCtx: document.getElementById('seasonality-chart') as HTMLCanvasElement,
    seasonalityCard: document.getElementById('seasonality-card') as HTMLElement,
    seasonalityNoData: document.getElementById('seasonality-no-data') as HTMLElement,
    offlineBadge: document.getElementById('offline-badge') as HTMLElement,
    syncExportBtn: document.getElementById('sync-export-btn') as HTMLButtonElement,
    syncImportInput: document.getElementById('sync-import-input') as HTMLInputElement,
    renewContractBtn: document.getElementById('renew-contract-btn') as HTMLButtonElement,
    renewModal: document.getElementById('renew-modal') as HTMLElement,
    renewModalClose: document.getElementById('renew-modal-close') as HTMLButtonElement,
    renewModalConfirm: document.getElementById('renew-modal-confirm') as HTMLButtonElement,
    renewStartDate: document.getElementById('renew-start-date') as HTMLInputElement,
    renewDuration: document.getElementById('renew-duration') as HTMLInputElement,
    renewLimit: document.getElementById('renew-limit') as HTMLInputElement,
    renewMaxLimit: document.getElementById('renew-max-limit') as HTMLInputElement,
    renewCost: document.getElementById('renew-cost') as HTMLInputElement,
    notificationsToggle: document.getElementById('notifications-toggle') as HTMLInputElement,
};

function showToast(message: string, type: 'success' | 'error' | 'info' = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerText = message;
    UI.toastContainer.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

UI.dateInput.value = new Date().toISOString().split('T')[0];

// Theme Logic
let isLight = localStorage.getItem(THEME_KEY) === 'light';
document.documentElement.setAttribute('data-theme', isLight ? 'light' : 'dark');
UI.themeToggle.addEventListener('click', () => {
    isLight = !isLight;
    document.documentElement.setAttribute('data-theme', isLight ? 'light' : 'dark');
    localStorage.setItem(THEME_KEY, isLight ? 'light' : 'dark');
});

// Offline badge
function updateOfflineBadge() {
    if (!UI.offlineBadge) return;
    const online = api.isOnline();
    UI.offlineBadge.style.display = online ? 'none' : 'flex';
}
window.addEventListener('kinto-online-change', updateOfflineBadge);
updateOfflineBadge();

// Notifications toggle
if (UI.notificationsToggle) {
    UI.notificationsToggle.checked = notificationsEnabled;
    UI.notificationsToggle.addEventListener('change', () => {
        notificationsEnabled = UI.notificationsToggle.checked;
        localStorage.setItem(NOTIFICATIONS_KEY, String(notificationsEnabled));
        if (notificationsEnabled && Notification.permission === 'default') {
            Notification.requestPermission();
        }
    });
}

// Request notification permission on init
if (notificationsEnabled && 'Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
}

// Import JSON (legacy import for single vehicle)
UI.importJson?.addEventListener('change', async (e: Event) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = JSON.parse(e.target?.result as string);
            if (!confirm(`Deseja importar ${data.length} registos? O histórico atual desta viatura será substituído para evitar duplicações.`)) return;
            
            await api.storage.clearMileage(activePlate);
            
            for (const entry of data) {
               await api.storage.saveMileage({ id: entry.id, plate: activePlate, date: entry.DATA, kms: entry["KM's"] });
            }
            showToast('Dados importados com sucesso!', 'success');
            await loadVehicleData();
            renderHistory();
        } catch (err) {
            showToast('Erro ao importar JSON.', 'error');
        }
    };
    reader.readAsText(file);
});

// Sync Export
if (UI.syncExportBtn) {
    UI.syncExportBtn.addEventListener('click', async () => {
        try {
            const contracts = await api.storage.fetchAllContracts();
            const mileage = await api.storage.fetchAllMileage();
            const contractHistory = await api.storage.fetchContractHistory();
            
            const payload: SyncPayload = {
                version: '1.0',
                exported_at: new Date().toISOString(),
                contracts: contracts.map((c: any) => ({
                    plate: c.plate,
                    start_date: c.start_date,
                    duration: c.duration,
                    limit_km: c.limit_km,
                    max_limit_km: c.max_limit_km,
                    cost_per_km: c.cost_per_km
                })),
                mileage: mileage.map((m: any) => ({
                    id: m.id,
                    plate: m.plate || (m.plate_id || ''),
                    date: m.date || m.DATA,
                    kms: m.kms || m["KM's"]
                })),
                contract_history: contractHistory
            };
            
            const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            const dateStr = new Date().toISOString().split('T')[0];
            a.href = url;
            a.download = `kinto_sync_${dateStr}.json`;
            a.click();
            URL.revokeObjectURL(url);
            showToast('Sincronização exportada com sucesso!', 'success');
        } catch (err) {
            showToast('Erro ao exportar sincronização.', 'error');
        }
    });
}

// Sync Import
if (UI.syncImportInput) {
    UI.syncImportInput.addEventListener('change', async (e: Event) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const data = JSON.parse(e.target?.result as string);
                
                if (!data.version || !data.contracts || !data.mileage) {
                    showToast('Ficheiro de sincronização inválido!', 'error');
                    return;
                }
                
                const contractCount = data.contracts.length;
                const mileageCount = data.mileage.length;
                
                if (!confirm(`Importar ${contractCount} contratos e ${mileageCount} registos de quilometragem? Os dados serão fundidos sem duplicar registos existentes.`)) return;
                
                await api.storage.importContracts(data.contracts);
                await api.storage.importMileage(data.mileage);
                
                if (data.contract_history) {
                    for (const h of data.contract_history) {
                        await api.storage.saveContractHistory(h);
                    }
                }
                
                showToast('Dados sincronizados com sucesso!', 'success');
                await fetchPlates();
                await loadVehicleData();
                loadSettingsInputs();
                renderVehicleSlider();
                renderHistory();
            } catch (err) {
                console.error(err);
                showToast('Erro ao importar ficheiro de sincronização. Verifique se é um ficheiro válido.', 'error');
            }
        };
        reader.readAsText(file);
    });
}

// Renew Contract Modal
if (UI.renewContractBtn) {
    UI.renewContractBtn.addEventListener('click', () => {
        if (!UI.renewModal) return;
        if (!UI.renewStartDate || !UI.renewDuration || !UI.renewLimit || !UI.renewMaxLimit || !UI.renewCost) return;
        UI.renewStartDate.value = new Date().toISOString().split('T')[0];
        UI.renewDuration.value = settings.duration.toString();
        UI.renewLimit.value = settings.limit.toString();
        UI.renewMaxLimit.value = settings.maxLimit.toString();
        UI.renewCost.value = settings.costPerKm.toString();
        UI.renewModal.style.display = 'flex';
    });
}

if (UI.renewModalClose) {
    UI.renewModalClose.addEventListener('click', () => {
        if (UI.renewModal) UI.renewModal.style.display = 'none';
    });
}

if (UI.renewModalConfirm) {
    UI.renewModalConfirm.addEventListener('click', async () => {
        try {
            const newStartDate = UI.renewStartDate.value;
            const newDuration = parseInt(UI.renewDuration.value);
            const newLimit = parseInt(UI.renewLimit.value) || 50000;
            const newMaxLimit = parseInt(UI.renewMaxLimit.value) || 65000;
            const newCost = parseFloat(UI.renewCost.value.replace(',', '.')) || 0.069;

            if (!newStartDate || newDuration <= 0 || newLimit <= 0 || newMaxLimit <= 0) {
                showToast('Preencha todos os campos corretamente.', 'error');
                return;
            }

            if (!confirm(`Renovar contrato da viatura ${activePlate}?\n\nNovo início: ${newStartDate}\nDuração: ${newDuration} meses\nLimite: ${newLimit} km\nLimite Máx: ${newMaxLimit} km\n\nO contrato antigo será guardado no histórico e a quilometragem mantida.`)) return;

            await api.storage.saveContractHistory({
                plate: activePlate,
                start_date: settings.startDate,
                duration: settings.duration,
                limit_km: settings.limit,
                max_limit_km: settings.maxLimit,
                cost_per_km: settings.costPerKm,
                renewed_at: new Date().toISOString()
            });

            await api.storage.saveContract({
                plate: activePlate,
                startDate: newStartDate,
                duration: newDuration,
                limit: newLimit,
                maxLimit: newMaxLimit,
                costPerKm: newCost
            });

            settings = { plate: activePlate, startDate: newStartDate, duration: newDuration, limit: newLimit, maxLimit: newMaxLimit, costPerKm: newCost };
            loadSettingsInputs();
            
            if (UI.renewModal) UI.renewModal.style.display = 'none';
            
            notifiedAlerts.clear();
            renderHistory();
            showToast('Contrato renovado com sucesso!', 'success');
        } catch (err) {
            showToast('Erro ao renovar contrato.', 'error');
        }
    });
}

// OCR Pre-processing
async function preprocessImage(file: File): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d')!;
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        for (let i = 0; i < data.length; i += 4) {
          const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
          data[i] = data[i+1] = data[i+2] = avg > 120 ? 255 : 0;
        }
        ctx.putImageData(imageData, 0, 0);
        resolve(canvas.toDataURL('image/jpeg'));
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  });
}

// OCR
UI.ocrInput?.addEventListener('change', async (e: Event) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;

  const originalPlaceholder = UI.kmsInput.placeholder;
  UI.kmsInput.placeholder = 'A processar...';
  UI.kmsInput.disabled = true;

  try {
    const processed = await preprocessImage(file);
    const result = await Tesseract.recognize(processed, 'eng');
    
    const text = result.data.text;
    const numbers = text.replace(/[^0-9]/g, '');
    
    if (numbers && parseInt(numbers) > 0) {
        UI.ocrValueDisplay.innerText = numbers;
        UI.ocrEditInput.value = numbers;
        UI.ocrModal.style.display = 'flex';
    } else {
      showToast('Não foram encontrados números válidos na imagem.', 'error');
    }
  } catch (error) {
    console.error(error);
    showToast('Erro ao processar imagem.', 'error');
  } finally {
    UI.kmsInput.placeholder = originalPlaceholder;
    UI.kmsInput.disabled = false;
    UI.ocrInput.value = ''; 
  }
});

UI.ocrConfirmBtn.addEventListener('click', () => {
    UI.kmsInput.value = UI.ocrEditInput.value;
    UI.ocrModal.style.display = 'none';
    showToast('Kilómetros lidos com sucesso!', 'success');
});

UI.ocrCancelBtnModal.addEventListener('click', () => {
    UI.ocrModal.style.display = 'none';
});

async function fetchPlates() {
  try {
    const contracts = await api.storage.fetchContracts();
    plates = contracts.map((c: any) => c.plate);
  } catch (err) { console.error(err); }

  if (plates.length === 0) {
    plates = ['00-AA-00'];
    activePlate = '00-AA-00';
    localStorage.setItem(ACTIVE_PLATE_KEY, activePlate);
    try { await api.storage.saveContract({ ...defaultSettings, plate: '00-AA-00' }); } catch {}
  } else if (!activePlate || !plates.includes(activePlate)) {
    activePlate = plates[0];
    localStorage.setItem(ACTIVE_PLATE_KEY, activePlate);
  }
}

async function loadVehicleData() {
  try {
    const contracts = await api.storage.fetchContracts();
    const c = contracts.find((c:any) => c.plate === activePlate);
    if (c) {
        settings = { plate: c.plate, startDate: c.start_date, duration: c.duration, limit: c.limit_km, maxLimit: c.max_limit_km, costPerKm: c.cost_per_km };
    }
    history = await api.storage.fetchMileage(activePlate);
  } catch (err) {
    console.error("Erro ao carregar dados:", err);
  }
}

function updateChart() {
  const sorted = [...history].sort((a, b) => new Date(a.DATA).getTime() - new Date(b.DATA).getTime());
  const monthlyData: { [key: string]: number } = {};
  
  if (sorted.length > 0) {
    const firstDate = new Date(sorted[0].DATA);
    const lastDate = new Date(sorted[sorted.length - 1].DATA);
    let current = new Date(firstDate.getFullYear(), firstDate.getMonth(), 1);
    while (current <= lastDate) {
      monthlyData[current.toLocaleDateString('pt-PT', { month: 'long', year: 'numeric' })] = 0;
      current.setMonth(current.getMonth() + 1);
    }
  }

  sorted.forEach(entry => {
    const date = new Date(entry.DATA);
    const monthYear = date.toLocaleDateString('pt-PT', { month: 'long', year: 'numeric' });
    const res = calc.calculateValues(entry.DATA, entry["KM's"], sorted, settings);
    if (monthlyData[monthYear] !== undefined) monthlyData[monthYear] += res.kmDiff;
  });

  const labels = Object.keys(monthlyData);
  const dataValues = Object.values(monthlyData);
  const targetMonthlyLimit = settings.maxLimit / settings.duration;
  const targetMonthlyBase = settings.limit / settings.duration;

  if (usageChart) {
    usageChart.data.labels = labels;
    usageChart.data.datasets[0].data = dataValues;
    usageChart.data.datasets[1].data = labels.map(() => targetMonthlyLimit);
    usageChart.data.datasets[2].data = labels.map(() => targetMonthlyBase);
    usageChart.update();
  } else {
    usageChart = new Chart(UI.chartCtx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'KM Mensais', data: dataValues, backgroundColor: 'rgba(59, 130, 246, 0.5)', borderColor: '#3b82f6', borderWidth: 1, borderRadius: 8 },
          { label: `Meta ${(settings.maxLimit/1000).toFixed(0)}k`, data: labels.map(() => targetMonthlyLimit), type: 'line', borderColor: '#f59e0b', borderDash: [5, 5], pointRadius: 0, fill: false },
          { label: `Base ${(settings.limit/1000).toFixed(0)}k`, data: labels.map(() => targetMonthlyBase), type: 'line', borderColor: '#10b981', borderDash: [2, 2], pointRadius: 0, fill: false }
        ]
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: true, labels: { color: '#94a3b8' } } }, scales: { y: { grid: { color: 'rgba(255, 255, 255, 0.05)' }, ticks: { color: '#94a3b8' } }, x: { grid: { display: false }, ticks: { color: '#94a3b8' } } } }
    });
  }
}

function renderSmartAlerts(proj: any) {
  if (!proj || !UI.smartAlerts) return;
  UI.smartAlerts.style.display = 'block';
  if (proj.deviation > 1000) {
    UI.smartAlerts.style.background = 'rgba(239, 68, 68, 0.2)';
    UI.smartAlerts.style.color = 'var(--danger)';
    UI.smartAlerts.innerHTML = `⚠️ Alerta: A este ritmo irá exceder a meta em ${proj.deviation.toFixed(0)} km (aprox. ${proj.projectedCost.toFixed(2)}€ de penalização)!`;
  } else if (proj.deviation > 0) {
    UI.smartAlerts.style.background = 'rgba(245, 158, 11, 0.2)';
    UI.smartAlerts.style.color = 'var(--warning)';
    UI.smartAlerts.innerHTML = `⚠️ Atenção: Está ligeiramente acima da meta de KMS!`;
  } else {
    UI.smartAlerts.style.background = 'rgba(16, 185, 129, 0.2)';
    UI.smartAlerts.style.color = 'var(--success)';
    UI.smartAlerts.innerHTML = `✅ Parabéns! Está a cumprir a meta de KMs perfeitamente.`;
  }
}

function triggerNotifications(proj: any) {
  if (!notificationsEnabled) return;
  if (!('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;

  const alertKey50k = `kinto_alert_50k_${activePlate}`;
  const alertKey65k = `kinto_alert_65k_${activePlate}`;

  if (proj.projectedFinalKms > settings.limit && !notifiedAlerts.has(alertKey50k)) {
    notifiedAlerts.add(alertKey50k);
    new Notification('Alerta KINTO KMS', {
      body: `A projeção de ${proj.projectedFinalKms.toFixed(0)} km excede o limite de ${settings.limit} km para a viatura ${activePlate}.`,
      icon: '/favicon.svg'
    });
  }

  if (proj.projectedFinalKms > settings.maxLimit && !notifiedAlerts.has(alertKey65k)) {
    notifiedAlerts.add(alertKey65k);
    new Notification('Alerta KINTO KMS', {
      body: `A projeção de ${proj.projectedFinalKms.toFixed(0)} km excede o limite máximo de ${settings.maxLimit} km para a viatura ${activePlate}! Custo estimado: ${proj.projectedCost.toFixed(2)}€.`,
      icon: '/favicon.svg'
    });
  }
}

function renderHistory() {
  UI.historyTable.innerHTML = '';
  const sortedByDateAsc = [...history].sort((a, b) => new Date(a.DATA).getTime() - new Date(b.DATA).getTime());
  const sortedForDisplay = [...sortedByDateAsc].reverse();

  sortedForDisplay.forEach(entry => {
    const row = document.createElement('tr');
    const res = calc.calculateValues(entry.DATA, entry["KM's"], sortedByDateAsc, settings);

    row.innerHTML = `
      <td>${new Date(entry.DATA).toLocaleDateString('pt-PT')}</td>
      <td>${entry["KM's"]}</td>
      <td>${res.kmDiff.toFixed(0)}</td>
      <td>${res.diffDays}</td>
      <td>${res.kmPerDay.toFixed(1)}</td>
      <td>${res.avgDaily.toFixed(2)}</td>
      <td>${res.theoreticalBase.toFixed(0)}</td>
      <td class="${res.diffBase > 0 ? 'status-negative' : 'status-positive'}">${res.diffBase.toFixed(0)}</td>
      <td class="${res.varBase > 0 ? 'status-negative' : 'status-positive'}">${res.varBase.toFixed(0)}</td>
      <td>${res.theoreticalTarget.toFixed(0)}</td>
      <td class="${res.diffTarget > 0 ? 'status-negative' : 'status-positive'}">${res.diffTarget.toFixed(0)}</td>
      <td class="${res.varTarget > 0 ? 'status-negative' : 'status-positive'}">${res.varTarget.toFixed(0)}</td>
      <td style="font-weight: 700">${res.cost.toFixed(2)} €</td>
      <td>
        <div style="display: flex; gap: 0.5rem;">
          <button class="edit-btn" data-id="${entry.id}" style="padding: 0.25rem 0.5rem; font-size: 0.7rem; width: auto; margin: 0;">Editar</button>
          <button class="delete-btn" data-id="${entry.id}" style="padding: 0.25rem 0.5rem; font-size: 0.7rem; width: auto; margin: 0;">Apagar</button>
        </div>
      </td>
    `;
    UI.historyTable.appendChild(row);
  });

  document.querySelectorAll('.edit-btn').forEach(btn => btn.addEventListener('click', (e) => {
      const id = (e.target as HTMLElement).getAttribute('data-id');
      if (id) startEdit(id);
  }));

  document.querySelectorAll('.delete-btn').forEach(btn => btn.addEventListener('click', async (e) => {
      const id = (e.target as HTMLElement).getAttribute('data-id');
      if (id && confirm('Eliminar registo?')) {
        await api.storage.deleteMileage(id);
        history = history.filter(h => h.id !== id);
        renderHistory();
      }
  }));

  updateChart();
  const sortedByDateAscForProj = [...history].sort((a, b) => new Date(a.DATA).getTime() - new Date(b.DATA).getTime());
  const proj = calc.generateProjections(sortedByDateAscForProj, settings);
  if (proj) {
      renderSmartAlerts(proj);
      triggerNotifications(proj);
      const progressTarget = (proj.projectedFinalKms / 65000) * 100;
      const progressBase = (proj.projectedFinalKms / 50000) * 100;

      UI.projectionsContainer.innerHTML = `
        <div class="projection-item ${proj.deviation > 0 ? 'border-danger' : 'border-success'}">
          <span class="projection-label">Estado Atual</span>
          <span class="projection-value ${proj.deviation > 0 ? 'status-negative' : 'status-positive'}">${proj.deviation > 0 ? '⚠️ Excesso' : '✅ No Alvo'}</span>
          <div class="eco-score-badge ${proj.ecoScore > 50 ? 'eco-score-high' : 'eco-score-low'}">Eco-Score: ${proj.ecoScore.toFixed(0)}%</div>
        </div>
        <div class="projection-item">
          <span class="projection-label">Previsão 50k</span>
          <span class="projection-value" style="color: var(--success)">
            ${typeof proj.dateTo50k === 'string' ? proj.dateTo50k : proj.dateTo50k.toLocaleDateString('pt-PT')}
          </span>
          <span class="projection-label">Data estimada para 50.000 KM</span>
        </div>
        <div class="projection-item">
          <span class="projection-label">${proj.criticalDate.getTime() === proj.contractEndDate.getTime() ? 'Fim do Contrato' : 'Data Crítica (65k)'}</span>
          <span class="projection-value" style="color: ${proj.criticalDate.getTime() === proj.contractEndDate.getTime() ? 'var(--success)' : 'var(--warning)'}">${proj.criticalDate.toLocaleDateString('pt-PT')}</span>
          <span class="projection-label">${proj.criticalDate.getTime() === proj.contractEndDate.getTime() ? 'Limite de 65k não será atingido' : 'Estimativa para atingir o limite'}</span>
        </div>
        <div class="projection-item">
          <span class="projection-label">Desvio Meta (65k)</span>
          <span class="projection-value ${proj.deviation > 0 ? 'status-negative' : 'status-positive'}">${proj.deviation.toFixed(0)} KM</span>
          <div class="progress-container"><div class="progress-bar" style="width: ${Math.min(100, progressTarget)}%; background: ${progressTarget > 100 ? 'var(--danger)' : 'var(--primary)'}"></div></div>
        </div>
        <div class="projection-item">
          <span class="projection-label">Custo Excesso</span>
          <span class="projection-value" style="color: ${proj.projectedCost > 0 ? 'var(--danger)' : 'var(--success)'}">${proj.projectedCost.toFixed(2)} €</span>
          <div class="progress-container"><div class="progress-bar" style="width: ${Math.min(100, progressBase)}%; background: ${progressBase > 100 ? 'var(--warning)' : 'var(--success)'}"></div></div>
        </div>
        <div class="projection-item" style="grid-column: 1 / -1; background: rgba(59, 130, 246, 0.05); border: 1px dashed var(--primary);">
          <span class="projection-label">Insights e Padrões</span>
          <div style="margin-top: 0.5rem; font-size: 0.9rem; line-height: 1.5;">
            ${proj.insights.length > 0 ? proj.insights.map((i: string) => `<div style="margin-bottom:0.25rem;">${i}</div>`).join('') : '<div>A recolher dados para identificar padrões...</div>'}
          </div>
        </div>
      `;
      updateSeasonalityChart(history);
  }
  UI.appTitle.innerText = `KINTO Tracker - ${settings.plate || ''}`;
}

// Interactive Chart Detail
UI.chartCtx.onclick = (evt) => {
  if (!usageChart) return;
  const points = usageChart.getElementsAtEventForMode(evt, 'nearest', { intersect: true }, true);
  if (points.length) {
    const firstPoint = points[0];
    const label = usageChart.data.labels![firstPoint.index];
    const value = usageChart.data.datasets[firstPoint.datasetIndex].data[firstPoint.index];
    showToast(`${label}: ${value} KM percorridos`, 'info');
  }
};

// PDF Export (jsPDF)
document.getElementById('export-pdf')?.addEventListener('click', () => {
    try {
        const doc = new jsPDF('landscape', 'mm', 'a4');
        const sortedHistory = [...history].sort((a, b) => new Date(a.DATA).getTime() - new Date(b.DATA).getTime());
        
        doc.setFontSize(16);
        doc.text(`Relatório KINTO - ${settings.plate}`, 14, 15);
        
        doc.setFontSize(9);
        doc.text(`Início: ${settings.startDate} | Duração: ${settings.duration} meses | Limite: ${settings.limit.toLocaleString('pt-PT')} km | Máx: ${settings.maxLimit.toLocaleString('pt-PT')} km | Custo/KM: ${settings.costPerKm.toFixed(3)} €`, 14, 22);
        
        const body = sortedHistory.map(e => {
            const res = calc.calculateValues(e.DATA, e["KM's"], sortedHistory, settings);
            return [
                new Date(e.DATA).toLocaleDateString('pt-PT'),
                e["KM's"].toLocaleString('pt-PT'),
                res.kmDiff.toFixed(0),
                res.diffDays.toString(),
                res.kmPerDay.toFixed(1),
                res.avgDaily.toFixed(2),
                res.theoreticalBase.toFixed(0),
                res.diffBase.toFixed(0),
                res.theoreticalTarget.toFixed(0),
                res.diffTarget.toFixed(0),
                `${res.cost.toFixed(2)} €`
            ];
        });

        autoTable(doc, {
            head: [['Data', 'KM', 'Diferença', 'Dias', 'KM/Dia', 'Média Acum.', 'Teórico 50k', 'Diff 50k', 'Teórico 65k', 'Diff 65k', 'Custo']],
            body,
            startY: 28,
            styles: { fontSize: 7, cellPadding: 2 },
            headStyles: { fillColor: [59, 130, 246], textColor: 255, fontStyle: 'bold' },
            alternateRowStyles: { fillColor: [245, 245, 245] },
            margin: { top: 28 }
        });

        const proj = calc.generateProjections(sortedHistory, settings);
        if (proj) {
            const finalY = (doc as any).lastAutoTable?.finalY || 150;
            doc.setFontSize(11);
            doc.text('Resumo de Projeções', 14, finalY + 10);
            doc.setFontSize(9);
            const summaryLines = [
                `KM Projetados Fim Contrato: ${proj.projectedFinalKms.toFixed(0)} km`,
                `Média Mensal: ${proj.avgMonthlyKms.toFixed(1)} km`,
                `Desvio Limite (65k): ${proj.deviation.toFixed(0)} km`,
                `Custo Excesso Estimado: ${proj.projectedCost.toFixed(2)} €`,
                `Data Crítica (65k): ${proj.criticalDate.toLocaleDateString('pt-PT')}`,
                `Eco-Score: ${proj.ecoScore.toFixed(0)}%`
            ];
            summaryLines.forEach((line, i) => {
                doc.text(line, 14, finalY + 18 + i * 6);
            });
        }
        
        const dateStr = new Date().toISOString().split('T')[0];
        doc.save(`relatorio_${settings.plate}_${dateStr}.pdf`);
        showToast('PDF exportado com sucesso!', 'success');
    } catch (err) {
        console.error(err);
        showToast('Erro ao exportar PDF.', 'error');
    }
});

// Excel Export (SheetJS)
document.getElementById('export-excel')?.addEventListener('click', () => {
    try {
        const sortedHistory = [...history].sort((a, b) => new Date(a.DATA).getTime() - new Date(b.DATA).getTime());
        
        const data = sortedHistory.map(e => {
            const res = calc.calculateValues(e.DATA, e["KM's"], sortedHistory, settings);
            return {
                'Data': new Date(e.DATA).toLocaleDateString('pt-PT'),
                'KM': e["KM's"],
                'Diferença': parseFloat(res.kmDiff.toFixed(0)),
                'Dias desde último': res.diffDays,
                'KM/Dia': parseFloat(res.kmPerDay.toFixed(1)),
                'Média Acumulada': parseFloat(res.avgDaily.toFixed(2)),
                'Teórico 50k': parseFloat(res.theoreticalBase.toFixed(0)),
                'Diff 50k': parseFloat(res.diffBase.toFixed(0)),
                'Teórico 65k': parseFloat(res.theoreticalTarget.toFixed(0)),
                'Diff 65k': parseFloat(res.diffTarget.toFixed(0)),
                'Custo (€)': parseFloat(res.cost.toFixed(2))
            };
        });

        const ws = XLSX.utils.json_to_sheet(data);
        
        const colWidths = [
            { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 18 }, { wch: 10 },
            { wch: 18 }, { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 12 }
        ];
        ws['!cols'] = colWidths;

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Histórico');

        const proj = calc.generateProjections(sortedHistory, settings);
        if (proj) {
            const summaryData = [
                { 'Indicador': 'KM Projetados Fim Contrato', 'Valor': parseFloat(proj.projectedFinalKms.toFixed(0)) },
                { 'Indicador': 'Média Mensal (km)', 'Valor': parseFloat(proj.avgMonthlyKms.toFixed(1)) },
                { 'Indicador': 'Desvio Limite 65k (km)', 'Valor': parseFloat(proj.deviation.toFixed(0)) },
                { 'Indicador': 'Custo Excesso Estimado (€)', 'Valor': parseFloat(proj.projectedCost.toFixed(2)) },
                { 'Indicador': 'Eco-Score (%)', 'Valor': parseFloat(proj.ecoScore.toFixed(0)) },
                { 'Indicador': 'Data Crítica (65k)', 'Valor': proj.criticalDate.toLocaleDateString('pt-PT') },
            ];
            const ws2 = XLSX.utils.json_to_sheet(summaryData);
            ws2['!cols'] = [{ wch: 30 }, { wch: 20 }];
            XLSX.utils.book_append_sheet(wb, ws2, 'Projeções');
        }
        
        const dateStr = new Date().toISOString().split('T')[0];
        XLSX.writeFile(wb, `relatorio_${settings.plate}_${dateStr}.xlsx`);
        showToast('Excel exportado com sucesso!', 'success');
    } catch (err) {
        console.error(err);
        showToast('Erro ao exportar Excel.', 'error');
    }
});

function startEdit(id: string) {
  const entry = history.find(e => e.id === id);
  if (!entry) return;
  editingId = id;
  UI.dateInput.value = entry.DATA;
  UI.kmsInput.value = entry["KM's"].toString();
  UI.saveBtn.innerText = 'Atualizar';
  UI.formTitle.innerText = 'Editar Entrada';
  UI.cancelBtn.style.display = 'block';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

UI.cancelBtn.addEventListener('click', () => {
  editingId = null;
  UI.dateInput.value = new Date().toISOString().split('T')[0];
  UI.kmsInput.value = '';
  UI.saveBtn.innerText = 'Guardar Entrada';
  UI.formTitle.innerText = 'Nova Entrada';
  UI.cancelBtn.style.display = 'none';
});

UI.saveBtn.addEventListener('click', async () => {
  const kms = parseFloat(UI.kmsInput.value);
  const date = UI.dateInput.value;
  if (isNaN(kms) || !date) return showToast('Valores inválidos.', 'error');

  const lastEntry = history.length > 0 ? [...history].sort((a, b) => new Date(a.DATA).getTime() - new Date(b.DATA).getTime()).pop() : null;
  if (lastEntry && kms < lastEntry["KM's"] && !editingId) {
    if (!confirm(`Atenção: O valor inserido (${kms}) é inferior ao último registo (${lastEntry["KM's"]}). Deseja prosseguir?`)) return;
  }

  UI.saveBtn.disabled = true;
  try {
    if (editingId) {
      await api.storage.updateMileage(editingId, date, kms);
      const index = history.findIndex(e => e.id === editingId);
      if (index !== -1) history[index] = { ...history[index], DATA: date, "KM's": kms };
      UI.cancelBtn.click();
    } else {
      const id = Date.now().toString();
      await api.storage.saveMileage({ id, plate: activePlate, date, kms });
      history.push({ id, DATA: date, "KM's": kms });
    }
    renderHistory();
    UI.kmsInput.value = '';
    showToast(editingId ? 'Entrada atualizada!' : 'Entrada guardada!', 'success');
  } catch (err) { showToast('Erro ao guardar.', 'error'); } 
  finally { UI.saveBtn.disabled = false; }
});

UI.exportBtn.addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(history, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `kinto_${new Date().toISOString().split('T')[0]}.json`;
  a.click(); URL.revokeObjectURL(url);
});

function renderVehicleSlider() {
  if (!UI.vehicleSelector) return;
  UI.vehicleSelector.innerHTML = '';
  
  plates.forEach(plate => {
    const pill = document.createElement('div');
    pill.className = `vehicle-pill ${plate === activePlate ? 'active' : ''}`;
    pill.innerText = plate;
    pill.onclick = async () => {
      activePlate = plate;
      localStorage.setItem(ACTIVE_PLATE_KEY, activePlate);
      notifiedAlerts.clear();
      await loadVehicleData();
      loadSettingsInputs();
      renderHistory();
      renderVehicleSlider();
    };
    UI.vehicleSelector.appendChild(pill);
  });
  
  const addBtn = document.createElement('div');
  addBtn.className = 'vehicle-pill add-vehicle';
  addBtn.innerText = '+ Nova Viatura';
  addBtn.onclick = async () => {
    const newPlate = prompt('Matrícula (ex: 11-BB-11):')?.trim().toUpperCase();
    if (newPlate && !plates.includes(newPlate)) {
      try {
        await api.storage.saveContract({ ...defaultSettings, plate: newPlate });
        plates.push(newPlate);
        activePlate = newPlate;
        localStorage.setItem(ACTIVE_PLATE_KEY, activePlate);
        await loadVehicleData();
        loadSettingsInputs();
        renderHistory();
        renderVehicleSlider();
        showToast(`Viatura ${newPlate} criada!`, 'success');
      } catch (err) { showToast('Erro ao criar viatura.', 'error'); }
    }
  };
  UI.vehicleSelector.appendChild(addBtn);
}

function loadSettingsInputs() {
  UI.plateInput.value = settings.plate;
  UI.startDateInput.value = settings.startDate;
  UI.durationInput.value = settings.duration.toString();
  UI.limitInput.value = settings.limit.toString();
  UI.maxLimitInput.value = settings.maxLimit.toString();
  UI.costInput.value = settings.costPerKm.toString();
}

UI.saveSettingsBtn.addEventListener('click', async () => {
  const newPlate = UI.plateInput.value.trim().toUpperCase();
  if (!newPlate) return showToast('A matrícula não pode estar vazia.', 'error');
  if (newPlate !== activePlate && plates.includes(newPlate)) return showToast('Já existe uma viatura com esta matrícula.', 'error');

  const newSettings = {
    oldPlate: activePlate, plate: newPlate,
    startDate: UI.startDateInput.value, duration: parseInt(UI.durationInput.value),
    limit: parseInt(UI.limitInput.value) || 50000, maxLimit: parseInt(UI.maxLimitInput.value) || 65000,
    costPerKm: parseFloat(UI.costInput.value.replace(',', '.')) || 0.069
  };
  
  UI.saveSettingsBtn.disabled = true;
  try {
    await api.storage.saveContract(newSettings);
    if (newPlate !== activePlate) {
      plates = plates.map(p => p === activePlate ? newPlate : p);
      activePlate = newPlate;
      localStorage.setItem(ACTIVE_PLATE_KEY, activePlate);
    }
    settings = { plate: newSettings.plate, startDate: newSettings.startDate, duration: newSettings.duration, limit: newSettings.limit, maxLimit: newSettings.maxLimit, costPerKm: newSettings.costPerKm };
    notifiedAlerts.clear();
    showToast('Configurações guardadas!', 'success');
    renderVehicleSlider();
    renderHistory();
  } catch (err) { showToast('Erro ao guardar configurações.', 'error'); }
  finally { UI.saveSettingsBtn.disabled = false; }
});

UI.deleteVehicleBtn.addEventListener('click', async () => {
  if (plates.length <= 1) return showToast('Não pode remover a única viatura.', 'error');
  if (confirm(`Remover viatura ${activePlate}?`)) {
    try {
      await api.storage.deleteContract(activePlate);
      plates = plates.filter(p => p !== activePlate);
      activePlate = plates[0];
      localStorage.setItem(ACTIVE_PLATE_KEY, activePlate);
      await loadVehicleData();
      loadSettingsInputs();
      renderHistory();
      renderVehicleSlider();
      showToast(`Viatura ${activePlate} removida.`, 'info');
    } catch (err) { showToast('Erro ao apagar viatura.', 'error'); }
  }
});

document.querySelectorAll('.nav-btn:not(#theme-toggle)').forEach(btn => {
  btn.addEventListener('click', () => {
    const targetId = btn.getAttribute('data-target');
    if(!targetId) return;
    document.querySelectorAll('.nav-btn:not(#theme-toggle)').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('section').forEach(s => s.style.display = 'none');
    const target = document.getElementById(targetId);
    if (target) target.style.display = 'block';
  });
});

function updateSeasonalityChart(historyEntries: Entry[]) {
  if (!UI.seasonalityChartCtx || !UI.seasonalityCard) return;
  
  const currentYear = new Date().getFullYear();
  const lastYear = currentYear - 1;
  const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  
  const yearData: { [year: number]: number[] } = { 
    [currentYear]: new Array(12).fill(0), 
    [lastYear]: new Array(12).fill(0) 
  };

  const sorted = [...historyEntries].sort((a, b) => new Date(a.DATA).getTime() - new Date(b.DATA).getTime());

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i-1];
    const curr = sorted[i];
    const date = new Date(curr.DATA);
    const year = date.getFullYear();
    const month = date.getMonth();
    const diff = curr["KM's"] - prev["KM's"];
    if (yearData[year]) yearData[year][month] += diff;
  }

  const currYearHasData = yearData[currentYear].some(v => v > 0);
  const prevYearHasData = yearData[lastYear].some(v => v > 0);

  if (!currYearHasData && !prevYearHasData) {
    if (UI.seasonalityNoData) UI.seasonalityNoData.style.display = 'block';
    UI.seasonalityNoData.innerText = 'Sem dados de sazonalidade disponíveis.';
    UI.seasonalityChartCtx.style.display = 'none';
    if (seasonalityChart) { seasonalityChart.destroy(); seasonalityChart = null; }
    return;
  }

  if (!currYearHasData) {
    UI.seasonalityChartCtx.style.display = 'none';
    if (UI.seasonalityNoData) {
      UI.seasonalityNoData.style.display = 'block';
      UI.seasonalityNoData.innerText = 'Sem dados este ano para comparação.';
    }
    if (seasonalityChart) { seasonalityChart.destroy(); seasonalityChart = null; }
    return;
  }

  UI.seasonalityChartCtx.style.display = 'block';
  if (UI.seasonalityNoData) UI.seasonalityNoData.style.display = 'none';

  if (seasonalityChart) seasonalityChart.destroy();
  
  const datasets: any[] = [
    { label: `Ano Atual (${currentYear})`, data: yearData[currentYear], backgroundColor: '#3b82f6' }
  ];

  if (prevYearHasData) {
    datasets.push({ label: `Ano Anterior (${lastYear})`, data: yearData[lastYear], backgroundColor: 'rgba(255, 255, 255, 0.1)' });
  }

  const subtitleText = prevYearHasData ? undefined : 'Sem dados do ano anterior para comparação';

  seasonalityChart = new Chart(UI.seasonalityChartCtx, {
    type: 'bar',
    data: {
      labels: monthNames,
      datasets
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { 
        legend: { labels: { color: '#94a3b8' } },
        subtitle: subtitleText ? {
          display: true,
          text: subtitleText,
          color: '#94a3b8',
          font: { size: 12 }
        } : undefined,
        tooltip: {
          callbacks: {
            label: (context) => `${context.dataset.label}: ${context.parsed.y !== null ? context.parsed.y.toFixed(0) : 0} KM`
          }
        }
      },
      scales: {
        y: { grid: { color: 'rgba(255, 255, 255, 0.05)' }, ticks: { color: '#94a3b8' } },
        x: { grid: { display: false }, ticks: { color: '#94a3b8' } }
      }
    }
  });
}

async function initApp() {
  await fetchPlates();
  await loadVehicleData();
  loadSettingsInputs();
  renderVehicleSlider();
  renderHistory();
  updateOfflineBadge();
}

initApp();
