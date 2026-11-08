const seed = {
  budget: {
    total: 3539501,
    subtotal: 2595910,
    contingency: 43591,
    personnelReserve: 900000,
    savings: 172662,
    categories: [
      { label: 'Diárias', expected: 2160000, actual: 0 },
      { label: 'Combustível', expected: 185910, actual: 0 },
      { label: 'Passagens', expected: 0, actual: 0 },
      { label: 'Outras despesas', expected: 250000, actual: 0 }
    ]
  },
  teams: [
    { id: 'EQ-01', mission: 'Estúdios Sul (Benguela, Lubango, Moçâmedes)', status: 'Aprovada', statusClass: 'green', start: '09 nov 2026', end: '15 dez 2026', people: 3, days: 36, km: 2150, total: 1714263, advance: 249330, color: 'blue' },
    { id: 'EQ-02', mission: 'Leste (Malanje, Saurimo)', status: 'Planejada', statusClass: 'gold', start: '16 nov 2026', end: '13 dez 2026', people: 3, days: 27, km: 2220, total: 1825238, advance: 186580, color: 'coral' }
  ],
  expenses: [
    { id: 'EXP-001', team: 'EQ-01', date: '2026-11-09', type: 'Combustível', description: 'Gasóleo Luanda–Benguela', supplier: 'Sonangol', invoice: 'FT A/1001', amount: 60000, attachment: 'Sim', note: 'CAM-02', status: 'Validado' },
    { id: 'EXP-002', team: 'EQ-02', date: '2026-11-16', type: 'Combustível', description: 'Gasolina Luanda–Malanje', supplier: 'Pumangol', invoice: 'FT B/2002', amount: 45000, attachment: 'Sim', note: 'CAM-01', status: 'Validado' }
  ],
  changes: [{ id: 'SOL-002', team: 'EQ-02', type: 'Mudança de rota', status: 'Pendente', impact: 0 }]
};

const storageKey = 'flowroute-finance-state-v1';
let state = loadState();
let lastExtractedFile = '';
const fmt = new Intl.NumberFormat('pt-AO', { maximumFractionDigits: 0 });
const dateFmt = new Intl.DateTimeFormat('pt-AO', { day: '2-digit', month: 'short', year: 'numeric' });
const money = value => `${fmt.format(Number(value || 0))} Kz`;
const shortDate = value => value ? dateFmt.format(new Date(`${value}T00:00:00`)).replace('.', '') : '—';
const byId = id => document.getElementById(id);

function loadState() {
  try { const stored = JSON.parse(localStorage.getItem(storageKey)); return stored ? { ...seed, ...stored, budget: seed.budget, teams: seed.teams, changes: seed.changes, expenses: stored.expenses || seed.expenses } : structuredClone(seed); } catch { return structuredClone(seed); }
}
function persist() { localStorage.setItem(storageKey, JSON.stringify({ expenses: state.expenses })); updateSync(); }
function updateSync() { const text = `Atualizado ${new Date().toLocaleTimeString('pt-AO', { hour:'2-digit', minute:'2-digit' })}`; byId('lastSync').textContent = text; byId('footerSync').textContent = `${new Date().toLocaleDateString('pt-AO', {day:'2-digit',month:'short',year:'numeric'})}, ${text.replace('Atualizado ','')}`; }
function toast(message) { const el = byId('toast'); el.textContent = message; el.classList.add('show'); window.clearTimeout(toast.timer); toast.timer = window.setTimeout(() => el.classList.remove('show'), 3600); }

function renderAll() {
  const totalSpent = state.expenses.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  byId('metricSpent').textContent = money(totalSpent);
  byId('expenseCount').textContent = `${state.expenses.length} lançamento${state.expenses.length === 1 ? '' : 's'}`;
  byId('metricBalance').textContent = money(Math.max(0, 249910 - totalSpent));
  byId('expenseBadge').textContent = state.expenses.length;
  renderBars(totalSpent); renderTeams(); renderExpenses(); renderRoutes();
  byId('ledgerCount').textContent = state.expenses.length;
  byId('ledgerTotal').textContent = money(totalSpent);
}

