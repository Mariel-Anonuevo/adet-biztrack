let trendChartInstance = null;
let healthChartInstance = null;
let expenseChartInstance = null;

document.addEventListener('DOMContentLoaded', () => {
    // Bind filter changes
    const startInput = document.getElementById('startDate');
    const endInput = document.getElementById('endDate');
    const analysisSelect = document.getElementById('analysisType');
    const exportBtn = document.getElementById('btnExportDashboard');

    if (startInput) startInput.addEventListener('change', refreshDashboard);
    if (endInput) endInput.addEventListener('change', refreshDashboard);
    if (analysisSelect) analysisSelect.addEventListener('change', refreshDashboard);
    
    if (exportBtn) {
        exportBtn.addEventListener('click', handleExport);
    }

    // Set default date range to last 6 months
    if (startInput && endInput) {
        const end = new Date();
        const start = new Date();
        start.setMonth(start.getMonth() - 6);
        
        startInput.value = start.toISOString().split('T')[0];
        endInput.value = end.toISOString().split('T')[0];
    }

    fetchDashboardData();
});

function refreshDashboard() {
    fetchDashboardData();
}

async function fetchDashboardData() {
    const startVal = document.getElementById('startDate')?.value || '';
    const endVal = document.getElementById('endDate')?.value || '';
    const typeVal = document.getElementById('analysisType')?.value || 'Growth';

    try {
        const url = `/dashboard/api/metrics?start_date=${startVal}&end_date=${endVal}&analysis_type=${typeVal}`;
        const response = await authFetch(url);
        const data = await response.json();
        
        renderSummaryCards(data.summary);
        renderTrendChart(data.monthly_trend);
        renderHealthScore(data.health_score, data.health_classification, data.health_factors, data.summary.profit_margin);
        renderExpenseChart(data.expense_breakdown);
        renderInsights(data.insights);
    } catch (error) {
        console.error("Error fetching dashboard data:", error);
    }
}

