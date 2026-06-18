let gaugeChartInstance = null;
let historyChartInstance = null;
let healthFactorsCached = null;
let healthHistoryCached = null;

document.addEventListener('DOMContentLoaded', () => {
    // Bind Tuning Elements
    const periodSelect = document.getElementById('evaluationPeriod');
    const sliderProfit = document.getElementById('weightProfitability');
    const sliderGrowth = document.getElementById('weightGrowth');
    const sliderStability = document.getElementById('weightStability');
    const btnExport = document.getElementById('btnExportHealth');
    const btnAck = document.getElementById('btnAcknowledgeAlert');

    if (periodSelect) periodSelect.addEventListener('change', fetchHealthData);
    
    [sliderProfit, sliderGrowth, sliderStability].forEach(slider => {
        if (slider) {
            slider.addEventListener('input', () => {
                updateSliderLabels();
                recalculateScore();
            });
        }
    });

    if (btnExport) btnExport.addEventListener('click', handleExportReport);
    if (btnAck) {
        btnAck.addEventListener('click', () => {
            document.getElementById('healthScoreAlert').classList.add('d-none');
        });
    }

    fetchHealthData();
});

async function fetchHealthData() {
    const periodVal = document.getElementById('evaluationPeriod')?.value || 'Monthly';
    try {
        const response = await authFetch(`/health/api/metrics?period=${periodVal}`);
        const data = await response.json();
        
        healthFactorsCached = data.factors;
        healthHistoryCached = data.history;

        recalculateScore();
        renderHistoryChart(data.history);
        renderMonthlyBreakdown(data.history);
    } catch (error) {
        console.error("Error fetching health data:", error);
    }
}

function updateSliderLabels() {
    const wProfit = document.getElementById('weightProfitability')?.value || 40;
    const wGrowth = document.getElementById('weightGrowth')?.value || 30;
    const wStability = document.getElementById('weightStability')?.value || 30;

    const labelProfit = document.getElementById('labelProfitability');
    const labelGrowth = document.getElementById('labelGrowth');
    const labelStability = document.getElementById('labelStability');

    if (labelProfit) labelProfit.innerText = `${wProfit}%`;
    if (labelGrowth) labelGrowth.innerText = `${wGrowth}%`;
    if (labelStability) labelStability.innerText = `${wStability}%`;
}

function recalculateScore() {
    if (!healthFactorsCached) return;

    const wProfit = parseFloat(document.getElementById('weightProfitability')?.value || 40);
    const wGrowth = parseFloat(document.getElementById('weightGrowth')?.value || 30);
    const wStability = parseFloat(document.getElementById('weightStability')?.value || 30);

    const totalWeight = wProfit + wGrowth + wStability;
    
    let score = 0;
    if (totalWeight > 0) {
        score = Math.round(
            (healthFactorsCached.profit_margin * wProfit +
             healthFactorsCached.revenue_trend * wGrowth +
             healthFactorsCached.expense_ratio * wStability) / totalWeight
        );
    } else {
        // Fallback standard weights
        score = Math.round(
            healthFactorsCached.profit_margin * 0.40 +
            healthFactorsCached.revenue_trend * 0.30 +
            healthFactorsCached.expense_ratio * 0.30
        );
    }

    renderCurrentScore(score);
    renderFactors(healthFactorsCached);
    renderRecommendations(score);
}

