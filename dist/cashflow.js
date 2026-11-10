function cashFlowDateOffset(value, days) {
  if (!value || !Number.isFinite(Number(days)) || Number(days) < 1) return '';
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return '';
  date.setUTCDate(date.getUTCDate() + Number(days) - 1);
  return date.toISOString().slice(0, 10);
}

function cashFlowDataset() {
  const rows = [];
  const teams = Array.isArray(state.teams) ? state.teams : [];
  const routes = Array.isArray(state.routes) ? state.routes : [];

  teams.forEach(team => {
    const teamRoutes = routes
      .filter(route => String(route.team || '').trim() === String(team.id || '').trim())
      .sort((a, b) => String(a.departure || '').localeCompare(String(b.departure || '')) || Number(a.stage || 0) - Number(b.stage || 0));
    const total = Number(team.total || 0);
    if (!teamRoutes.length) {
      rows.push({ teamId: team.id, team: team.id || '—', stage: 'Sem etapa', destination: team.mission || 'Sem rota cadastrada', start: '', end: '', days: 0, forecast: total, paid: 0, expenses: 0 });
      return;
    }

    const weights = teamRoutes.map(route => Math.max(0, Number(route.stay || 0)));
    const weightTotal = weights.reduce((sum, value) => sum + value, 0) || teamRoutes.length;
    let assigned = 0;
    teamRoutes.forEach((route, index) => {
      const days = weights[index] || (weights.some(Boolean) ? 0 : 1);
      const forecast = index === teamRoutes.length - 1
        ? total - assigned
        : Math.round(total * (days || 0) / weightTotal);
      assigned += forecast;
      const stay = Math.max(0, Number(route.stay || 0));
      rows.push({
        teamId: team.id,
        team: team.id || '—',
        stage: `Etapa ${route.stage || index + 1}`,
        destination: [route.origin, route.destination].filter(Boolean).join(' → ') || '—',
        start: route.departure || '',
        end: cashFlowDateOffset(route.departure, stay),
        days: stay,
        forecast,
        paid: 0,
        expenses: 0
      });
    });
  });

  const teamBudget = teams.reduce((sum, team) => sum + Number(team.total || 0), 0);
  const globalBudget = Number(state.budget?.total || 0);
  if (globalBudget > teamBudget) {
    rows.push({ teamId: '', team: '—', stage: 'Não distribuído', destination: 'Orçamento ainda sem equipe ou etapa', start: '', end: '', days: 0, forecast: globalBudget - teamBudget, paid: 0, expenses: 0 });
  }

  const teamRouteRows = teamId => rows.filter(row => String(row.teamId || '') === String(teamId || '') && row.teamId);
  const findStage = (teamId, dateValue) => {
    const choices = teamRouteRows(teamId);
    if (!choices.length) return null;
    const date = dateValue && !Number.isNaN(Date.parse(`${dateValue}T00:00:00Z`)) ? Date.parse(`${dateValue}T00:00:00Z`) : null;
    if (date !== null) {
      const containing = choices.find(row => {
        if (!row.start) return false;
        const start = Date.parse(`${row.start}T00:00:00Z`);
        const end = Date.parse(`${(row.end || row.start)}T00:00:00Z`);
        return date >= start && date <= end;
      });
      if (containing) return containing;
      return choices.reduce((closest, row) => {
        if (!row.start) return closest;
        const distance = Math.abs(Date.parse(`${row.start}T00:00:00Z`) - date);
        return !closest || distance < closest.distance ? { row, distance } : closest;
      }, null)?.row || choices[0];
    }
    return choices[0];
  };

  const purchaseTeam = reference => {
    const purchase = (state.purchases || []).find(row => String(row.id || '').toLowerCase() === String(reference || '').trim().toLowerCase());
    return purchase?.team || '';
  };
  (state.paymentRegister || []).forEach(payment => {
    const reference = String(payment.reference || '').trim();
    const team = teams.find(item => String(item.id || '').toLowerCase() === reference.toLowerCase());
    const teamId = team?.id || purchaseTeam(reference);
    const row = teamId ? findStage(teamId, payment.date) : null;
    if (row) row.paid += Number(payment.amount || 0);
    else {
      let unassigned = rows.find(item => item.stage === 'Sem equipe / etapa');
      if (!unassigned) {
        unassigned = { teamId: '', team: '—', stage: 'Sem equipe / etapa', destination: 'Pagamento sem equipe ou etapa identificada', start: '', end: '', days: 0, forecast: 0, paid: 0, expenses: 0 };
        rows.push(unassigned);
      }
      unassigned.paid += Number(payment.amount || 0);
    }
  });
  (state.expenses || []).forEach(expense => {
    const row = findStage(expense.team, expense.date);
    if (row) row.expenses += Number(expense.amount || 0);
    else {
      let unassigned = rows.find(item => item.stage === 'Sem equipe / etapa');
      if (!unassigned) {
        unassigned = { teamId: '', team: '—', stage: 'Sem equipe / etapa', destination: 'Despesa sem equipe ou etapa identificada', start: '', end: '', days: 0, forecast: 0, paid: 0, expenses: 0 };
        rows.push(unassigned);
      }
      unassigned.expenses += Number(expense.amount || 0);
    }
  });

  rows.sort((a, b) => (a.start || '9999-12-31').localeCompare(b.start || '9999-12-31') || String(a.team).localeCompare(String(b.team), 'pt-AO') || String(a.stage).localeCompare(String(b.stage), 'pt-AO'));
  const metrics = {
    budget: globalBudget,
    distributed: teamBudget,
    forecast: rows.reduce((sum, row) => sum + Number(row.forecast || 0), 0),
    paid: (state.paymentRegister || []).reduce((sum, row) => sum + Number(row.amount || 0), 0),
    expenses: (state.expenses || []).reduce((sum, row) => sum + Number(row.amount || 0), 0)
  };
  return { rows, metrics };
}

