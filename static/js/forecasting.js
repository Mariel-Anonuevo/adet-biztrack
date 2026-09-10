/**
 * forecasting.js – BizTrack Unified Forecasting & Scenario Analysis Page
 * Integrates machine learning forecasting and interactive scenario simulation.
 */

let forecastChart = null;
let profitChart   = null;
let currentData   = null; // stores baseline data returned from server

// Default Baseline state
let salesChangePct = 0;
let expensesChangePct = 0;

document.addEventListener("DOMContentLoaded", () => {

    // ── DOM References ────────────────────────────────────────────────────────
    const btnRun    = document.getElementById("btnRunForecast");
    const btnExport = document.getElementById("btnExportForecast");
    const selPeriods = document.getElementById("fcPeriods");
    const selModel   = document.getElementById("fcModel");

    const elAvgSales       = document.getElementById("fcAvgSales");
    const elAvgExpenses    = document.getElementById("fcAvgExpenses");
    const elAvgProfit      = document.getElementById("fcAvgProfit");
    const elTrend          = document.getElementById("fcTrend");
    const elTrendIcon      = document.getElementById("fcTrendIcon");
    const elTrendIconWrap  = document.getElementById("fcTrendIconWrap");
    const elGrowthPct      = document.getElementById("fcGrowthPct");
    const elConfidenceVal  = document.getElementById("fcConfidenceVal");
    const elConfidenceBadge= document.getElementById("fcConfidenceBadge");
    const elTableBody      = document.getElementById("fcTableBody");
    const elTablePeriodLabel = document.getElementById("fcTablePeriodLabel");

    // Unified summary health cards
    const elAvgHealth      = document.getElementById("fcAvgHealth");
    const elHealthStatus   = document.getElementById("fcHealthStatus");

    // Scenario Sliders & Badges
    const slideSales       = document.getElementById("slideSalesChange");
    const slideExpenses    = document.getElementById("slideExpensesChange");
    const badgeSales       = document.getElementById("valSalesChange");
    const badgeExpenses    = document.getElementById("valExpensesChange");

    // Presets
    const btnPresetBaseline   = document.getElementById("presetBaseline");
    const btnPresetOptimistic = document.getElementById("presetOptimistic");
    const btnPresetPessimistic= document.getElementById("presetPessimistic");
    const btnPresetCustom     = document.getElementById("presetCustom");
    const btnResetScenario    = document.getElementById("btnResetScenario");

    // Comparison Table cells
    const cellBaseSales    = document.getElementById("cellBaseSales");
    const cellSimSales     = document.getElementById("cellSimSales");
    const cellVarSales     = document.getElementById("cellVarSales");

    const cellBaseExpenses = document.getElementById("cellBaseExpenses");
    const cellSimExpenses  = document.getElementById("cellSimExpenses");
    const cellVarExpenses  = document.getElementById("cellVarExpenses");

    const cellBaseProfit   = document.getElementById("cellBaseProfit");
    const cellSimProfit    = document.getElementById("cellSimProfit");
    const cellVarProfit    = document.getElementById("cellVarProfit");

    const cellBaseHealth   = document.getElementById("cellBaseHealth");
    const cellSimHealth    = document.getElementById("cellSimHealth");
    const cellVarHealth    = document.getElementById("cellVarHealth");

    const cellBaseStatus   = document.getElementById("cellBaseStatus");
    const cellSimStatus    = document.getElementById("cellSimStatus");

    // Dynamic Panels
    const elDynamicInsights = document.getElementById("dynamicInsights");
    const elSmartActionItems = document.getElementById("smartActionItems");
    const elHealthProjectionList = document.getElementById("healthProjectionList");
    const elHealthTrendText = document.getElementById("healthTrendText");
    const elHealthTrendIcon = document.getElementById("healthTrendIcon");
    const elBadgeScenarioStatus = document.getElementById("badgeScenarioStatus");

    // AI Strategic advice modal triggers
    const btnOpenStrategicReport = document.getElementById("btnOpenStrategicReport");

    if (!btnRun) {
        console.error("[Forecasting] btnRunForecast not found — check HTML IDs");
        return;
    }

    // ── Model descriptions ────────────────────────────────────────────────────
    const MODEL_DESCS = {
        linear:         "Expected trajectory based on your overall historical trend.",
        moving_average: "Expected trajectory based on your recent 3-month average.",
        exponential:    "Expected trajectory weighting your most recent months more heavily.",
    };

    function updateModelDesc() {
        const descEl = document.getElementById("fcModelDesc");
        if (descEl && selModel) descEl.textContent = MODEL_DESCS[selModel.value] || "";
    }

    // ── Utilities ─────────────────────────────────────────────────────────────
    function fmt(n) {
        return "₱" + Math.round(n).toLocaleString("en-PH");
    }

    function fmtPct(n) {
        return (n >= 0 ? "+" : "") + Number(n).toFixed(1) + "%";
    }

    function statusBadge(profit) {
        if (profit > 0) return `<span class="fc-trend-up">Profit</span>`;
        if (profit < 0) return `<span class="fc-trend-down">Loss</span>`;
        return `<span style="background:#f3f4f6;color:#6b7280;padding:2px 10px;border-radius:999px;font-size:.78rem;font-weight:600;">Break-even</span>`;
    }

    // ── Main fetch & render ───────────────────────────────────────────────────
    async function loadForecast() {
        const periods = parseInt(selPeriods?.value, 10) || 3;
        const model   = selModel?.value || "linear";

        updateModelDesc();

        btnRun.disabled = true;
        btnRun.innerHTML = '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Forecasting…';

        try {
            const res = await authFetch(`/forecasting/api/forecast?periods=${periods}&model=${model}`);
            if (!res.ok) {
                const errBody = await res.json().catch(() => ({}));
                throw new Error(errBody.detail || `Server error ${res.status}`);
            }
            const data = await res.json();
            if (data.error) { showError(data.error); return; }

            // Add "(f)" suffix to forecast labels so they are clearly marked
            data.forecast.labels = data.forecast.labels.map(l => l + ' (f)');

            currentData = data;

            // Reset presets to Baseline
            resetSliders();

            // Render components
            renderKPIs(data.kpis, data.health_projection);
            renderTable(data.forecast);
            
            // Recalculate Scenario updates initial visual tables/charts/recommendations
            recalculateScenario();

        } catch (err) {
            console.error("Forecast error:", err);
            showError(err.message);
        } finally {
            btnRun.disabled = false;
            btnRun.innerHTML = '<i class="fa-solid fa-bolt me-1"></i> Run forecast';
        }
    }

    function showError(msg) {
        if (elTableBody) {
            elTableBody.innerHTML = `
                <tr>
                    <td colspan="6" class="text-center text-danger py-4">
                        <i class="fa-solid fa-circle-exclamation me-2"></i>${msg}
                    </td>
                </tr>`;
        }
    }

    // ── KPI Cards ─────────────────────────────────────────────────────────────
    function renderKPIs(kpis, health) {
        if (elAvgSales)    { elAvgSales.textContent    = fmt(kpis.avg_forecast_sales); }
        if (elAvgExpenses) { elAvgExpenses.textContent = fmt(kpis.avg_forecast_expenses); }

        if (elAvgProfit) {
            elAvgProfit.textContent = fmt(kpis.avg_forecast_profit);
            elAvgProfit.style.color = kpis.avg_forecast_profit >= 0 ? "#6366f1" : "#ef4444";
        }

        if (elTrend) {
            elTrend.textContent = kpis.trend_direction;
            elTrend.style.color = kpis.trend_direction === "Upward" ? "#16a34a"
                                : kpis.trend_direction === "Downward" ? "#dc2626" : "#d97706";
        }
        if (elTrendIcon) elTrendIcon.className = `fa-solid ${kpis.trend_icon}`;
        if (elTrendIconWrap) elTrendIconWrap.style.background =
            `linear-gradient(135deg, ${kpis.trend_color}cc, ${kpis.trend_color})`;

        if (elGrowthPct) {
            elGrowthPct.textContent = fmtPct(kpis.sales_growth_pct) + " vs actual";
            elGrowthPct.style.color = kpis.sales_growth_pct >= 0 ? "#16a34a" : "#dc2626";
        }

        if (elConfidenceVal) {
            let reliabilityText = "Limited Data Available";
            if (kpis.confidence >= 75) {
                reliabilityText = "Good";
            } else if (kpis.confidence >= 50) {
                reliabilityText = "Fair";
            }
            elConfidenceVal.textContent = reliabilityText;
        }
        if (elConfidenceBadge) {
            elConfidenceBadge.title = kpis.model_label || "";
        }

        // Projected Health centerpiece card
        if (elAvgHealth) {
            elAvgHealth.textContent = health.average;
            elAvgHealth.style.color = health.average >= 70 ? "#10b981" : health.average >= 45 ? "#fbbf24" : "#ef4444";
        }
        if (elHealthStatus) {
            elHealthStatus.textContent = health.status;
            elHealthStatus.className = "fw-bold " + 
                (health.status === "Healthy" ? "text-success" : health.status === "Stable" ? "text-warning" : "text-danger");
        }
    }

    // ── Main Chart ──
    function renderMainChart(data, simSales = null, simExpenses = null) {
        const canvas = document.getElementById("forecastChart");
        if (!canvas) return;
        const ctx = canvas.getContext("2d");

        const hLabels   = data.historical.labels;
        const fLabels   = data.forecast.labels;
        const allLabels = [...hLabels, ...fLabels];
        const hLen = hLabels.length;
        const fLen = fLabels.length;

        // Actual vectors
        const actualSales    = [...data.historical.sales,    ...Array(fLen).fill(null)];
        const actualExpenses = [...data.historical.expenses, ...Array(fLen).fill(null)];

        // Base forecast vectors
        const baseSalesArr = [...Array(hLen - 1).fill(null), data.historical.sales[hLen - 1], ...data.forecast.sales];
        const baseExpensesArr = [...Array(hLen - 1).fill(null), data.historical.expenses[hLen - 1], ...data.forecast.expenses];

        // Simulated vectors
        const sSales = simSales || data.forecast.sales;
        const sExpenses = simExpenses || data.forecast.expenses;

        const simSalesArr = [...Array(hLen - 1).fill(null), data.historical.sales[hLen - 1], ...sSales];
        const simExpensesArr = [...Array(hLen - 1).fill(null), data.historical.expenses[hLen - 1], ...sExpenses];

        if (forecastChart) { forecastChart.destroy(); forecastChart = null; }

        forecastChart = new Chart(ctx, {
            type: "line",
            data: {
                labels: allLabels,
                datasets: [
                    {
                        label: "Sales (Past Months)",
                        data: actualSales,
                        borderColor: "#a7f3d0",
                        backgroundColor: "rgba(167,243,208,0.08)",
                        borderWidth: 2, pointRadius: 3,
                        fill: false, tension: 0.35, spanGaps: false,
                    },
                    {
                        label: "Expected Sales",
                        data: baseSalesArr,
                        borderColor: "#6bd291",
                        borderWidth: 1.5, borderDash: [6, 4],
                        pointRadius: 2, fill: false, tension: 0.35, spanGaps: false,
                    },
                    {
                        label: "Simulated Sales",
                        data: simSalesArr,
                        borderColor: "#10b981",
                        borderWidth: 3.5, pointRadius: 4,
                        pointBackgroundColor: "#10b981",
                        fill: false, tension: 0.35, spanGaps: false,
                    },
                    {
                        label: "Expenses (Past Months)",
                        data: actualExpenses,
                        borderColor: "#fca5a5",
                        backgroundColor: "rgba(252,165,165,0.08)",
                        borderWidth: 2, pointRadius: 3,
                        fill: false, tension: 0.35, spanGaps: false,
                    },
                    {
                        label: "Expected Expenses",
                        data: baseExpensesArr,
                        borderColor: "#f87171",
                        borderWidth: 1.5, borderDash: [6, 4],
                        pointRadius: 2, fill: false, tension: 0.35, spanGaps: false,
                    },
                    {
                        label: "Simulated Expenses",
                        data: simExpensesArr,
                        borderColor: "#ef4444",
                        borderWidth: 3.5, pointRadius: 4,
                        pointBackgroundColor: "#ef4444",
                        fill: false, tension: 0.35, spanGaps: false,
                    },
                ],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: "index", intersect: false },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: "#fff",
                        titleColor: "#6b7280",
                        bodyColor: "#111827",
                        borderColor: "#e5e7eb",
                        borderWidth: 1,
                        callbacks: {
                            label: (c) => c.raw === null ? null : ` ${c.dataset.label}: ${fmt(c.raw)}`
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { color: "rgba(0,0,0,0.05)" },
                        ticks: { color: "#6b7280", font: { size: 11 }, autoSkip: true, maxTicksLimit: 12 },
                    },
                    y: {
                        grid: { color: "rgba(0,0,0,0.05)" },
                        ticks: {
                            color: "#6b7280", font: { size: 11 },
                            callback: (v) => "₱" + Number(v).toLocaleString("en-PH"),
                        },
                    },
                },
            },
        });

        // Shaded forecast region
        const shadingPlugin = {
            id: "forecastShading_" + Date.now(),
            afterDraw(chart) {
                const { ctx: c, chartArea, scales } = chart;
                if (!chartArea) return;
                const x0 = scales.x.getPixelForValue(hLen - 1);
                const x1 = chartArea.right;
                c.save();
                c.fillStyle = "rgba(99,102,241,0.03)";
                c.fillRect(x0, chartArea.top, x1 - x0, chartArea.bottom - chartArea.top);
                c.strokeStyle = "rgba(99,102,241,0.25)";
                c.setLineDash([4, 4]);
                c.lineWidth = 1.5;
                c.beginPath();
                c.moveTo(x0, chartArea.top);
                c.lineTo(x0, chartArea.bottom);
                c.stroke();
                c.restore();
            },
        };
        Chart.register(shadingPlugin);
        forecastChart.update();
    }

    // ── Profit Bar Chart ──
    function renderProfitChart(labels, baseProfits, simProfits) {
        const canvas = document.getElementById("profitForecastChart");
        if (!canvas) return;
        const ctx = canvas.getContext("2d");

        if (profitChart) { profitChart.destroy(); profitChart = null; }

        profitChart = new Chart(ctx, {
            type: "bar",
            data: {
                labels: labels,
                datasets: [
                    {
                        label: "Expected Profit",
                        data: baseProfits,
                        backgroundColor: "rgba(165,180,252,0.4)",
                        borderColor: "#a5b4fc",
                        borderWidth: 1.5,
                        borderRadius: 4,
                    },
                    {
                        label: "Simulated Profit",
                        data: simProfits,
                        backgroundColor: simProfits.map(p => p >= 0 ? "rgba(16,185,129,0.75)" : "rgba(239,68,68,0.75)"),
                        borderColor: simProfits.map(p => p >= 0 ? "#10b981" : "#ef4444"),
                        borderWidth: 2,
                        borderRadius: 4,
                    }
                ],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: "#color",
                        titleColor: "#6b7280",
                        bodyColor: "#111827",
                        borderColor: "#e5e7eb",
                        borderWidth: 1,
                        callbacks: { label: (c) => ` ${c.dataset.label}: ${fmt(c.raw)}` }
                    }
                },
                scales: {
                    x: { grid: { display: false }, ticks: { color: "#6b7280", font: { size: 10 }, autoSkip: true, maxTicksLimit: 12 } },
                    y: {
                        grid: { color: "rgba(0,0,0,0.05)" },
                        ticks: {
                            color: "#6b7280", font: { size: 10 },
                            callback: (v) => "₱" + Number(v).toLocaleString("en-PH"),
                        },
                    },
                },
            },
        });
    }

    // ── Forecast Table ──
    function renderTable(forecast) {
        if (!elTableBody) return;
        const n = forecast.labels.length;
        if (elTablePeriodLabel) elTablePeriodLabel.textContent = `${n}-month projection`;

        elTableBody.innerHTML = forecast.labels.map((lbl, i) => {
            const s = forecast.sales[i];
            const e = forecast.expenses[i];
            const p = forecast.profit[i];
            return `
                <tr>
                    <td class="fw-semibold" style="color:#111827;">${lbl}</td>
                    <td style="color:#16a34a;font-weight:600;">${fmt(s)}</td>
                    <td style="color:#dc2626;font-weight:600;">${fmt(e)}</td>
                    <td style="color:${p >= 0 ? '#16a34a' : '#dc2626'};font-weight:600;">${fmt(p)}</td>
                    <td>${statusBadge(p)}</td>
                </tr>`;
        }).join("");
    }

    // ── Export CSV ────────────────────────────────────────────────────────────
    function exportCSV() {
        if (!currentData) { showAlert("Run a forecast first.", "Export Error", "error"); return; }
        const f = currentData.forecast;
        let csv = "Month,Projected Sales,Projected Expenses,Projected Profit,Margin\n";
        f.labels.forEach((lbl, i) => {
            const s = f.sales[i], e = f.expenses[i], p = f.profit[i];
            const m = s > 0 ? ((p / s) * 100).toFixed(1) : "0.0";
            csv += `${lbl},${s},${e},${p},${m}%\n`;
        });
        const blob = new Blob([csv], { type: "text/csv" });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement("a");
        a.href = url;
        a.download = "biztrack_forecast.csv";
        a.click();
        URL.revokeObjectURL(url);
    }

    // ── Scenario Simulator Calculations ───────────────────────────────────────
    function recalculateScenario() {
        if (!currentData) return;

        salesChangePct = parseFloat(slideSales.value);
        expensesChangePct = parseFloat(slideExpenses.value);

        badgeSales.textContent = (salesChangePct >= 0 ? "+" : "") + salesChangePct + "%";
        badgeExpenses.textContent = (expensesChangePct >= 0 ? "+" : "") + expensesChangePct + "%";

        const f = currentData.forecast;
        const h = currentData.historical;

        // Apply percentages on top of baseline forecast
        const simSales = f.sales.map(s => s * (1.0 + salesChangePct / 100));
        const simExpenses = f.expenses.map(e => e * (1.0 + expensesChangePct / 100));
        const simProfits = simSales.map((s, i) => s - simExpenses[i]);

        // Summarize baselines
        const baseSalesAvg = f.sales.reduce((a, b) => a + b, 0) / f.sales.length;
        const baseExpensesAvg = f.expenses.reduce((a, b) => a + b, 0) / f.expenses.length;
        const baseProfitAvg = baseSalesAvg - baseExpensesAvg;
        const baseMarginAvg = baseSalesAvg > 0 ? (baseProfitAvg / baseSalesAvg) * 100 : 0;
        const baseHealthAvg = currentData.health_projection.average;
        const baseStatusVal = currentData.health_projection.status;

        // Summarize simulated
        const simSalesAvg = simSales.reduce((a, b) => a + b, 0) / simSales.length;
        const simExpensesAvg = simExpenses.reduce((a, b) => a + b, 0) / simExpenses.length;
        const simProfitAvg = simSalesAvg - simExpensesAvg;
        const simMarginAvg = simSalesAvg > 0 ? (simProfitAvg / simSalesAvg) * 100 : 0;

        // Calculate simulated month-by-month health scores
        // Smooth outlier spikes for the base month by averaging the last min(3, h.sales.length) months
        const recentLen = Math.min(3, h.sales.length);
        const recentSales = h.sales.slice(-recentLen);
        const lastActualSaleVal = recentLen > 0 ? recentSales.reduce((a, b) => a + b, 0) / recentLen : 1.0;
        const simHealthScores = [];
        let prevSaleVal = lastActualSaleVal;
        
        for (let i = 0; i < simSales.length; i++) {
            const sVal = simSales[i];
            const eVal = simExpenses[i];
            
            const expRatio = sVal > 0 ? eVal / sVal : 1.0;
            const pmScore = Math.max(0, Math.min(100, Math.round((1.0 - expRatio) * 100)));
            const erScore = Math.max(0, Math.min(100, Math.round(100 - (expRatio * 100))));
            
            const growthRate = prevSaleVal > 0 ? (sVal - prevSaleVal) / prevSaleVal : 0.0;
            const rtScore = Math.max(0, Math.min(100, Math.round(50 + growthRate * 100)));
            
            const ccScore = 100;
            const monthScore = Math.round(rtScore * 0.35 + erScore * 0.30 + pmScore * 0.20 + ccScore * 0.15);
            simHealthScores.push(monthScore);
            prevSaleVal = sVal;
        }

        const simHealthAvg = Math.round(simHealthScores.reduce((a, b) => a + b, 0) / simHealthScores.length);
        let simStatusVal = "Stable";
        if (simHealthAvg >= 70) simStatusVal = "Healthy";
        else if (simHealthAvg < 45) simStatusVal = "At Risk";

        let simHealthTrend = "Stable";
        const delta = simHealthAvg - baseHealthAvg;
        if (delta >= 2) simHealthTrend = "Improving";
        else if (delta <= -2) simHealthTrend = "Declining";

        // Render Comparison table cells
        cellBaseSales.textContent = fmt(baseSalesAvg);
        cellSimSales.textContent = fmt(simSalesAvg);
        renderVarianceCell(cellVarSales, simSalesAvg - baseSalesAvg, baseSalesAvg, true);

        cellBaseExpenses.textContent = fmt(baseExpensesAvg);
        cellSimExpenses.textContent = fmt(simExpensesAvg);
        renderVarianceCell(cellVarExpenses, simExpensesAvg - baseExpensesAvg, baseExpensesAvg, false);

        cellBaseProfit.textContent = fmt(baseProfitAvg);
        cellSimProfit.textContent = fmt(simProfitAvg);
        renderVarianceCell(cellVarProfit, simProfitAvg - baseProfitAvg, baseProfitAvg, true);

        cellBaseHealth.textContent = baseHealthAvg;
        cellSimHealth.textContent = simHealthAvg;
        renderVarianceCell(cellVarHealth, simHealthAvg - baseHealthAvg, 0, true, true);

        cellBaseStatus.textContent = baseStatusVal;
        cellSimStatus.textContent = simStatusVal;
        cellSimStatus.className = "text-end fw-bold " + 
            (simStatusVal === "Healthy" ? "text-success" : simStatusVal === "Stable" ? "text-warning" : "text-danger");

        // Update Overall Summary Health Score Card (Centerpiece)
        if (elAvgHealth) {
            elAvgHealth.textContent = simHealthAvg;
            elAvgHealth.style.color = simHealthAvg >= 70 ? "#10b981" : simHealthAvg >= 45 ? "#fbbf24" : "#ef4444";
        }
        if (elHealthStatus) {
            elHealthStatus.textContent = simStatusVal;
            elHealthStatus.className = "fw-bold " + 
                (simStatusVal === "Healthy" ? "text-success" : simStatusVal === "Stable" ? "text-warning" : "text-danger");
        }

        // Render month-by-month Health Projection list
        if (elHealthProjectionList) {
            elHealthProjectionList.innerHTML = f.labels.map((lbl, idx) => {
                const sc = simHealthScores[idx];
                const cls = sc >= 70 ? "text-success" : sc >= 45 ? "text-warning" : "text-danger";
                const label = sc >= 70 ? "Healthy" : sc >= 45 ? "Stable" : "At Risk";
                return `
                    <div class="health-projection-item">
                        <span class="fw-semibold text-secondary" style="font-size:0.8rem;">${lbl}</span>
                        <div class="d-flex align-items-center gap-2">
                            <span class="fw-bold ${cls}">${sc}</span>
                            <span class="badge ${sc >= 70 ? 'bg-success-subtle text-success' : sc >= 45 ? 'bg-warning-subtle text-warning' : 'bg-danger-subtle text-danger'}" style="font-size: 0.68rem; padding: 2px 6px;">${label}</span>
                        </div>
                    </div>
                `;
            }).join("");
        }

        if (elHealthTrendText) {
            elHealthTrendText.textContent = simHealthTrend;
            elHealthTrendText.className = "fw-bold " + 
                (simHealthTrend === "Improving" ? "text-success" : simHealthTrend === "Declining" ? "text-danger" : "text-warning");
        }
        if (elHealthTrendIcon) {
            elHealthTrendIcon.innerHTML = simHealthTrend === "Improving" ? '<i class="fa-solid fa-arrow-trend-up text-success"></i>'
                                         : simHealthTrend === "Declining" ? '<i class="fa-solid fa-arrow-trend-down text-danger"></i>'
                                         : '<i class="fa-solid fa-right-long text-warning"></i>';
        }

        // Updates Dynamic insights and Smart actions panels (Frontend generated)
        updateDynamicInsightsPanel(simSalesAvg, simExpensesAvg, simProfitAvg, simMarginAvg, simHealthAvg, simStatusVal, simHealthTrend);

        // Update Charts
        renderMainChart(currentData, simSales, simExpenses);
        renderProfitChart(f.labels, f.profit, simProfits);

        // Update preset buttons active state
        updatePresetButtonsState();
    }

    function renderVarianceCell(element, delta, baseline, isBeneficialPositive, isAbsoluteDifference = false) {
        element.innerHTML = "";
        
        let displayVal = "";
        if (isAbsoluteDifference) {
            displayVal = (delta >= 0 ? "+" : "") + delta.toFixed(1) + (isAbsoluteDifference === true && baseline === 0 ? " pts" : "%");
        } else {
            if (baseline > 0) {
                const pct = (delta / baseline) * 100;
                displayVal = (pct >= 0 ? "+" : "") + pct.toFixed(1) + "%";
            } else {
                displayVal = fmt(delta);
            }
        }

        const isImproved = (delta >= 0 && isBeneficialPositive) || (delta < 0 && !isBeneficialPositive);
        const isUnchanged = Math.abs(delta) < 0.01;

        if (isUnchanged) {
            element.innerHTML = `<span class="diff-neutral">0.0%</span>`;
        } else if (isImproved) {
            element.innerHTML = `<span class="diff-up"><i class="fa-solid fa-caret-up me-1"></i>${displayVal}</span>`;
        } else {
            element.innerHTML = `<span class="diff-down"><i class="fa-solid fa-caret-down me-1"></i>${displayVal}</span>`;
        }
    }

    function updatePresetButtonsState() {
        const presets = [
            { btn: btnPresetBaseline, s: 0, e: 0 },
            { btn: btnPresetOptimistic, s: 15, e: 5 },
            { btn: btnPresetPessimistic, s: -10, e: 10 }
        ];

        let matched = false;
        presets.forEach(p => {
            if (salesChangePct === p.s && expensesChangePct === p.e) {
                p.btn.classList.add("active");
                matched = true;
            } else {
                p.btn.classList.remove("active");
            }
        });

        if (!matched) {
            btnPresetCustom.classList.add("active");
            elBadgeScenarioStatus.textContent = "Custom Plan";
            elBadgeScenarioStatus.style.backgroundColor = "#e8eaf6";
            elBadgeScenarioStatus.style.color = "#283593";
        } else {
            btnPresetCustom.classList.remove("active");
            const activePresetName = salesChangePct === 0 ? "Current Trend" : salesChangePct === 15 ? "Growth Plan" : "Cost Increase";
            elBadgeScenarioStatus.textContent = activePresetName;
            elBadgeScenarioStatus.style.backgroundColor = salesChangePct === 15 ? "#dcfce7" : salesChangePct === 0 ? "#fef3c7" : "#fee2e2";
            elBadgeScenarioStatus.style.color = salesChangePct === 15 ? "#16a34a" : salesChangePct === 0 ? "#d97706" : "#dc2626";
        }
    }

    function applyPreset(salesVal, expensesVal) {
        slideSales.value = salesVal;
        slideExpenses.value = expensesVal;
        recalculateScenario();
    }

    // ── Dynamic Insights Panel Updates ────────────────────────────────────────
    function updateDynamicInsightsPanel(sales, expenses, profit, margin, health, status, trend) {
        if (!elDynamicInsights || !elSmartActionItems) return;

        // Sales to Expense ratio
        const expRatio = sales > 0 ? (expenses / sales) * 100 : 100;

        // Dynamic Insights HTML
        let insightsHtml = "";

        // Profitability status
        if (profit > 0) {
            insightsHtml += `
                <div class="mb-2">
                    <i class="fa-solid fa-coins me-1 text-success"></i>
                    Your business is projected to be <strong>profitable</strong>, with an average monthly profit of <strong>${fmt(profit)}</strong>.
                </div>`;
        } else {
            insightsHtml += `
                <div class="mb-2 text-danger">
                    <i class="fa-solid fa-triangle-exclamation me-1"></i>
                    Your business is projecting an <strong>average monthly loss</strong> of <strong>${fmt(Math.abs(profit))}</strong>. Immediate action is recommended.
                </div>`;
        }

        // Expense ratio insight
        if (expRatio > 80) {
            insightsHtml += `
                <div class="mb-2 text-warning">
                    <i class="fa-solid fa-scale-balanced me-1"></i>
                    Your projected expenses are <strong>too high</strong> compared to expected sales. Reducing unnecessary costs could improve profitability.
                </div>`;
        } else {
            insightsHtml += `
                <div class="mb-2">
                    <i class="fa-solid fa-scale-balanced me-1 text-primary"></i>
                    Your expense levels look healthy and are well within safe bounds.
                </div>`;
        }

        // Health Trend insight
        if (trend === "Improving") {
            if (status === "At Risk" || profit < 0) {
                insightsHtml += `
                    <div class="mb-2 text-warning">
                        <i class="fa-solid fa-arrow-trend-up me-1"></i>
                        Your business health shows minor recovery trends, but remains <strong>at risk</strong> due to projected deficits.
                    </div>`;
            } else {
                insightsHtml += `
                    <div class="mb-2">
                        <i class="fa-solid fa-arrow-trend-up me-1 text-success"></i>
                        Your business health is <strong>improving</strong>. Operational conditions are steadily strengthening.
                    </div>`;
            }
        } else if (trend === "Declining") {
            insightsHtml += `
                <div class="mb-2 text-danger">
                    <i class="fa-solid fa-arrow-trend-down me-1"></i>
                    Your business health shows signs of <strong>decline</strong>. Taking early actions to cut costs or lift sales can stabilize performance.
                </div>`;
        } else {
            insightsHtml += `
                <div class="mb-2">
                    <i class="fa-solid fa-right-long me-1 text-warning"></i>
                    Your overall operational consistency is projected to remain steady.
                </div>`;
        }

        elDynamicInsights.innerHTML = insightsHtml;

        // Dynamic Recommendations HTML based on status
        let recsHtml = "";
        if (status === "Healthy") {
            recsHtml = `
                <div class="d-flex align-items-start gap-2 mb-2">
                    <span class="text-success fw-bold me-1">✓</span>
                    <div>Consider expanding your inventory.</div>
                </div>
                <div class="d-flex align-items-start gap-2 mb-2">
                    <span class="text-success fw-bold me-1">✓</span>
                    <div>Increase marketing efforts.</div>
                </div>
                <div class="d-flex align-items-start gap-2">
                    <span class="text-success fw-bold me-1">✓</span>
                    <div>Explore new sales opportunities.</div>
                </div>
            `;
        } else if (status === "Stable") {
            recsHtml = `
                <div class="d-flex align-items-start gap-2 mb-2">
                    <span class="text-warning fw-bold me-1">✓</span>
                    <div>Monitor expenses carefully.</div>
                </div>
                <div class="d-flex align-items-start gap-2 mb-2">
                    <span class="text-warning fw-bold me-1">✓</span>
                    <div>Maintain current operations.</div>
                </div>
                <div class="d-flex align-items-start gap-2">
                    <span class="text-warning fw-bold me-1">✓</span>
                    <div>Build cash reserves.</div>
                </div>
            `;
        } else { // At Risk
            recsHtml = `
                <div class="d-flex align-items-start gap-2 mb-2">
                    <span class="text-danger fw-bold me-1">!</span>
                    <div>Reduce unnecessary expenses.</div>
                </div>
                <div class="d-flex align-items-start gap-2 mb-2">
                    <span class="text-danger fw-bold me-1">!</span>
                    <div>Review pricing strategy.</div>
                </div>
                <div class="d-flex align-items-start gap-2">
                    <span class="text-danger fw-bold me-1">!</span>
                    <div>Focus on increasing sales.</div>
                </div>
            `;
        }
        elSmartActionItems.innerHTML = recsHtml;
    }

    function resetSliders() {
        slideSales.value = 0;
        slideExpenses.value = 0;
    }

    // ── Strategic AI Report Dialog / Modal ────────────────────────────────────
    async function generateStrategicAiReport() {
        const modalEl = document.getElementById("aiReportModal");
        if (!modalEl) return;
        
        const modalBody = document.getElementById("aiReportModalBody");
        const modal = new bootstrap.Modal(modalEl);
        
        // Show modal immediately with loading state
        modalBody.innerHTML = `
            <div class="text-center py-5">
                <div class="spinner-border text-primary mb-3" style="width: 3rem; height: 3rem;" role="status"></div>
                <h5 class="fw-semibold text-secondary">BizTrack AI is generating your strategic scenario advice...</h5>
                <p class="text-muted small">This may take up to 10 seconds. Analyzing projections, metrics, and levers.</p>
            </div>
        `;
        modal.show();

        const payload = {
            sales_growth: parseFloat(slideSales.value),
            expense_growth: parseFloat(slideExpenses.value),
            additional_marketing: 0.0, // combined slider simplification
            additional_hiring: 0.0
        };

        try {
            const response = await authFetch('/scenario-sim/api/analyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.detail || 'Failed to generate strategic advice report');
            }

            const data = await response.json();
            const reportMarkdown = data.report || "No report generated.";
            
            // Render markdown content to HTML
            if (window.marked && typeof window.marked.parse === 'function') {
                modalBody.innerHTML = `<div class="ai-report-content">${window.marked.parse(reportMarkdown)}</div>`;
            } else {
                modalBody.innerHTML = `<pre style="white-space: pre-wrap; font-size: 0.9rem;">${reportMarkdown}</pre>`;
            }

        } catch (err) {
            console.error('Error generating AI strategy report:', err);
            modalBody.innerHTML = `
                <div class="alert alert-danger d-flex align-items-center gap-2 m-3" role="alert">
                    <i class="fa-solid fa-triangle-exclamation"></i>
                    <div><strong>Error:</strong> ${err.message}</div>
                </div>
            `;
        }
    }

    // ── Wire up slider & buttons listeners ────────────────────────────────────
    slideSales.addEventListener("input", recalculateScenario);
    slideExpenses.addEventListener("input", recalculateScenario);

    btnPresetBaseline.addEventListener("click", () => applyPreset(0, 0));
    btnPresetOptimistic.addEventListener("click", () => applyPreset(15, 5));
    btnPresetPessimistic.addEventListener("click", () => applyPreset(-10, 10));
    btnResetScenario.addEventListener("click", () => applyPreset(0, 0));

    btnOpenStrategicReport.addEventListener("click", generateStrategicAiReport);

    btnRun.addEventListener("click", loadForecast);
    if (btnExport) btnExport.addEventListener("click", exportCSV);
    if (selModel)  selModel.addEventListener("change", updateModelDesc);

    // Show description for default model immediately
    updateModelDesc();

    // Auto-run on page load
    loadForecast();

}); // end DOMContentLoaded