function renderCurrentScore(score) {
    document.getElementById('currentScoreValue').innerText = score;
    
    // Choose status colors and badges based on criteria:
    // Green - Healthy (70-100), Yellow - Stable (40-69), Red - At Risk (0-39)
    let statusColor = '#ef4444'; // Red At Risk
    let statusLabel = 'At Risk';
    let badgeClass = 'bg-danger bg-opacity-25 text-danger border border-danger border-opacity-50';
    let alertClass = 'alert-danger bg-danger bg-opacity-10 text-danger border-0';
    let alertIcon = 'fa-solid fa-triangle-exclamation text-danger';
    let trendColor = '#ef4444';

    if (score >= 70) {
        statusColor = '#00e676';
        statusLabel = 'Healthy';
        badgeClass = 'bg-success bg-opacity-25 text-success border border-success border-opacity-50';
        alertClass = 'alert-success bg-success bg-opacity-10 text-success border-0';
        alertIcon = 'fa-solid fa-circle-check text-success';
        trendColor = '#00e676';
    } else if (score >= 40) {
        statusColor = '#ffb300';
        statusLabel = 'Stable';
        badgeClass = 'bg-warning bg-opacity-25 text-warning border border-warning border-opacity-50';
        alertClass = 'alert-warning bg-warning bg-opacity-10 text-warning-emphasis border-0';
        alertIcon = 'fa-solid fa-circle-info text-warning';
        trendColor = '#ffb300';
    }

    // Set Dynamic Badge & Label
    const classificationBadge = document.getElementById('classificationBadge');
    if (classificationBadge) {
        classificationBadge.innerText = statusLabel;
        classificationBadge.className = `badge rounded-pill px-3 py-1 ${badgeClass}`;
    }

    const currentScoreValue = document.getElementById('currentScoreValue');
    if (currentScoreValue) {
        currentScoreValue.style.color = statusColor;
    }

    const trendText = document.getElementById('trendText');
    if (trendText) {
        trendText.innerText = score >= 50 ? 'Growing' : 'Declining';
        trendText.style.color = trendColor;
    }

    // Alert Banner
    const alertBanner = document.getElementById('healthScoreAlert');
    if (alertBanner) {
        alertBanner.className = `alert d-flex align-items-center justify-content-between gap-3 rounded-3 border-0 shadow-sm p-4 ${alertClass}`;
        
        let messageText = '';
        if (score >= 70) {
            messageText = `Score is Healthy. Your metrics are strong, with optimum margins and steady growth patterns.`;
        } else if (score >= 40) {
            messageText = `Score is Stable. Ratios are standard, but opportunities exist to decrease administrative spend.`;
        } else {
            messageText = `Score is At Risk. Key factors require immediate attention: high expense ratio or falling profits.`;
        }
        
        const textContainer = document.getElementById('healthScoreAlertText');
        if (textContainer) textContainer.innerText = messageText;
        
        const icon = document.getElementById('healthScoreAlertIcon');
        if (icon) icon.className = `fs-4 ${alertIcon}`;
        
        alertBanner.classList.remove('d-none');
    }

    // Gauge Chart
    const ctx = document.getElementById('healthScoreGauge').getContext('2d');
    if (gaugeChartInstance) {
        gaugeChartInstance.destroy();
    }
    
    gaugeChartInstance = new Chart(ctx, {
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
            rotation: -90,
            circumference: 180,
            plugins: { tooltip: { enabled: false } }
        }
    });
}

function renderFactors(factors) {
    const container = document.getElementById('healthFactors');
    if (!container) return;
    
    const factorList = [
        { label: "Profit margin (Profitability)", val: factors.profit_margin },
        { label: "Revenue MoM (Growth)", val: factors.revenue_trend },
        { label: "Expense Ratio (Stability)", val: factors.expense_ratio }
    ];

    container.innerHTML = factorList.map(f => {
        const color = f.val >= 70 ? '#00e676' : (f.val >= 40 ? '#ffb300' : '#ff3d00');
        return `
        <div class="d-flex justify-content-between border-bottom border-secondary border-opacity-25 py-3 align-items-center">
            <div class="d-flex flex-column" style="width: 180px;">
                <span class="text-secondary mb-1">${f.label}</span>
                <div class="progress" style="height: 4px;">
                    <div class="progress-bar" role="progressbar" style="width: ${f.val}%; background-color: ${color};" aria-valuenow="${f.val}" aria-valuemin="0" aria-valuemax="100"></div>
                </div>
            </div>
            <span class="fw-semibold">${f.val}/100</span>
        </div>
    `}).join('');
}

function renderRecommendations(score) {
    const container = document.getElementById('healthRecommendations');
    if (!container) return;

    let recs = [];
    if (score >= 70) {
        recs = [
            { icon: "fa-solid fa-rocket text-success", title: "Capital Expansion", desc: "Your margins are optimal. Consider expanding into new product lines or scaling services." },
            { icon: "fa-solid fa-vault text-success", title: "Reserve Allocation", desc: "Reinvest excess cash reserves into high-yield business savings to lock in stability." }
        ];
    } else if (score >= 40) {
        recs = [
            { icon: "fa-solid fa-arrows-spin text-warning", title: "Overhead Optimization", desc: "Your expense ratio is moderate. Review utilities and supplier contracts to unlock higher margins." },
            { icon: "fa-solid fa-bullhorn text-warning", title: "Sales Conversion", desc: "Enhance digital advertising spend slightly to elevate growth and MoM trends." }
        ];
    } else {
        recs = [
            { icon: "fa-solid fa-triangle-exclamation text-danger", title: "Emergency Liquidity", desc: "Your margins are under strain. Pause non-essential supplies restock immediately." },
            { icon: "fa-solid fa-fire-extinguisher text-danger", title: "Direct-to-Consumer Push", desc: "Offer promotional deals on products to inject immediate cash flow and reverse revenue decline." }
        ];
    }

    container.innerHTML = recs.map(r => `
        <div class="p-3 rounded-3 insight-panel d-flex gap-3 align-items-start" style="border: 1px solid var(--border-color); background-color: #ffffff;">
            <i class="${r.icon} fs-4 mt-1"></i>
            <div>
                <strong class="text-secondary">${r.title}</strong>
                <p class="text-secondary small mb-0 mt-1">${r.desc}</p>
            </div>
        </div>
    `).join('');
}

