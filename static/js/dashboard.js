let trendChartInstance = null;
let healthChartInstance = null;
let expenseChartInstance = null;
let forecastPreviewChartInstance = null;

let startPicker = null;
let endPicker = null;
let systemMinDate = "2025-01-01";
let systemMaxDate = new Date().toISOString().split('T')[0];

// Consistent color palette (matches the legend in dashboard.html)
const CHART_COLORS = {
    sales:    { line: '#22c55e', fill: 'rgba(34, 197, 94, 0.12)' },
    expenses: { line: '#f97316', fill: 'rgba(249, 115, 22, 0.12)' },
    expense_categories: ['#f97316', '#3b82f6', '#22c55e', '#a855f7', '#ef4444', '#eab308', '#14b8a6', '#ec4899']
};

document.addEventListener('DOMContentLoaded', () => {
    const startInput   = document.getElementById('startDate');
    const endInput     = document.getElementById('endDate');
    const analysisSelect = document.getElementById('analysisType');

    const checkDateLimits = () => {
        const minDate = systemMinDate;
        const maxDate = systemMaxDate;
        const startVal = startInput ? startInput.value : '';
        const endVal = endInput ? endInput.value : '';

        if (startVal && startVal < minDate) {
            showAlert(`Start date cannot be before January 1, 2025.`, 'Invalid Date', 'error');
            if (startPicker) startPicker.setDate(minDate);
        } else if (startVal > maxDate) {
            showAlert(`Start date cannot be after ${maxDate}.`, 'Invalid Date', 'error');
            if (startPicker) startPicker.setDate(maxDate);
        }

        if (endVal && endVal < minDate) {
            showAlert(`End date cannot be before January 1, 2025.`, 'Invalid Date', 'error');
            if (endPicker) endPicker.setDate(minDate);
        } else if (endVal > maxDate) {
            showAlert(`End date cannot be after ${maxDate}.`, 'Invalid Date', 'error');
            if (endPicker) endPicker.setDate(maxDate);
        }

        if (startVal && endVal && startVal > endVal) {
            showAlert('Start date cannot be after end date.', 'Invalid Date', 'error');
            const endD = new Date(endVal);
            endD.setMonth(endD.getMonth() - 6);
            let fallbackStart = endD.toISOString().split('T')[0];
            if (fallbackStart < minDate) fallbackStart = minDate;
            if (startPicker) startPicker.setDate(fallbackStart);
        }
    };

    if (analysisSelect) analysisSelect.addEventListener('change', refreshDashboard);

    // Default date range: last 6 months (clamped to min date)
    if (startInput && endInput) {
        const today = new Date().toISOString().split('T')[0];
        const endD   = new Date();
        const startD = new Date();
        startD.setMonth(startD.getMonth() - 6);
        let startVal = startD.toISOString().split('T')[0];
        if (startVal < systemMinDate) startVal = systemMinDate;
        const endVal   = endD.toISOString().split('T')[0];

        startPicker = flatpickr(startInput, {
            defaultDate: startVal,
            minDate: systemMinDate,
            maxDate: today,
            dateFormat: "Y-m-d",
            disableMobile: true,
            onChange: () => {
                checkDateLimits();
                refreshDashboard();
            }
        });

        endPicker = flatpickr(endInput, {
            defaultDate: endVal,
            minDate: systemMinDate,
            maxDate: today,
            dateFormat: "Y-m-d",
            disableMobile: true,
            onChange: () => {
                checkDateLimits();
                refreshDashboard();
            }
        });
    }

    fetchDashboardData();
});

function refreshDashboard() {
    fetchDashboardData();
}

function showDashboardLoading() {
    // Summary cards skeleton
    const cards = document.getElementById('summaryCards');
    if (cards) {
        cards.innerHTML = [1,2,3,4].map(() => `
            <div class="col-md-3">
                <div class="card h-100 p-4">
                    <div class="placeholder-glow">
                        <span class="placeholder col-6 mb-2 rounded"></span>
                        <span class="placeholder col-8 mb-3 rounded" style="height:2rem;"></span>
                        <span class="placeholder col-10 rounded"></span>
                    </div>
                </div>
            </div>
        `).join('');
    }
}