function handleExport() {
    const confirmExport = confirm("Are you sure you want to export?");
    if (!confirmExport) return;

    const startVal = document.getElementById('startDate')?.value || '';
    const endVal = document.getElementById('endDate')?.value || '';
    const typeVal = document.getElementById('analysisType')?.value || 'Growth';

    // Construct a beautiful CSV representing current filtered analytics summary and monthly trend
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "BizTrack Performance Analytics Export\r\n";
    csvContent += `Period: ${startVal || 'All Time'} to ${endVal || 'All Time'}\r\n`;
    csvContent += `Analysis Type: ${typeVal}\r\n\r\n`;
    csvContent += "Summary Metric,Value\r\n";
    
    const summaryCards = document.getElementById('summaryCards');
    if (summaryCards) {
        const cards = summaryCards.querySelectorAll('.card');
        cards.forEach(card => {
            const title = card.querySelector('.text-secondary')?.innerText || '';
            const val = card.querySelector('h3')?.innerText || '';
            csvContent += `"${title}","${val.replace('₱', 'PHP ')}"\r\n`;
        });
    }
    
    // Use standard window prompt or direct link to download
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `BizTrack_Analytics_${typeVal}_${startVal}_to_${endVal}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function formatCurrency(amount) {
    return new Intl.NumberFormat('en-PH', { 
        style: 'currency', 
        currency: 'PHP',
        minimumFractionDigits: 0
    }).format(amount);
}

function renderSummaryCards(summary) {
    const container = document.getElementById('summaryCards');
    
    const salesIsPos = summary.sales_trend.startsWith('+');
    const expensesIsPos = summary.expenses_trend.startsWith('+');
    const profitIsPos = summary.profit_trend.startsWith('+');
    const marginIsPos = summary.margin_trend.startsWith('+');

    const cards = [
        { title: "Total sales", amount: formatCurrency(summary.total_sales), trend: summary.sales_trend, color: salesIsPos ? "success" : "danger", isUp: salesIsPos },
        { title: "Total expenses", amount: formatCurrency(summary.total_expenses), trend: summary.expenses_trend, color: expensesIsPos ? "danger" : "success", isUp: expensesIsPos },
        { title: "Net profit", amount: formatCurrency(summary.net_profit), trend: summary.profit_trend, color: profitIsPos ? "success" : "danger", isUp: profitIsPos },
        { title: "Profit margin", amount: summary.profit_margin + "%", trend: summary.margin_trend, color: marginIsPos ? "success" : "danger", isUp: marginIsPos }
    ];

    container.innerHTML = cards.map(c => `
        <div class="col-md-3">
            <div class="card bg-dark-card border-secondary border-opacity-25 h-100 rounded-4 p-4 text-center text-md-start">
                <div class="text-secondary fw-semibold mb-2">${c.title}</div>
                <h3 class="fw-bold mb-3">${c.amount}</h3>
                <div class="small text-${c.color}"><i class="fa-solid fa-arrow-${c.isUp ? 'trend-up' : 'trend-down'} me-1"></i> ${c.trend} vs last mo. (YoY ↑/↓)</div>
            </div>
        </div>
    `).join('');
}

function renderTrendChart(data) {
    const ctx = document.getElementById('trendChart').getContext('2d');
    
    if (trendChartInstance) {
        trendChartInstance.destroy();
    }

    trendChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: data.labels,
            datasets: [
                {
                    label: 'Sales',
                    data: data.sales,
                    borderColor: '#00e676',
                    backgroundColor: '#00e676',
                    borderWidth: 2,
                    pointBackgroundColor: '#00e676',
                    tension: 0.4
                },
                {
                    label: 'Expenses',
                    data: data.expenses,
                    borderColor: '#ff6d00',
                    backgroundColor: '#ff6d00',
                    borderWidth: 2,
                    pointBackgroundColor: '#ff6d00',
                    tension: 0.4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { grid: { color: '#e5e7eb' }, ticks: { color: '#6b7280', callback: value => '₱' + (value/1000) + 'k' } },
                x: { grid: { display: false }, ticks: { color: '#6b7280' } }
            }
        }
    });
}

function renderHealthScore(score, classification, factors, margin) {
    document.getElementById('healthScoreValue').innerText = score;
    
    // Choose status colors
    let statusColor = '#ff6d00'; // Default At Risk
    let badgeClass = 'bg-danger bg-opacity-25 text-danger border border-danger border-opacity-50';
    let iconClass = 'fa-solid fa-circle-exclamation';
    let alertClass = 'alert-danger bg-danger bg-opacity-10 text-danger border-0';
    let alertIcon = 'fa-solid fa-triangle-exclamation text-danger';

    if (score >= 70) {
        statusColor = '#00e676';
        badgeClass = 'bg-success bg-opacity-25 text-success border border-success border-opacity-50';
        iconClass = 'fa-solid fa-circle-check';
        alertClass = 'alert-success bg-success bg-opacity-10 text-success border-0';
        alertIcon = 'fa-solid fa-circle-check text-success';
    } else if (score >= 40) {
        statusColor = '#ffb300';
        badgeClass = 'bg-warning bg-opacity-25 text-warning border border-warning border-opacity-50';
        iconClass = 'fa-solid fa-circle-info';
        alertClass = 'alert-warning bg-warning bg-opacity-10 text-warning-emphasis border-0';
        alertIcon = 'fa-solid fa-circle-info text-warning';
    }

    // Set dynamic health score text color
    document.getElementById('healthScoreValue').style.color = statusColor;

    // Circle Chart
    const ctx = document.getElementById('healthChart').getContext('2d');
    
    if (healthChartInstance) {
        healthChartInstance.destroy();
    }

    healthChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            datasets: [{
                data: [score, 100 - score],
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

    // Render Indicators
    const indicators = document.getElementById('healthIndicators');
    indicators.innerHTML = `
        <div class="d-flex justify-content-end mb-2">
            <span class="badge rounded-pill ${badgeClass} px-3 py-1"><i class="${iconClass} me-1"></i> ${classification}</span>
        </div>
        <div class="d-flex justify-content-between border-bottom border-secondary border-opacity-25 py-2">
            <span class="text-secondary">Revenue trend</span>
            <span class="fw-semibold">${factors ? factors.revenue_trend : '--'}</span>
        </div>
        <div class="d-flex justify-content-between border-bottom border-secondary border-opacity-25 py-2">
            <span class="text-secondary">Expense ratio</span>
            <span class="fw-semibold">${factors ? factors.expense_ratio : '--'}</span>
        </div>
        <div class="d-flex justify-content-between py-2">
            <span class="text-secondary">Profit margin</span>
            <span class="fw-semibold">${margin}%</span>
        </div>
    `;

    // Render Dynamic Alert Banner
    const alertBanner = document.getElementById('healthAlertBanner');
    if (alertBanner) {
        alertBanner.className = `alert d-flex align-items-center gap-3 mb-4 rounded-3 border-0 shadow-sm ${alertClass}`;
        
        let alertMessage = '';
        if (score >= 70) {
            alertMessage = `Your business is in excellent health! Health score is <strong>${score} — Healthy</strong>. Revenue trends, expense ratio, and profit margins are performing optimally.`;
        } else if (score >= 40) {
            alertMessage = `Your business health is <strong>${score} — Stable</strong>. Solid operations, with some minor opportunities to optimize expense ratios.`;
        } else {
            alertMessage = `Health score dropped to <strong>${score} — At Risk</strong>. AI detected high expense ratio, declining revenue, or low margin.`;
        }

        alertBanner.innerHTML = `
            <i class="${alertIcon} fs-5"></i>
            <div>
                ${alertMessage}
                <a href="/health/" class="ms-1 fw-semibold text-decoration-none" style="color: inherit;">View details <i class="fa-solid fa-arrow-right"></i></a>
            </div>
        `;
        alertBanner.classList.remove('d-none');
    }
}

function renderExpenseChart(data) {
    const ctx = document.getElementById('expenseChart').getContext('2d');
    
    if (expenseChartInstance) {
        expenseChartInstance.destroy();
    }

    expenseChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: Object.keys(data).map(k => k.charAt(0).toUpperCase() + k.slice(1)),
            datasets: [{
                data: Object.values(data),
                backgroundColor: ['#ff9800', '#29b6f6', '#8bc34a', '#e91e63'],
                borderWidth: 0,
                cutout: '70%'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            }
        }
    });
}

function renderInsights(insights) {
    const container = document.getElementById('aiInsightsContainer');
    if (!container) return;
    
    if (!insights || insights.length === 0) {
        container.innerHTML = `<p class="text-secondary small">No AI insights generated yet. Check back once you have entered more data.</p>`;
        return;
    }
    
    container.innerHTML = insights.map(ins => `
        <div class="p-3 rounded-3 mb-3 insight-panel" style="border: 1px solid var(--border-color); background-color: #ffffff;">
            <div class="d-flex align-items-center gap-2 mb-2">
                <i class="${ins.icon}" style="color:${ins.color};"></i>
                <strong>${ins.title}</strong>
            </div>
            <p class="text-secondary small mb-3">${ins.text}</p>
            <div class="d-flex align-items-center gap-2">
                <div class="progress flex-grow-1" style="height: 4px;">
                    <div class="progress-bar" role="progressbar" style="width: ${ins.confidence}%; background-color: var(--accent-ai);" aria-valuenow="${ins.confidence}" aria-valuemin="0" aria-valuemax="100"></div>
                </div>
                <span class="small text-secondary" style="font-size: 0.75rem;">${ins.confidence}% AI confidence</span>
            </div>
        </div>
    `).join('');
}