function renderHistoryChart(history) {
    const ctx = document.getElementById('scoreHistoryChart').getContext('2d');
    
    if (historyChartInstance) {
        historyChartInstance.destroy();
    }

    historyChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: history.labels,
            datasets: [{
                label: 'Score',
                data: history.scores,
                borderColor: '#ff6d00',
                backgroundColor: 'rgba(255, 109, 0, 0.1)',
                borderWidth: 2,
                pointBackgroundColor: '#ff6d00',
                pointRadius: 4,
                tension: 0.1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { min: 0, max: 100, grid: { color: '#e5e7eb' }, ticks: { color: '#6b7280' } },
                x: { grid: { display: false }, ticks: { color: '#6b7280', maxRotation: 45, minRotation: 45 } }
            }
        }
    });
}

function renderMonthlyBreakdown(history) {
    const container = document.getElementById('monthlyBreakdownList');
    if (!container) return;
    
    // Reverse arrays to show newest first
    const labels = [...history.labels].reverse();
    const scores = [...history.scores].reverse();
    const statuses = [...history.statuses].reverse();

    container.innerHTML = labels.map((label, idx) => {
        const score = scores[idx];
        let status = statuses[idx];
        
        // Match dynamic status boundaries
        if (score >= 70) status = "Healthy";
        else if (score >= 40) status = "Stable";
        else status = "At Risk";

        const color = score >= 70 ? '#00e676' : (score >= 40 ? '#ffb300' : '#ff3d00');
        const textClass = score >= 70 ? 'text-success' : (score >= 40 ? 'text-warning' : 'text-danger');
        
        return `
        <div class="d-flex align-items-center gap-4 py-2 border-bottom border-secondary border-opacity-10">
            <div class="${textClass} fs-4 fw-bold" style="width: 40px;">${score}</div>
            <div class="flex-grow-1">
                <div class="fw-bold">${label}</div>
                <div class="small text-muted">${status}</div>
            </div>
            <div style="width: 100px;">
                <div class="progress" style="height: 6px;">
                    <div class="progress-bar" role="progressbar" style="width: ${score}%; background-color: ${color};" aria-valuenow="${score}" aria-valuemin="0" aria-valuemax="100"></div>
                </div>
            </div>
        </div>
        `;
    }).join('');
}

function handleExportReport() {
    if (!healthFactorsCached) return;

    const wProfit = document.getElementById('weightProfitability')?.value || 40;
    const wGrowth = document.getElementById('weightGrowth')?.value || 30;
    const wStability = document.getElementById('weightStability')?.value || 30;
    const periodVal = document.getElementById('evaluationPeriod')?.value || 'Monthly';

    const currentScore = document.getElementById('currentScoreValue').innerText;
    const classification = document.getElementById('classificationBadge').innerText;

    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "BizTrack Business Health Score Report\r\n";
    csvContent += `Evaluation Period: ${periodVal}\r\n`;
    csvContent += `Generated Date: ${new Date().toLocaleDateString()}\r\n\r\n`;
    
    csvContent += "Tuning Weights Used\r\n";
    csvContent += `Profitability Weight,${wProfit}%\r\n`;
    csvContent += `Growth Weight,${wGrowth}%\r\n`;
    csvContent += `Stability Weight,${wStability}%\r\n\r\n`;

    csvContent += "Health Indicators Summary\r\n";
    csvContent += `Overall Health Score,${currentScore}/100\r\n`;
    csvContent += `Health Classification,${classification}\r\n\r\n`;

    csvContent += "Sub-Factor Ratings\r\n";
    csvContent += `Profitability Margin,${healthFactorsCached.profit_margin}/100\r\n`;
    csvContent += `Revenue Trend Growth,${healthFactorsCached.revenue_trend}/100\r\n`;
    csvContent += `Expense Ratio Stability,${healthFactorsCached.expense_ratio}/100\r\n`;

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `BizTrack_HealthScore_Report_${periodVal}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}