function renderBars(totalSpent) {
  const list = seed.budget.categories; const max = Math.max(...list.map(x => x.expected), 1);
  byId('budgetBars').innerHTML = list.map((item, index) => {
    const actual = index === 3 ? totalSpent : 0;
    return `<div class="bar-row"><span class="bar-label">${item.label}</span><div class="bars"><span class="bar-track"><i class="bar expected" style="width:${Math.max(1, item.expected / max * 100)}%"></i></span><span class="bar-track"><i class="bar actual" style="width:${actual ? Math.min(100, actual / max * 100) : 0}%"></i></span></div><span class="bar-value">${money(item.expected)}</span></div>`;
  }).join('');
}
function renderTeams() { byId('teamList').innerHTML = state.teams.map(team => `<div class="team-item"><div class="team-avatar ${team.color === 'coral' ? 'coral' : ''}">${team.id}</div><div class="team-main"><strong>${team.mission}</strong><span>${team.people} titulares · ${team.km.toLocaleString('pt-AO')} km rodoviários</span></div><div class="team-side"><div class="team-status ${team.statusClass}">${team.status}</div><div class="team-dates">${team.start} — ${team.end}</div></div></div>`).join(''); }
function renderExpenses() {
  const rows = state.expenses.slice().reverse().map(item => `<tr><td><strong>${item.team}</strong></td><td>${shortDate(item.date)}</td><td><span class="expense-type"><i class="expense-dot ${item.type.includes('Passagem') ? 'blue' : item.type.includes('Outra') ? 'gold' : ''}"></i>${item.type}</span></td><td>${item.supplier || '—'}</td><td class="align-right"><strong>${money(item.amount)}</strong></td><td class="align-right"><button class="icon-button row-action" title="Ver lançamento">›</button></td></tr>`).join('');
  byId('latestExpenses').innerHTML = rows || '<tr><td colspan="6">Nenhuma despesa lançada.</td></tr>';
  byId('ledgerRows').innerHTML = state.expenses.slice().reverse().map(item => `<tr><td><div class="ledger-team"><strong>${item.team}</strong><span>${shortDate(item.date)} · ${item.description || 'Sem descrição'}</span></div></td><td>${item.type}</td><td>${item.supplier || '—'}</td><td class="align-right"><strong>${money(item.amount)}</strong></td><td><span class="status-chip">${item.status || 'Para validar'}</span></td></tr>`).join('');
}
function renderRoutes() { byId('routeCards').innerHTML = state.teams.map(team => `<article class="route-card ${team.color === 'coral' ? 'coral' : ''}"><div class="route-head"><div class="route-id"><div class="team-avatar ${team.color === 'coral' ? 'coral' : ''}">${team.id}</div><strong>${team.status}</strong></div><span class="status-chip">${team.people} titulares</span></div><p>${team.mission}</p><div class="route-meta"><span>Período<strong>${team.start} — ${team.end}</strong></span><span>Orçamento<strong>${money(team.total)}</strong></span><span>Distância<strong>${team.km.toLocaleString('pt-AO')} km</strong></span><span>Adiantamento<strong>${money(team.advance)}</strong></span></div><div class="route-line"><span style="width:${team.status === 'Aprovada' ? 74 : 38}%"></span></div></article>`).join(''); }

function switchView(view) { document.querySelectorAll('.view').forEach(el => el.classList.toggle('active', el.id === `view-${view}`)); document.querySelectorAll('.nav-item').forEach(el => el.classList.toggle('active', el.dataset.view === view)); const names = { dashboard:'Visão geral', expenses:'Prestar contas', reports:'Relatórios', routes:'Equipes e rotas' }; byId('pageTitle').textContent = names[view] || names.dashboard; window.scrollTo({ top:0, behavior:'smooth' }); }
document.querySelectorAll('[data-view]').forEach(btn => btn.addEventListener('click', () => switchView(btn.dataset.view)));
document.querySelectorAll('[data-view-target]').forEach(btn => btn.addEventListener('click', () => switchView(btn.dataset.viewTarget)));
byId('quickReport').addEventListener('click', () => { switchView('reports'); setTimeout(() => toast('Relatório pronto para exportação.'), 150); });
byId('expenseReport').addEventListener('click', () => downloadWorkbook('Prestacao_Contas'));
byId('generateReport').addEventListener('click', () => downloadWorkbook('PEMx-RNA_Nov-2026'));