function cashFlowRows() {
  const { rows } = cashFlowDataset();
  const table = [['Equipe', 'Etapa', 'Origem → destino', 'Início previsto', 'Fim previsto', 'Dias', 'Previsão (AOA)', 'Pagamentos registados (AOA)', 'Despesas lançadas (AOA)', 'Saldo após pagamentos (AOA)']];
  rows.forEach(row => table.push([row.team, row.stage, row.destination, row.start, row.end, row.days || '', Number(row.forecast || 0), Number(row.paid || 0), Number(row.expenses || 0), Number(row.forecast || 0) - Number(row.paid || 0)]));
  table.push(['TOTAL', '', '', '', '', '', rows.reduce((sum, row) => sum + Number(row.forecast || 0), 0), rows.reduce((sum, row) => sum + Number(row.paid || 0), 0), rows.reduce((sum, row) => sum + Number(row.expenses || 0), 0), rows.reduce((sum, row) => sum + Number(row.forecast || 0) - Number(row.paid || 0), 0)]);
  return table;
}

function renderCashFlow() {
  const { rows, metrics } = cashFlowDataset();
  const body = rows.map(row => `<tr><td><strong>${esc(row.team)}</strong></td><td>${esc(row.stage)}</td><td>${esc(row.destination)}</td><td>${row.start ? `${shortDate(row.start)}${row.end && row.end !== row.start ? ` – ${shortDate(row.end)}` : ''}` : '—'}</td><td>${row.days ? `${row.days} dias` : '—'}</td><td class="align-right"><strong>${money(row.forecast)}</strong></td><td class="align-right">${money(row.paid)}</td><td class="align-right">${money(row.expenses)}</td><td class="align-right">${money(Number(row.forecast || 0) - Number(row.paid || 0))}</td></tr>`).join('');
  const totals = [rows.reduce((sum, row) => sum + Number(row.forecast || 0), 0), rows.reduce((sum, row) => sum + Number(row.paid || 0), 0), rows.reduce((sum, row) => sum + Number(row.expenses || 0), 0)];
  byId('moduleHost').innerHTML = `<div class="page-heading compact-heading"><div><div class="kicker">ADMINISTRADOR · FINANCEIRO</div><h1>Fluxo de Caixa</h1><p>Previsão do desembolso global e por etapa das equipes.</p></div><div class="heading-actions"><button class="button secondary" id="cashFlowPdf"><span>↓</span> Baixar PDF</button><button class="button primary" id="cashFlowExcel"><span>↓</span> Baixar Excel</button></div></div><div class="metric-grid cashflow-metrics"><article class="metric-card accent-blue"><div class="metric-top"><span class="metric-label">Desembolso global previsto</span><span class="metric-icon">◎</span></div><div class="metric-value">${money(metrics.budget)}</div><div class="metric-foot"><span>Orçamento total registado</span></div></article><article class="metric-card accent-green"><div class="metric-top"><span class="metric-label">Distribuído às equipes</span><span class="metric-icon">↘</span></div><div class="metric-value">${money(metrics.distributed)}</div><div class="metric-foot"><span>Soma dos orçamentos das equipes</span></div></article><article class="metric-card accent-gold"><div class="metric-top"><span class="metric-label">Pagamentos registados</span><span class="metric-icon">⇄</span></div><div class="metric-value">${money(metrics.paid)}</div><div class="metric-foot"><span>Transferências lançadas</span></div></article><article class="metric-card accent-coral"><div class="metric-top"><span class="metric-label">Despesas lançadas</span><span class="metric-icon">✓</span></div><div class="metric-value">${money(metrics.expenses)}</div><div class="metric-foot"><span>Prestação de contas</span></div></article></div><article class="panel cashflow-panel"><div class="panel-heading"><div><h2>Previsão por etapa</h2><p>${rows.length} linhas · valores em AOA</p></div><span class="panel-tag">${money(metrics.forecast)} no plano</span></div><p class="cashflow-note">O orçamento de cada equipe é distribuído entre as etapas proporcionalmente aos dias de permanência. O valor global ainda sem equipe aparece como “Não distribuído”. Pagamentos e despesas comprovadas ficam separados para facilitar a conciliação.</p><div class="table-scroll"><table class="data-table cashflow-table"><thead><tr><th>Equipe</th><th>Etapa</th><th>Origem → destino</th><th>Período previsto</th><th>Duração</th><th class="align-right">Previsão</th><th class="align-right">Pago</th><th class="align-right">Despesas</th><th class="align-right">Saldo previsto</th></tr></thead><tbody>${body || '<tr><td colspan="9">Não há equipes ou etapas para calcular.</td></tr>'}</tbody><tfoot><tr><th colspan="5">Total do fluxo</th><th class="align-right">${money(totals[0])}</th><th class="align-right">${money(totals[1])}</th><th class="align-right">${money(totals[2])}</th><th class="align-right">${money(totals[0] - totals[1])}</th></tr></tfoot></table></div></article>`;
  byId('cashFlowPdf')?.addEventListener('click', downloadCashFlowPdf);
  byId('cashFlowExcel')?.addEventListener('click', downloadCashFlowExcel);
}

