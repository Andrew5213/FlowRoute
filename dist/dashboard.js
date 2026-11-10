function dashboardNormalize(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function dashboardSum(rows, key) {
  return (rows || []).reduce((sum, row) => sum + Number(row?.[key] || 0), 0);
}

function dashboardCategoryRealized(label) {
  const key = dashboardNormalize(label);
  const expenses = state.expenses || [];
  if (/diar|hosped|aliment/.test(key)) {
    return dashboardSum((state.paymentRegister || []).filter(row => /diar|hosped|aliment/.test(dashboardNormalize(row.nature))), 'amount');
  }
  if (/passag|aere/.test(key)) {
    return dashboardSum((state.paymentRegister || []).filter(row => /passag|aere/.test(dashboardNormalize(row.nature))), 'amount');
  }
  if (/combust|gasolina|diesel/.test(key)) {
    return dashboardSum(expenses.filter(row => /combust|gasolina|diesel/.test(dashboardNormalize(row.type))), 'amount');
  }
  if (/manut|oficina|repar/.test(key)) {
    return dashboardSum((state.maintenance || []).filter(row => ['paga', 'executada'].includes(dashboardNormalize(row.status))), 'planned');
  }
  if (/outra|extra|consum/.test(key)) {
    const otherExpenses = expenses.filter(row => !/combust|gasolina|diesel/.test(dashboardNormalize(row.type)));
    const paidPurchases = (state.purchases || []).filter(row => dashboardNormalize(row.status) === 'paga');
    return dashboardSum(otherExpenses, 'amount') + dashboardSum(paidPurchases, 'estimated');
  }
  return 0;
}

function dashboardBudgetRows() {
  const categories = state.budget?.categories || [];
  return categories.map(item => {
    const expected = Number(item.expected || 0);
    const realized = dashboardCategoryRealized(item.label);
    const ratio = expected > 0 ? realized / expected * 100 : 0;
    return `<div class="dashboard-budget-row"><div class="dashboard-budget-label"><strong>${esc(item.label)}</strong><span>${money(realized)} / ${money(expected)}</span></div><div class="dashboard-budget-track" role="img" aria-label="${esc(item.label)}: ${Math.round(ratio)} por cento do previsto"><i class="${ratio > 100 ? 'over-budget' : ''}" style="width:${Math.min(100, Math.max(0, ratio))}%"></i></div><span class="dashboard-budget-ratio ${ratio > 100 ? 'over-budget-text' : ''}">${Math.round(ratio)}%</span></div>`;
  }).join('');
}

function dashboardCashFlowRows() {
  const { rows } = cashFlowDataset();
  const groups = new Map();
  rows.forEach(row => {
    const key = row.start ? row.start.slice(0, 7) : 'sem-data';
    if (!groups.has(key)) groups.set(key, { key, forecast: 0, paid: 0, expenses: 0 });
    const group = groups.get(key);
    group.forecast += Number(row.forecast || 0);
    group.paid += Number(row.paid || 0);
    group.expenses += Number(row.expenses || 0);
  });
  const ordered = [...groups.values()].sort((a, b) => a.key.localeCompare(b.key));
  const max = Math.max(1, ...ordered.map(item => item.forecast));
  if (!ordered.length) return '<div class="dashboard-empty">Não há etapas com datas para projetar o caixa.</div>';
  return ordered.map(item => {
    const month = item.key === 'sem-data' ? 'Sem data / etapa' : new Intl.DateTimeFormat('pt-AO', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${item.key}-01T00:00:00Z`));
    const forecastWidth = Math.max(2, item.forecast / max * 100);
    const paidWidth = item.forecast ? Math.min(100, item.paid / item.forecast * 100) : 0;
    const expenseWidth = item.forecast ? Math.min(100, item.expenses / item.forecast * 100) : 0;
    return `<div class="dashboard-month-row"><div class="dashboard-month-head"><strong>${esc(month)}</strong><span>${money(item.forecast)} previstos</span></div><div class="dashboard-month-track"><i style="width:${forecastWidth}%"></i></div><div class="dashboard-month-foot"><span><i class="dashboard-dot paid-dot"></i>Pago ${money(item.paid)} <b style="--fill:${paidWidth}%"></b></span><span><i class="dashboard-dot expense-dot"></i>Despesas ${money(item.expenses)} <b style="--fill:${expenseWidth}%"></b></span></div></div>`;
  }).join('');
}

function dashboardTeamRows() {
  const teams = state.teams || [];
  if (!teams.length) return '<tr><td colspan="7">Nenhuma equipe cadastrada.</td></tr>';
  return teams.map(team => {
    const routes = (state.routes || []).filter(row => String(row.team || '') === String(team.id || ''));
    const members = (state.composition || []).filter(row => String(row.team || '') === String(team.id || '') && dashboardNormalize(row.paper) !== 'reserva').length;
    const kmRecorded = dashboardSum((state.mileage || []).filter(row => String(row.team || '') === String(team.id || '')), 'distance');
    const activeRoutes = routes.filter(row => dashboardNormalize(row.status).includes('vigor')).length;
    const statusClass = dashboardNormalize(team.status).includes('aprov') ? 'good-status' : 'warning-status';
    return `<tr><td><strong>${esc(team.id)}</strong><small>${esc(team.mission || '—')}</small></td><td>${esc(team.leader || '—')}</td><td>${members || Number(team.people || 0) || '—'}</td><td>${routes.length} <small>(${activeRoutes} em vigor)</small></td><td class="align-right"><strong>${money(team.total || 0)}</strong></td><td class="align-right">${Number(team.km || 0).toLocaleString('pt-AO')} km <small>· ${kmRecorded.toLocaleString('pt-AO')} registados</small></td><td><span class="dashboard-status ${statusClass}">${esc(team.status || 'Sem estado')}</span></td></tr>`;
  }).join('');
}

function dashboardRouteRows() {
  const routes = [...(state.routes || [])].sort((a, b) => String(a.departure || '9999').localeCompare(String(b.departure || '9999')) || Number(a.stage || 0) - Number(b.stage || 0));
  const forecastRows = cashFlowDataset().rows;
  if (!routes.length) return '<tr><td colspan="7">Nenhuma etapa planeada.</td></tr>';
  return routes.slice(0, 10).map(route => {
    const projection = forecastRows.find(row => String(row.teamId || '') === String(route.team || '') && row.stage === `Etapa ${route.stage || 1}`);
    return `<tr><td><strong>${esc(route.team || '—')}</strong></td><td>Etapa ${esc(route.stage || '—')}</td><td>${esc(route.origin || '—')} → ${esc(route.destination || '—')}</td><td>${shortDate(route.departure)}</td><td>${Number(route.stay || 0)} dias</td><td><span class="dashboard-status ${dashboardNormalize(route.status).includes('vigor') ? 'good-status' : 'neutral-status'}">${esc(route.status || 'Planejada')}</span></td><td class="align-right">${money(projection?.forecast || 0)}</td></tr>`;
  }).join('');
}

function dashboardPaymentRows() {
  const rows = [...(state.payments || [])].filter(row => Number(row.balance || 0) > 0).sort((a, b) => Number(b.balance || 0) - Number(a.balance || 0));
  if (!rows.length) return '<tr><td colspan="4">Não há saldos pendentes por beneficiário.</td></tr>';
  return rows.slice(0, 6).map(row => `<tr><td><strong>${esc(row.beneficiary || '—')}</strong><small>${esc(row.company || row.front || '—')}</small></td><td class="align-right">${money(row.due || 0)}</td><td class="align-right">${money(row.paid || 0)}</td><td class="align-right"><strong>${money(row.balance || 0)}</strong></td></tr>`).join('');
}

function dashboardExpenseRows() {
  const rows = [...(state.expenses || [])].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  if (!rows.length) return '<tr><td colspan="5">Nenhuma despesa lançada.</td></tr>';
  return rows.slice(0, 7).map(row => `<tr><td><strong>${esc(row.team || '—')}</strong></td><td>${shortDate(row.date)}</td><td>${esc(row.type || '—')}</td><td>${esc(row.supplier || '—')}</td><td class="align-right"><strong>${money(row.amount || 0)}</strong></td></tr>`).join('');
}

function dashboardFleetRows() {
  const fleet = state.fleet || [];
  if (!fleet.length) return '<div class="dashboard-empty">Nenhuma viatura cadastrada.</div>';
  const daysUntil = value => {
    if (!value) return null;
    const target = new Date(`${value}T00:00:00`);
    return Math.ceil((target.getTime() - new Date().setHours(0, 0, 0, 0)) / 86400000);
  };
  return fleet.map(vehicle => {
    const days = daysUntil(vehicle.nextService);
    const dueLabel = days === null ? 'Sem data de revisão' : days < 0 ? `Revisão vencida há ${Math.abs(days)} dias` : days <= 30 ? `Revisão em ${days} dias` : `Próxima revisão ${shortDate(vehicle.nextService)}`;
    const statusClass = dashboardNormalize(vehicle.status).includes('dia') && (days === null || days > 0) ? 'good-status' : 'warning-status';
    return `<div class="dashboard-fleet-row"><span class="dashboard-vehicle-icon">▣</span><div><strong>${esc(vehicle.vehicle || 'Viatura')}</strong><span>${esc(vehicle.plate || 'Sem matrícula')} · ${Number(vehicle.odometer || 0).toLocaleString('pt-AO')} km</span></div><div class="dashboard-fleet-status"><span class="dashboard-status ${statusClass}">${esc(vehicle.status || 'Sem estado')}</span><small>${esc(dueLabel)}</small></div></div>`;
  }).join('');
}

function dashboardAttentionItems() {
  const items = [];
  (state.changes || []).filter(row => dashboardNormalize(row.status) === 'pendente').forEach(row => items.push({ module: 'changes', icon: '↻', title: `Alteração ${row.id || ''}`, detail: `${row.type || 'Alteração'} · ${row.team || 'Sem equipe'} · impacto ${money(row.impact || 0)}`, tone: 'warning' }));
  (state.purchases || []).filter(row => !['paga', 'cancelada'].includes(dashboardNormalize(row.status))).forEach(row => items.push({ module: 'purchases', icon: '＋', title: `Compra ${row.id || ''} aguardando`, detail: `${row.item || 'Item'} · ${row.team || 'Sem equipe'} · ${money(row.estimated || 0)}`, tone: 'coral' }));
  (state.fleet || []).filter(row => dashboardNormalize(row.status) !== 'em dia').forEach(row => items.push({ module: 'fleet', icon: '▣', title: `${row.vehicle || 'Viatura'} precisa de atenção`, detail: `${row.status || 'Estado pendente'} · revisão ${shortDate(row.nextService)}`, tone: 'blue' }));
  const missingBank = (state.bank || []).filter(row => dashboardNormalize(row.status) !== 'validada');
  if (missingBank.length) items.push({ module: 'bank', icon: '▤', title: `${missingBank.length} conta(s) bancária(s) por validar`, detail: missingBank.slice(0, 2).map(row => row.employee).join(' · '), tone: 'blue' });
  const owing = (state.payments || []).filter(row => Number(row.balance || 0) > 0).length;
  if (owing) items.push({ module: 'payments', icon: '＄', title: `${owing} beneficiário(s) com saldo a pagar`, detail: `Saldo total ${money(dashboardSum(state.payments.filter(row => Number(row.balance || 0) > 0), 'balance'))}`, tone: 'warning' });
  return items;
}

function dashboardActivityRows() {
  const activity = [];
  (state.expenses || []).forEach(row => activity.push({ date: row.date, module: 'accounting', icon: '✓', title: `Despesa · ${row.type || 'Lançamento'}`, detail: `${row.team || 'Sem equipe'} · ${row.supplier || row.description || 'Sem fornecedor'}`, value: row.amount, status: row.status }));
  (state.paymentRegister || []).forEach(row => activity.push({ date: row.date, module: 'paymentRegister', icon: '⇄', title: `Pagamento · ${row.beneficiary || row.nature || 'Transferência'}`, detail: `${row.nature || 'Pagamento'} · ${row.reference || 'Sem referência'}`, value: row.amount, status: 'Registado' }));
  (state.purchases || []).forEach(row => activity.push({ date: row.date, module: 'purchases', icon: '＋', title: `Compra · ${row.item || 'Solicitação'}`, detail: `${row.requester || 'Solicitante'} · ${row.team || 'Sem equipe'}`, value: row.estimated, status: row.status }));
  (state.changes || []).forEach(row => activity.push({ date: row.date, module: 'changes', icon: '↻', title: `Alteração · ${row.type || 'Rota'}`, detail: `${row.team || 'Sem equipe'} · ${row.newDestination || ''}`, value: row.impact, status: row.status }));
  (state.maintenance || []).forEach(row => activity.push({ date: row.date, module: 'maintenance', icon: '⚒', title: `Manutenção · ${row.vehicle || 'Viatura'}`, detail: `${row.type || ''} · ${row.provider || 'Sem oficina'}`, value: row.planned, status: row.status }));
  return activity.sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))).slice(0, 8);
}

function renderEnhancedSummary() {
  const host = byId('dashboardHost');
  if (!host) return;
  const t = totals();
  const cash = cashFlowDataset();
  const teams = state.teams || [];
  const teamBudget = dashboardSum(teams, 'total');
  const teamKm = dashboardSum(teams, 'km');
  const recordedKm = dashboardSum(state.mileage || [], 'distance');
  const payments = state.payments || [];
  const dueTotal = dashboardSum(payments, 'due');
  const paidByBeneficiary = dashboardSum(payments, 'paid');
  const dueBalance = dashboardSum(payments, 'balance');
  const routes = state.routes || [];
  const activeRoutes = routes.filter(row => dashboardNormalize(row.status).includes('vigor')).length;
  const pendingItems = dashboardAttentionItems();
  const routeDates = routes.map(row => row.departure).filter(Boolean).sort();
  const campaignRange = routeDates.length ? `${shortDate(routeDates[0])} – ${shortDate(routeDates[routeDates.length - 1])}` : 'Sem datas de rota';
  const utilization = state.budget.total ? Math.min(100, Math.round((t.realized + t.paid) / Number(state.budget.total) * 100)) : 0;
  const kpis = [
    ['Orçamento global', money(state.budget.total), `Subtotal ${money(state.budget.subtotal)} · contingência ${money(state.budget.contingency)}`, '◎', 'blue'],
    ['Distribuído às equipes', money(teamBudget), `${teams.length} equipes · ${money(Math.max(0, Number(state.budget.total || 0) - teamBudget))} sem distribuição`, '♧', 'green'],
    ['Transferências registadas', money(t.paid), `${(state.paymentRegister || []).length} pagamentos · ${money(dueTotal)} devidos`, '⇄', 'blue'],
    ['Despesas comprovadas', money(t.expenses), `${(state.expenses || []).length} lançamentos · prestação de contas`, '✓', 'coral'],
    ['Saldo do orçamento', money(t.balance), `${utilization}% consumido/comprometido no ciclo`, '↘', 'gold'],
    ['A pagar a beneficiários', money(dueBalance), `${payments.filter(row => Number(row.balance || 0) > 0).length} beneficiários · ${money(paidByBeneficiary)} já pago`, '＄', 'gold'],
    ['Etapas das rotas', String(routes.length), `${activeRoutes} em vigor · ${Math.max(0, routes.length - activeRoutes)} por iniciar`, '↝', 'green'],
    ['Quilometragem', `${teamKm.toLocaleString('pt-AO')} km`, `${recordedKm.toLocaleString('pt-AO')} km registados · plano das equipes`, '⌗', 'coral']
  ];

  const budgetRows = dashboardBudgetRows();
  const flowRows = dashboardCashFlowRows();
  const teamRows = dashboardTeamRows();
  const routeRows = dashboardRouteRows();
  const paymentRows = dashboardPaymentRows();
  const expenseRows = dashboardExpenseRows();
  const fleetRows = dashboardFleetRows();
  const activityRows = dashboardActivityRows();
  const attentionRows = pendingItems.length
    ? pendingItems.slice(0, 8).map(item => `<button class="dashboard-attention-item" data-module-target="${esc(item.module)}"><span class="dashboard-attention-icon ${item.tone}">${item.icon}</span><span class="dashboard-attention-copy"><strong>${esc(item.title)}</strong><small>${esc(item.detail)}</small></span><span class="arrow">→</span></button>`).join('')
    : '<div class="dashboard-empty">Nenhuma pendência financeira ou operacional identificada.</div>';
  const activityMarkup = activityRows.length
    ? activityRows.map(item => `<button class="dashboard-activity-row" data-module-target="${esc(item.module)}"><span class="dashboard-activity-icon">${item.icon}</span><span class="dashboard-activity-copy"><strong>${esc(item.title)}</strong><small>${shortDate(item.date)} · ${esc(item.detail)}</small></span><span class="dashboard-activity-value">${money(item.value || 0)}<small>${esc(item.status || '')}</small></span></button>`).join('')
    : '<div class="dashboard-empty">Nenhuma movimentação registada.</div>';

  host.innerHTML = `<div class="dashboard-shell">
    <div class="page-heading dashboard-heading"><div><div class="kicker">PAINEL EXECUTIVO · FINANÇAS E OPERAÇÃO</div><h1>Dashboard</h1><p>Visão integrada do orçamento, missões, pagamentos, despesas e frota · ${esc(campaignRange)}</p></div><div class="heading-actions"><button class="button secondary" data-module-target="accounting"><span>＋</span> Lançar despesa</button><button class="button secondary" data-module-target="cashflow"><span>↘</span> Fluxo de caixa</button><button class="button primary" id="quickReport" data-module-target="reports"><span>↓</span> Relatórios</button></div></div>
    <div class="dashboard-kpi-grid">${kpis.map(([label, value, detail, icon, accent]) => `<article class="dashboard-kpi accent-${accent}"><div class="dashboard-kpi-head"><span>${esc(label)}</span><i>${icon}</i></div><strong>${esc(value)}</strong><small>${esc(detail)}</small></article>`).join('')}</div>
    <div class="dashboard-grid dashboard-grid-finance"><article class="panel dashboard-panel"><div class="panel-heading"><div><h2>Orçamento por natureza</h2><p>Realizado em relação ao previsto · valores em AOA</p></div><span class="panel-tag">${money(t.realized + t.paid)} contabilizados</span></div><div class="dashboard-budget-list">${budgetRows || '<div class="dashboard-empty">Sem categorias de orçamento.</div>'}</div><div class="dashboard-panel-footer"><span><i class="dashboard-legend-expected"></i> Previsto</span><span><i class="dashboard-legend-realized"></i> Realizado / pago por natureza</span><span>Contingência ${money(state.budget.contingency)}</span></div></article><article class="panel dashboard-panel"><div class="panel-heading"><div><h2>Previsão de caixa por mês</h2><p>Organizada pela data de início de cada etapa</p></div><button class="text-button" data-module-target="cashflow">Abrir fluxo <span>→</span></button></div><div class="dashboard-month-list">${flowRows}</div><div class="dashboard-panel-footer"><span>Previsto ${money(cash.metrics.forecast)}</span><span>Pago ${money(cash.metrics.paid)}</span><span>Despesas ${money(cash.metrics.expenses)}</span></div></article></div>
    <div class="dashboard-grid dashboard-grid-operations"><article class="panel dashboard-panel"><div class="panel-heading"><div><h2>Equipes e orçamento</h2><p>${teams.length} equipes · titulares, etapas, valores e quilometragem</p></div><button class="text-button" data-module-target="teams">Gerir equipes <span>→</span></button></div><div class="table-scroll"><table class="data-table dashboard-table dashboard-teams-table"><thead><tr><th>Equipe / missão</th><th>Líder</th><th>Pessoas</th><th>Etapas</th><th class="align-right">Orçamento</th><th class="align-right">Km previstos / registados</th><th>Estado</th></tr></thead><tbody>${teamRows}</tbody></table></div><div class="dashboard-panel-footer"><span>Orçamento das equipes ${money(teamBudget)}</span><span>Distância planeada ${teamKm.toLocaleString('pt-AO')} km</span><span>Registada ${recordedKm.toLocaleString('pt-AO')} km</span></div></article><article class="panel dashboard-panel"><div class="panel-heading"><div><h2>Pagamentos por beneficiário</h2><p>Conciliação de valores devidos, pagos e em aberto</p></div><button class="text-button" data-module-target="payments">Ver pagamentos <span>→</span></button></div><div class="dashboard-payment-summary"><div><span>Total devido</span><strong>${money(dueTotal)}</strong></div><div><span>Já pago</span><strong>${money(paidByBeneficiary)}</strong></div><div><span>Em aberto</span><strong>${money(dueBalance)}</strong></div></div><div class="table-scroll"><table class="data-table dashboard-table"><thead><tr><th>Beneficiário</th><th class="align-right">Devido</th><th class="align-right">Pago</th><th class="align-right">Saldo</th></tr></thead><tbody>${paymentRows}</tbody></table></div></article></div>
    <div class="dashboard-grid dashboard-grid-operations"><article class="panel dashboard-panel"><div class="panel-heading"><div><h2>Calendário das etapas</h2><p>${routes.length} etapas · ${activeRoutes} em vigor · previsão financeira estimada</p></div><button class="text-button" data-module-target="routes">Abrir rotas <span>→</span></button></div><div class="table-scroll"><table class="data-table dashboard-table dashboard-route-table"><thead><tr><th>Equipe</th><th>Etapa</th><th>Percurso</th><th>Início</th><th>Duração</th><th>Estado</th><th class="align-right">Previsão</th></tr></thead><tbody>${routeRows}</tbody></table></div>${routes.length > 10 ? `<div class="dashboard-panel-footer"><span>A mostrar 10 de ${routes.length} etapas.</span></div>` : ''}</article><article class="panel dashboard-panel"><div class="panel-heading"><div><h2>Pendências que exigem atenção</h2><p>${pendingItems.length} alertas financeiros e operacionais</p></div><span class="alert-count">${pendingItems.length}</span></div><div class="dashboard-attention-list">${attentionRows}</div></article></div>
    <div class="dashboard-grid dashboard-grid-operations"><article class="panel dashboard-panel"><div class="panel-heading"><div><h2>Despesas recentes</h2><p>${(state.expenses || []).length} comprovativos · total lançado ${money(t.expenses)}</p></div><button class="text-button" data-module-target="accounting">Abrir prestação <span>→</span></button></div><div class="table-scroll"><table class="data-table dashboard-table"><thead><tr><th>Equipe</th><th>Data</th><th>Natureza</th><th>Fornecedor</th><th class="align-right">Valor</th></tr></thead><tbody>${expenseRows}</tbody></table></div></article><article class="panel dashboard-panel"><div class="panel-heading"><div><h2>Estado da frota</h2><p>${(state.fleet || []).length} viaturas · situação e próxima revisão</p></div><button class="text-button" data-module-target="fleet">Ver frota <span>→</span></button></div><div class="dashboard-fleet-list">${fleetRows}</div></article></div>
    <article class="panel dashboard-panel dashboard-activity-panel"><div class="panel-heading"><div><h2>Movimentações recentes</h2><p>Pagamentos, despesas, compras, alterações e manutenção</p></div><span class="panel-tag">Últimas 8</span></div><div class="dashboard-activity-list">${activityMarkup}</div></article>
    <details class="panel dashboard-modules-panel"><summary><span><strong>Todos os módulos</strong><small>Acesso rápido aos módulos disponíveis para o seu perfil</small></span><span class="dashboard-modules-toggle">＋</span></summary><div class="module-shortcuts" id="moduleShortcuts"></div></details>
  </div>`;
  renderShortcuts();
}