byId('expenseForm').addEventListener('submit', event => { event.preventDefault(); const amount = Number(byId('expenseAmount').value.replace(/[^0-9,.-]/g, '').replace(',', '.')) || 0; if (!amount) { toast('Informe um valor válido antes de gravar.'); return; } state.expenses.push({ id:`EXP-${String(state.expenses.length + 1).padStart(3,'0')}`, team:byId('expenseTeam').value, date:byId('expenseDate').value, type:byId('expenseType').value, description:byId('expenseDescription').value || 'Despesa extra', supplier:byId('expenseSupplier').value, invoice:byId('expenseInvoice').value, amount, attachment:byId('expenseAttachment').value, attachmentName:lastExtractedFile, note:byId('expenseNote').value, status:byId('expenseAttachment').value === 'Sim' ? 'Validado' : 'Para validar' }); persist(); renderAll(); event.target.reset(); lastExtractedFile = ''; byId('expenseDate').value = '2026-11-08'; toast('Lançamento gravado na prestação de contas.'); });

const dropZone = byId('dropZone'); const fileInput = byId('receiptFile');
dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('dragover'); }); dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover')); dropZone.addEventListener('drop', e => { e.preventDefault(); dropZone.classList.remove('dragover'); const file = e.dataTransfer.files[0]; if (file) processReceipt(file); }); fileInput.addEventListener('change', e => { if (e.target.files[0]) processReceipt(e.target.files[0]); });

async function processReceipt(file) {
  lastExtractedFile = file.name; const stateEl = byId('extractionState'); stateEl.innerHTML = `<span class="state-icon">◌</span><div><strong>A ler ${file.name}</strong><span>A extração pode levar alguns segundos. Confirme todos os campos.</span></div>`;
  let text = '';
  try { text = await extractText(file); } catch (error) { console.warn(error); }
  const parsed = parseReceiptText(text, file.name); fillExpenseFields(parsed);
  stateEl.innerHTML = `<span class="state-icon">✓</span><div><strong>${text ? 'Dados extraídos — revisão necessária' : 'Documento carregado — preencha os campos'}</strong><span>${text ? 'Confira valor, fornecedor e número do documento antes de gravar.' : 'OCR indisponível neste navegador. O arquivo ficou associado ao lançamento.'}</span></div>`;
  toast(text ? 'Comprovativo lido. Revise os campos extraídos.' : 'Comprovativo carregado. Preencha os campos manualmente.');
}
async function extractText(file) {
  if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) { return ''; }
  if (!window.Tesseract) { await loadScript('https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js'); }
  if (!window.Tesseract) return '';
  const result = await window.Tesseract.recognize(file, 'por+eng', { logger: data => { if (data.status === 'recognizing text') byId('extractionState').querySelector('strong').textContent = `A ler comprovativo · ${Math.round(data.progress * 100)}%`; } });
  return result.data.text || '';
}
function loadScript(src) { return new Promise(resolve => { const script = document.createElement('script'); script.src = src; script.onload = resolve; script.onerror = resolve; document.head.appendChild(script); }); }
function parseReceiptText(text, filename) {
  const raw = text.trim(); const normalized = raw.replace(/\s+/g, ' ').trim(); const amountMatch = normalized.match(/(?:AOA|KZ|Kz|Total|TOTAL)[^\d]{0,20}([\d .]+[,.]\d{2}|[\d .]{3,})/i); const invoiceMatch = normalized.match(/(?:fatura|factura|recibo|n[ºo°]?)[^A-Z0-9]{0,10}([A-Z0-9][A-Z0-9/\- .]{3,})/i); const dateMatch = normalized.match(/(\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4})/); const supplier = raw.split(/\n|\r/).map(x => x.trim()).find(x => x.length > 3 && !/fatura|factura|recibo|total|valor|data/i.test(x)) || '';
  return { amount: amountMatch ? amountMatch[1].replace(/\s/g,'').replace(/\.(?=\d{3})/g,'').replace(',','.') : '', invoice: invoiceMatch ? invoiceMatch[1].trim() : '', date: dateMatch ? normalizeDate(dateMatch[1]) : '', supplier: supplier.slice(0,70), description: filename ? `Documento importado: ${filename}` : '' };
}
function normalizeDate(value) { const parts = value.split(/[\/.\-]/); if (parts.length !== 3) return ''; const [d,m,y] = parts; return `${y.length === 2 ? '20' + y : y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`; }
function fillExpenseFields(parsed) { if (parsed.amount) byId('expenseAmount').value = parsed.amount; if (parsed.invoice) byId('expenseInvoice').value = parsed.invoice; if (parsed.date) byId('expenseDate').value = parsed.date; if (parsed.supplier) byId('expenseSupplier').value = parsed.supplier; if (parsed.description) byId('expenseDescription').value = parsed.description; }