function showDashboardError(message) {
    const cards = document.getElementById('summaryCards');
    if (cards) {
        cards.innerHTML = `
            <div class="col-12">
                <div class="alert alert-warning d-flex align-items-center gap-3 rounded-3 border-0 shadow-sm mb-0">
                    <i class="fa-solid fa-triangle-exclamation fs-5"></i>
                    <div>
                        <strong>Could not load dashboard data.</strong>
                        <span class="ms-1">${message || 'Please check your connection and try refreshing.'}</span>
                    </div>
                    <button class="btn btn-sm btn-outline-warning ms-auto rounded-3 fw-semibold" onclick="fetchDashboardData()">
                        <i class="fa-solid fa-rotate-right me-1"></i> Retry
                    </button>
                </div>
            </div>
        `;
    }
}

async function fetchDashboardData() {
    const startVal = document.getElementById('startDate')?.value || '';
    const endVal   = document.getElementById('endDate')?.value || '';
    const typeVal  = document.getElementById('analysisType')?.value || 'Growth';

    showDashboardLoading();

    try {
        const url = `/dashboard/api/metrics?start_date=${startVal}&end_date=${endVal}&analysis_type=${typeVal}`;
        const response = await authFetch(url);

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.detail || `Server error ${response.status}`);
        }

        const data = await response.json();

        // Update system date boundaries dynamically from available data
        if (data.earliest_date && data.latest_date) {
            systemMinDate = data.earliest_date;
            systemMaxDate = data.latest_date;

            if (startPicker) {
                startPicker.set('minDate', systemMinDate);
                startPicker.set('maxDate', systemMaxDate);
            }
            if (endPicker) {
                endPicker.set('minDate', systemMinDate);
                endPicker.set('maxDate', systemMaxDate);
            }
        }

        renderSummaryCards(data.summary);
        renderForecastPreview(data.forecast_preview);
        renderTrendChart(data.monthly_trend);
        renderHealthScore(data.health_score, data.health_classification, data.health_factors, data.summary.profit_margin, data.health_factor_labels);
        renderExpenseChart(data.expense_breakdown, startVal, endVal);
        renderInsights(data.insights);

    } catch (error) {
        console.error('Dashboard fetch error:', error);
        showDashboardError(error.message);
    }
}


function formatCurrency(amount) {
    return new Intl.NumberFormat('en-PH', {
        style: 'currency',
        currency: 'PHP',
        minimumFractionDigits: 0
    }).format(amount);
}

function formatAxisCurrency(value) {
    if (Math.abs(value) >= 1_000_000) return '₱' + (value / 1_000_000).toFixed(1) + 'M';
    if (Math.abs(value) >= 1_000)     return '₱' + (value / 1_000).toFixed(0) + 'k';
    return '₱' + value;
}

function renderSummaryCards(summary) {
    const container = document.getElementById('summaryCards');
    if (!container) return;

    const salesIsPos   = summary.sales_trend.startsWith('+');
    const expensesIsPos = summary.expenses_trend.startsWith('+');
    const profitIsPos  = summary.profit_trend.startsWith('+');
    const marginIsPos  = summary.margin_trend.startsWith('+');

    const cards = [
        { 
            title: 'Total sales',    
            amount: formatCurrency(summary.total_sales),    
            trend: summary.sales_trend,    
            color: salesIsPos   ? 'success' : 'danger', 
            isUp: salesIsPos,
            icon: 'fa-arrow-trend-up',
            iconColor: '#10b981',
            iconBg: 'rgba(16, 185, 129, 0.1)'
        },
        { 
            title: 'Total expenses', 
            amount: formatCurrency(summary.total_expenses),  
            trend: summary.expenses_trend, 
            color: expensesIsPos ? 'danger'  : 'success', 
            isUp: expensesIsPos,
            icon: 'fa-receipt',
            iconColor: '#ef4444',
            iconBg: 'rgba(239, 68, 68, 0.1)'
        },
        { 
            title: 'Net profit',     
            amount: formatCurrency(summary.net_profit),      
            trend: summary.profit_trend,   
            color: profitIsPos  ? 'success' : 'danger', 
            isUp: profitIsPos,
            icon: 'fa-wallet',
            iconColor: '#3b82f6',
            iconBg: 'rgba(59, 130, 246, 0.1)'
        },
        { 
            title: 'Profit margin',  
            amount: summary.profit_margin + '%',             
            trend: summary.margin_trend,   
            color: marginIsPos  ? 'success' : 'danger', 
            isUp: marginIsPos,
            icon: 'fa-percent',
            iconColor: '#8b5cf6',
            iconBg: 'rgba(139, 92, 246, 0.1)'
        }
    ];

    container.innerHTML = cards.map(c => `
        <div class="col-md-3">
            <div class="card h-100 p-4">
                <div class="d-flex justify-content-between align-items-start mb-3">
                    <div>
                        <div class="text-secondary fw-bold mb-1 small text-uppercase" style="letter-spacing:.5px; font-size:0.75rem;">${c.title}</div>
                        <h3 class="fw-bold mb-0 text-primary" style="font-size:1.6rem; letter-spacing:-0.5px;">${c.amount}</h3>
                    </div>
                    <div style="width: 42px; height: 42px; border-radius: 12px; background: ${c.iconBg}; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                        <i class="fa-solid ${c.icon}" style="color: ${c.iconColor}; font-size: 1.15rem;"></i>
                    </div>
                </div>
                <div class="d-flex align-items-center flex-wrap gap-1 mt-auto pt-2" style="font-size: 0.8rem;">
                    <span class="trend-${c.isUp ? 'up' : 'down'}">
                        <i class="fa-solid fa-arrow-${c.isUp ? 'trend-up' : 'trend-down'} me-1"></i>${c.trend}
                    </span>
                    <span class="text-muted">vs last mo.</span>
                </div>
            </div>
        </div>
    `).join('');
}