function downloadCashFlowPdf() {
  const JsPDF = window.jspdf?.jsPDF;
  if (!JsPDF) return toast('Biblioteca PDF ainda não carregada.');
  const { metrics } = cashFlowDataset();
  const data = cashFlowRows();
  const doc = new JsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('FlowRoute Finance · Fluxo de Caixa', 30, 34);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`Gerado em ${new Date().toLocaleString('pt-AO')} · Orçamento global: ${money(metrics.budget)} · Distribuído às equipes: ${money(metrics.distributed)} · Pagamentos: ${money(metrics.paid)}`, 30, 52);
  const body = data.slice(1).map(row => row.map((value, index) => [6, 7, 8, 9].includes(index) ? money(value) : String(value ?? '')));
  doc.autoTable({ startY: 64, head: [data[0]], body, theme: 'grid', styles: { fontSize: 7, cellPadding: 4 }, margin: { left: 30, right: 30 } });
  doc.save(`PEMx-RNA_Fluxo_de_Caixa_${new Date().toISOString().slice(0, 10)}.pdf`);
  toast('Fluxo de caixa em PDF gerado.');
}

function downloadCashFlowExcel() {
  if (!window.XLSX) return toast('Biblioteca Excel ainda não carregada.');
  const workbook = window.XLSX.utils.book_new();
  window.XLSX.utils.book_append_sheet(workbook, window.XLSX.utils.aoa_to_sheet(cashFlowRows()), 'Fluxo de Caixa');
  window.XLSX.writeFile(workbook, `PEMx-RNA_Fluxo_de_Caixa_${new Date().toISOString().slice(0, 10)}.xlsx`);
  toast('Fluxo de caixa em Excel gerado.');
}