function esc(value) { return String(value ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function xmlCell(value, type = 'String') { if (value === null || value === undefined) value = ''; const safe = esc(value); return `<Cell><Data ss:Type="${type}">${safe}</Data></Cell>`; }
function xmlSheet(name, headers, rows) { const body = [`<Row>${headers.map(x => xmlCell(x)).join('')}</Row>`, ...rows.map(row => `<Row>${row.map(value => xmlCell(value, typeof value === 'number' ? 'Number' : 'String')).join('')}</Row>`)].join(''); return `<Worksheet ss:Name="${esc(name)}"><Table>${body}</Table></Worksheet>`; }
function workbookXml() {
  const spent = state.expenses.reduce((sum, item) => sum + Number(item.amount || 0), 0); const teamRows = state.teams.map(t => [t.id,t.mission,t.status,t.start,t.end,t.people,t.days,t.km,t.total,t.advance]); const expenseRows = state.expenses.map(x => [x.team,x.date,x.type,x.description,x.supplier,x.invoice,x.amount,x.attachment,x.note,x.status]); const companyRows = [['U2 Broadcast América',5,1620000,0,1620000,360000],['U2 Broadcast África',1,270000,270000,540000,540000],['TOTAL',6,1890000,270000,2160000,900000]]; const summaryRows = [['Total previsto',seed.budget.total],['Subtotal previsto',seed.budget.subtotal],['Contingência financeira',seed.budget.contingency],['Reserva de pessoal',seed.budget.personnelReserve],['Comprovado (prestação de contas)',spent],['Saldo estimado para regularizar',Math.max(0,249910-spent)],['Economia por rotas diretas',seed.budget.savings]]; const changeRows = state.changes.map(x => [x.id,x.team,x.type,x.status,x.impact]); const parameterRows = [['Moeda','AOA / Kz'],['Contingência financeira','Incluída no orçamento'],['Regra de aprovação','Apenas alterações Aprovadas alteram orçamento'],['Hospedagem','Não lançada na prestação de contas'],['OCR','Extração assistida com revisão humana']];
  return `<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><DocumentProperties xmlns="urn:schemas-microsoft-com:office:office"><Author>FlowRoute Finance</Author><LastAuthor>FlowRoute Finance</LastAuthor><Created>2026-11-08T09:36:00Z</Created></DocumentProperties><ExcelWorkbook xmlns="urn:schemas-microsoft-com:office:excel"><WindowHeight>9000</WindowHeight><WindowWidth>18000</WindowWidth><ProtectStructure>False</ProtectStructure></ExcelWorkbook><Styles><Style ss:ID="Default" ss:Name="Normal"><Alignment ss:Vertical="Center"/><Font ss:FontName="Arial" ss:Size="10"/></Style></Styles>${xmlSheet('Resumo Financeiro',['Demonstrativo','Valor (AOA)'],summaryRows)}${xmlSheet('Orçamento por equipe',['Equipe','Missão','Status','Início','Fim','Titulares','Diárias equipe','Km rodoviários','Total c/ contingências','Adiantamento sujeito a PC'],teamRows)}${xmlSheet('Diárias por empresa',['Empresa','Pessoas alocadas','Hospedagem','Alimentação','Total diárias','Reserva de pessoal'],companyRows)}${xmlSheet('Prestação de contas',['Equipe','Data','Tipo de despesa','Descrição','Fornecedor / posto','Nº fatura / recibo','Valor (AOA)','Comprovante anexo?','Viatura / obs.','Estado'],expenseRows)}${xmlSheet('Alterações e contingências',['Nº solicitação','Equipe','Tipo','Status','Impacto (AOA)'],changeRows)}${xmlSheet('Parâmetros e notas',['Parâmetro','Valor'],parameterRows)}</Workbook>`;
}
function workbookSheets() {
  const spent = state.expenses.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  return {
    'Resumo Financeiro': [['Demonstrativo','Valor (AOA)'],['Total previsto',seed.budget.total],['Subtotal previsto',seed.budget.subtotal],['Contingência financeira',seed.budget.contingency],['Reserva de pessoal',seed.budget.personnelReserve],['Comprovado (prestação de contas)',spent],['Saldo estimado para regularizar',Math.max(0,249910-spent)],['Economia por rotas diretas',seed.budget.savings]],
    'Orçamento por equipe': [['Equipe','Missão','Status','Início','Fim','Titulares','Diárias equipe','Km rodoviários','Total c/ contingências','Adiantamento sujeito a PC'], ...state.teams.map(t => [t.id,t.mission,t.status,t.start,t.end,t.people,t.days,t.km,t.total,t.advance])],
    'Diárias por empresa': [['Empresa','Pessoas alocadas','Hospedagem','Alimentação','Total diárias','Reserva de pessoal'],['U2 Broadcast América',5,1620000,0,1620000,360000],['U2 Broadcast África',1,270000,270000,540000,540000],['TOTAL',6,1890000,270000,2160000,900000]],
    'Prestação de contas': [['Equipe','Data','Tipo de despesa','Descrição','Fornecedor / posto','Nº fatura / recibo','Valor (AOA)','Comprovante anexo?','Viatura / obs.','Estado'], ...state.expenses.map(x => [x.team,x.date,x.type,x.description,x.supplier,x.invoice,x.amount,x.attachment,x.note,x.status])],
    'Alterações e contingências': [['Nº solicitação','Equipe','Tipo','Status','Impacto (AOA)'], ...state.changes.map(x => [x.id,x.team,x.type,x.status,x.impact])],
    'Parâmetros e notas': [['Parâmetro','Valor'],['Moeda','AOA / Kz'],['Contingência financeira','Incluída no orçamento'],['Regra de aprovação','Apenas alterações Aprovadas alteram orçamento'],['Hospedagem','Não lançada na prestação de contas'],['OCR','Extração assistida com revisão humana']]
  };
}
function downloadWorkbook(prefix) { const sheets = workbookSheets(); if (window.XLSX) { const workbook = window.XLSX.utils.book_new(); Object.entries(sheets).forEach(([name, rows]) => window.XLSX.utils.book_append_sheet(workbook, window.XLSX.utils.aoa_to_sheet(rows), name.slice(0,31))); window.XLSX.writeFile(workbook, `${prefix}_${new Date().toISOString().slice(0,10)}.xlsx`); toast('Relatório .xlsx gerado com 6 demonstrativos.'); return; } const blob = new Blob([workbookXml()], { type:'application/vnd.ms-excel' }); const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href=url; anchor.download=`${prefix}_${new Date().toISOString().slice(0,10)}.xls`; document.body.appendChild(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url); toast('Relatório Excel compatível gerado com 6 demonstrativos.'); }

updateSync(); renderAll();