// ── Forecast Preview Chart ────────────────────────────────────────────────────
function renderForecastPreview(fc) {
    const canvas = document.getElementById('forecastPreviewChart');
    if (!canvas || !fc || !fc.labels || fc.labels.length === 0) return;
    const ctx = canvas.getContext('2d');

    const hLabels = fc.labels;
    const fLabels = (fc.fc_labels || []).map(l => l + ' (f)');
    const allLabels = [...hLabels, ...fLabels];
    const hLen = hLabels.length;
    const fLen = fLabels.length;

    const actualSales         = [...fc.hist_sales,    ...Array(fLen).fill(null)];
    const forecastSalesArr    = [...Array(hLen - 1).fill(null), fc.hist_sales[hLen - 1],    ...fc.fc_sales];
    const actualExpenses      = [...fc.hist_expenses, ...Array(fLen).fill(null)];
    const forecastExpensesArr = [...Array(hLen - 1).fill(null), fc.hist_expenses[hLen - 1], ...fc.fc_expenses];

    const existingChart = Chart.getChart(canvas);
    if (existingChart) {
        existingChart.destroy();
    }

    forecastPreviewChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: allLabels,
            datasets: [
                {
                    label: 'Sales (actual)',
                    data: actualSales,
                    borderColor: '#22c55e',
                    backgroundColor: 'rgba(34,197,94,0.08)',
                    borderWidth: 2.5, pointRadius: 3.5,
                    pointBackgroundColor: '#22c55e',
                    fill: false, tension: 0.35, spanGaps: false,
                },
                {
                    label: 'Sales (forecast)',
                    data: forecastSalesArr,
                    borderColor: '#22c55e',
                    backgroundColor: 'rgba(34,197,94,0.04)',
                    borderWidth: 2.5, borderDash: [6, 4],
                    pointRadius: 3.5, pointBackgroundColor: '#86efac',
                    fill: false, tension: 0.35, spanGaps: false,
                },
                {
                    label: 'Expenses (actual)',
                    data: actualExpenses,
                    borderColor: '#f97316',
                    backgroundColor: 'rgba(249,115,22,0.08)',
                    borderWidth: 2.5, pointRadius: 3.5,
                    pointBackgroundColor: '#f97316',
                    fill: false, tension: 0.35, spanGaps: false,
                },
                {
                    label: 'Expenses (forecast)',
                    data: forecastExpensesArr,
                    borderColor: '#f97316',
                    backgroundColor: 'rgba(249,115,22,0.04)',
                    borderWidth: 2.5, borderDash: [6, 4],
                    pointRadius: 3.5, pointBackgroundColor: '#fdba74',
                    fill: false, tension: 0.35, spanGaps: false,
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: c => c.raw === null ? null : ` ${c.dataset.label}: ${formatCurrency(c.raw)}`
                    }
                }
            },
            scales: {
                x: {
                    grid: { color: 'rgba(0,0,0,0.04)' },
                    ticks: { color: '#6b7280', font: { size: 11 }, maxRotation: 45, autoSkip: true, maxTicksLimit: 12 },
                },
                y: {
                    grid: { color: 'rgba(0,0,0,0.04)' },
                    ticks: { color: '#6b7280', font: { size: 11 }, callback: formatAxisCurrency },
                },
            },
        },
        plugins: [{
            id: 'forecastShadingDashboard',
            afterDraw(chart) {
                const { ctx: c, chartArea, scales } = chart;
                if (!chartArea) return;
                const x0 = scales.x.getPixelForValue(hLen - 1);
                const x1 = chartArea.right;
                c.save();
                c.fillStyle = 'rgba(99,102,241,0.04)';
                c.fillRect(x0, chartArea.top, x1 - x0, chartArea.bottom - chartArea.top);
                c.strokeStyle = 'rgba(99,102,241,0.3)';
                c.setLineDash([4, 4]);
                c.lineWidth = 1.5;
                c.beginPath();
                c.moveTo(x0, chartArea.top);
                c.lineTo(x0, chartArea.bottom);
                c.stroke();
                c.setLineDash([]);
                c.fillStyle = 'rgba(99,102,241,0.7)';
                c.font = '11px sans-serif';
                c.fillText('Forecast →', x0 + 6, chartArea.top + 16);
                c.restore();
            },
        }],
    });
}

function renderTrendChart(data) {

    const canvas = document.getElementById('trendChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const existingChart = Chart.getChart(canvas);
    if (existingChart) {
        existingChart.destroy();
    }

    trendChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: data.labels,
            datasets: [
                {
                    label: 'Sales',
                    data: data.sales,
                    borderColor: CHART_COLORS.sales.line,
                    backgroundColor: CHART_COLORS.sales.fill,
                    borderWidth: 2.5,
                    pointBackgroundColor: '#fff',
                    pointBorderColor: CHART_COLORS.sales.line,
                    pointBorderWidth: 2,
                    pointRadius: 4,
                    tension: 0.4,
                    fill: true
                },
                {
                    label: 'Expenses',
                    data: data.expenses,
                    borderColor: CHART_COLORS.expenses.line,
                    backgroundColor: CHART_COLORS.expenses.fill,
                    borderWidth: 2.5,
                    pointBackgroundColor: '#fff',
                    pointBorderColor: CHART_COLORS.expenses.line,
                    pointBorderWidth: 2,
                    pointRadius: 4,
                    tension: 0.4,
                    fill: true
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: ctx => ` ${ctx.dataset.label}: ${formatCurrency(ctx.parsed.y)}`
                    }
                }
            },
            scales: {
                y: {
                    grid: { color: 'rgba(0,0,0,0.05)' },
                    ticks: { color: '#6b7280', callback: formatAxisCurrency }
                },
                x: {
                    grid: { display: false },
                    ticks: { color: '#6b7280' }
                }
            }
        }
    });
}

function renderHealthScore(score, classification, factors, margin, factorLabels) {
    const scoreEl = document.getElementById('healthScoreValue');
    const isNoData = (classification === "No Data");

    // Status theme
    let statusColor = '#ef4444';
    let badgeClass  = 'bg-danger bg-opacity-25 text-danger border border-danger border-opacity-50';
    let iconClass   = 'fa-solid fa-circle-exclamation';
    let alertClass  = 'alert-danger bg-danger bg-opacity-10 text-danger border-0';
    let alertIcon   = 'fa-solid fa-triangle-exclamation text-danger';

    if (isNoData) {
        statusColor = '#94a3b8'; // slate / gray
        badgeClass  = 'bg-secondary bg-opacity-25 text-secondary border border-secondary border-opacity-50';
        iconClass   = 'fa-solid fa-chart-line-slash';
        alertClass  = 'alert-info bg-info bg-opacity-10 text-info-emphasis border-0';
        alertIcon   = 'fa-solid fa-circle-info text-info';
    } else if (score >= 70) {
        statusColor = '#22c55e';
        badgeClass  = 'bg-success bg-opacity-25 text-success border border-success border-opacity-50';
        iconClass   = 'fa-solid fa-circle-check';
        alertClass  = 'alert-success bg-success bg-opacity-10 text-success border-0';
        alertIcon   = 'fa-solid fa-circle-check text-success';
    } else if (score >= 40) {
        statusColor = '#f59e0b';
        badgeClass  = 'bg-warning bg-opacity-25 text-warning border border-warning border-opacity-50';
        iconClass   = 'fa-solid fa-circle-info';
        alertClass  = 'alert-warning bg-warning bg-opacity-10 text-warning-emphasis border-0';
        alertIcon   = 'fa-solid fa-circle-info text-warning';
    }

    if (scoreEl) {
        scoreEl.innerText = isNoData ? '--' : score;
        scoreEl.style.color = statusColor;
    }

    // Doughnut chart
    const canvas = document.getElementById('healthChart');
    if (canvas) {
        const ctx = canvas.getContext('2d');
        const existingChart = Chart.getChart(canvas);
        if (existingChart) {
            existingChart.destroy();
        }
        healthChartInstance = new Chart(ctx, {
            type: 'doughnut',
            data: {
                datasets: [{
                    data: isNoData ? [0, 100] : [score, 100 - score],
                    backgroundColor: [statusColor, '#e5e7eb'],
                    borderWidth: 0,
                    cutout: '80%'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { tooltip: { enabled: false } }
            }
        });
    }

    // Indicator rows — prefer human-readable labels, fall back gracefully
    const labels = factorLabels || {};
    const revLabel = isNoData ? 'No Data' : (labels.revenue_trend
        || (factors?.revenue_trend >= 60 ? 'Positive ↑' : factors?.revenue_trend >= 40 ? 'Stable →' : 'Declining ↓'));
    const expLabel = isNoData ? 'No Data' : (labels.expense_ratio
        || (factors?.expense_ratio !== undefined ? `${(100 - factors.expense_ratio).toFixed(0)}% ratio` : '—'));

    const indicators = document.getElementById('healthIndicators');
    if (indicators) {
        indicators.innerHTML = `
            <div class="d-flex justify-content-end mb-2">
                <span class="badge rounded-pill ${badgeClass} px-3 py-1">
                    <i class="${iconClass} me-1"></i> ${classification}
                </span>
            </div>
            <div class="d-flex justify-content-between border-bottom border-secondary border-opacity-25 py-2">
                <span class="text-secondary small">Revenue trend</span>
                <span class="fw-semibold small">${revLabel}</span>
            </div>
            <div class="d-flex justify-content-between border-bottom border-secondary border-opacity-25 py-2">
                <span class="text-secondary small">Expense ratio</span>
                <span class="fw-semibold small">${expLabel}</span>
            </div>
            <div class="d-flex justify-content-between py-2">
                <span class="text-secondary small">Profit margin</span>
                <span class="fw-semibold small">${isNoData ? '—' : margin + '%'}</span>
            </div>
        `;
    }

    // Alert banner
    const alertBanner = document.getElementById('healthAlertBanner');
    if (alertBanner) {
        let msg = '';
        if (isNoData) {
            msg = `Welcome to BizTrack! Record or upload transaction data under the <strong>Sales</strong> and <strong>Expenses</strong> tabs to compute your business health score.`;
        } else if (score >= 70) {
            msg = `Your business is in excellent health! Score is <strong>${score} — Healthy</strong>. Revenue, expense ratio, and profit margins are performing optimally.`;
        } else if (score >= 40) {
            msg = `Your business health is <strong>${score} — Stable</strong>. Solid operations, with minor opportunities to optimize expense ratios.`;
        } else {
            msg = `Health score is <strong>${score} — At Risk</strong>. High expense ratio, declining revenue, or low margin detected.`;
        }
        alertBanner.className = `alert d-flex align-items-center gap-3 mb-4 rounded-3 shadow-sm ${alertClass}`;
        alertBanner.innerHTML = `
            <i class="${alertIcon} fs-5 flex-shrink-0"></i>
            <div>
                ${msg}
                <a href="/health/" class="ms-1 fw-semibold text-decoration-none" style="color:inherit;">
                    View details <i class="fa-solid fa-arrow-right"></i>
                </a>
            </div>
        `;
        alertBanner.classList.remove('d-none');
    }
}

function renderExpenseChart(data, startVal, endVal) {
    const canvas = document.getElementById('expenseChart');
    const subtitle = document.getElementById('expenseBreakdownSubtitle');
    if (!canvas) return;

    // Update the subtitle to show the actual date range
    if (subtitle) {
        if (startVal && endVal) {
            const s = new Date(startVal).toLocaleDateString('en-PH', { month: 'short', year: 'numeric' });
            const e = new Date(endVal).toLocaleDateString('en-PH', { month: 'short', year: 'numeric' });
            subtitle.innerText = `${s} – ${e}`;
        } else {
            subtitle.innerText = 'All time';
        }
    }

    const existingChart = Chart.getChart(canvas);
    if (existingChart) {
        existingChart.destroy();
    }

    const keys   = Object.keys(data);
    const values = Object.values(data);

    // No data state
    if (keys.length === 0 || values.every(v => v === 0)) {
        const ctx = canvas.getContext('2d');
        expenseChartInstance = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['No expenses'],
                datasets: [{ data: [1], backgroundColor: ['#e5e7eb'], borderWidth: 0, cutout: '70%' }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false }, tooltip: { enabled: false } }
            }
        });

        // Render an empty legend
        const legend = document.getElementById('expenseLegend');
        if (legend) legend.innerHTML = '<span class="text-secondary small">No expense data in this period.</span>';
        return;
    }

    const colors = keys.map((_, i) => CHART_COLORS.expense_categories[i % CHART_COLORS.expense_categories.length]);
    const ctx = canvas.getContext('2d');
    const total = values.reduce((a, b) => a + b, 0);

    expenseChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: keys.map(k => k.charAt(0).toUpperCase() + k.slice(1)),
            datasets: [{
                data: values,
                backgroundColor: colors,
                borderWidth: 2,
                borderColor: '#ffffff',
                cutout: '70%'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: ctx => ` ${ctx.label}: ${formatCurrency(ctx.parsed)} (${((ctx.parsed/total)*100).toFixed(1)}%)`
                    }
                }
            }
        }
    });

    // Render colour legend below the chart
    const legend = document.getElementById('expenseLegend');
    if (legend) {
        legend.innerHTML = keys.map((k, i) => `
            <div class="d-flex align-items-center gap-2 mb-1">
                <div style="width:10px;height:10px;border-radius:50%;background:${colors[i]};flex-shrink:0;"></div>
                <span class="small text-secondary flex-grow-1">${k.charAt(0).toUpperCase() + k.slice(1)}</span>
                <span class="small fw-semibold">${((values[i]/total)*100).toFixed(0)}%</span>
            </div>
        `).join('');
    }
}

function renderInsights(insights) {
    const container = document.getElementById('aiInsightsContainer');
    if (!container) return;

    if (!insights || insights.length === 0) {
        container.innerHTML = `<p class="text-secondary small">No AI insights yet. Add more sales and expense records to unlock deeper analysis.</p>`;
        return;
    }

    container.innerHTML = insights.map(ins => `
        <div class="mb-3 rounded-3 overflow-hidden" style="
            border: 1px solid var(--border-color);
            border-left: 4px solid ${ins.color};
            background: rgba(255, 255, 255, 0.4);
            backdrop-filter: blur(8px);
        ">
            <div class="p-3">
                <div class="d-flex align-items-center justify-content-between mb-2 gap-2 flex-wrap">
                    <div class="d-flex align-items-center gap-2">
                        <div style="
                            width:32px; height:32px; border-radius:10px;
                            background:${ins.color}18;
                            display:flex; align-items:center; justify-content:center; flex-shrink:0;
                        ">
                            <i class="${ins.icon}" style="color:${ins.color}; font-size:.9rem;"></i>
                        </div>
                        <strong style="font-size:.88rem; color:var(--text-primary); font-weight: 700;">${ins.title}</strong>
                    </div>
                    <span style="
                        font-size:.68rem; font-weight:700; letter-spacing:.4px;
                        background:${ins.color}18; color:${ins.color};
                        border:1px solid ${ins.color}25; border-radius:999px;
                        padding:3px 10px; white-space:nowrap;
                    ">
                        <i class="fa-solid fa-wand-magic-sparkles me-1" style="font-size:.65rem;"></i>AI FORECAST
                    </span>
                </div>
                <p style="font-size:0.85rem; line-height:1.6; color:var(--text-secondary); margin:0 0 12px 0;">${ins.text}</p>
                <div class="d-flex align-items-center gap-2">
                    <div class="progress flex-grow-1" style="height:4px; border-radius:99px; background:rgba(0,0,0,0.05);">
                        <div class="progress-bar" role="progressbar"
                             style="width:${ins.confidence}%; background-color:${ins.color}; border-radius:99px;"
                             aria-valuenow="${ins.confidence}" aria-valuemin="0" aria-valuemax="100"></div>
                    </div>
                    <span style="font-size:0.75rem; color:var(--text-muted); white-space:nowrap; font-weight:600;">${ins.confidence}% confidence</span>
                </div>
            </div>
        </div>
    `).join('');
}
