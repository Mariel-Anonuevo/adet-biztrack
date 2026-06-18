/**
 * forecasting.js – BizTrack Forecasting Page
 * Fetches linear-regression forecast data and renders interactive charts + table.
 */

(function () {
    "use strict";

    // ── State ───────────────────────────────────────────────────────────────
    let forecastChart = null;
    let profitChart = null;
    let currentData = null;

    // ── DOM References ──────────────────────────────────────────────────────
    const btnRun = document.getElementById("btnRunForecast");
    const btnExport = document.getElementById("btnExportForecast");
    const selPeriods = document.getElementById("fcPeriods");

    const elAvgSales = document.getElementById("fcAvgSales");
    const elAvgExpenses = document.getElementById("fcAvgExpenses");
    const elAvgProfit = document.getElementById("fcAvgProfit");
    const elTrend = document.getElementById("fcTrend");
    const elTrendIcon = document.getElementById("fcTrendIcon");
    const elTrendIconWrap = document.getElementById("fcTrendIconWrap");
    const elGrowthPct = document.getElementById("fcGrowthPct");
    const elConfidenceVal = document.getElementById("fcConfidenceVal");
    const elConfidenceBadge = document.getElementById("fcConfidenceBadge");
    const elRecommendations = document.getElementById("fcRecommendations");
    const elTableBody = document.getElementById("fcTableBody");
    const elTablePeriodLabel = document.getElementById("fcTablePeriodLabel");

    // ── Utilities ───────────────────────────────────────────────────────────
    function fmt(n) {
        return "₱" + Number(n).toLocaleString("en-PH", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    }

    function fmtPct(n) {
        return (n >= 0 ? "+" : "") + Number(n).toFixed(1) + "%";
    }

    function statusBadge(profit) {
        if (profit > 0) return `<span class="trend-up">Profit</span>`;
        if (profit < 0) return `<span class="trend-down">Loss</span>`;
        return `<span class="badge bg-secondary">Break-even</span>`;
    }

    // ── Main fetch & render ─────────────────────────────────────────────────
    async function loadForecast() {
        const periods = parseInt(selPeriods.value, 10) || 3;

        btnRun.disabled = true;
        btnRun.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Forecasting…';

        try {
            const res = await fetch(`/forecasting/api/forecast?periods=${periods}`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            if (data.error) {
                alert(data.error);
                return;
            }
            currentData = data;
            renderKPIs(data.kpis);
            renderMainChart(data);
            renderProfitChart(data.forecast);
            renderRecommendations(data.recommendations);
            renderTable(data.forecast);
        } catch (err) {
            console.error("Forecast error:", err);
        } finally {
            btnRun.disabled = false;
            btnRun.innerHTML = '<i class="fa-solid fa-bolt"></i> Run Forecast';
        }
    }

    // ── KPI Cards ───────────────────────────────────────────────────────────
    function renderKPIs(kpis) {
        elAvgSales.textContent = fmt(kpis.avg_forecast_sales);
        elAvgExpenses.textContent = fmt(kpis.avg_forecast_expenses);

        const profit = kpis.avg_forecast_profit;
        elAvgProfit.textContent = fmt(profit);
        elAvgProfit.style.color = profit >= 0 ? "#16a34a" : "#dc2626";

        elTrend.textContent = kpis.trend_direction;
        elTrend.style.color = kpis.trend_color;

        // Trend icon
        elTrendIcon.className = `fa-solid ${kpis.trend_icon}`;
        elTrendIconWrap.style.background = `linear-gradient(135deg, ${kpis.trend_color}cc, ${kpis.trend_color})`;

        const g = kpis.sales_growth_pct;
        elGrowthPct.textContent = fmtPct(g) + " vs last actual month";
        elGrowthPct.style.color = g >= 0 ? "#16a34a" : "#dc2626";

        // Confidence badge
        const c = kpis.confidence;
        elConfidenceVal.textContent = c;
        elConfidenceBadge.style.backgroundColor = c >= 70 ? "#dcfce7" : c >= 40 ? "#fef9c3" : "#fee2e2";
        elConfidenceBadge.style.color = c >= 70 ? "#15803d" : c >= 40 ? "#854d0e" : "#dc2626";
        elConfidenceBadge.style.borderColor = c >= 70 ? "#86efac" : c >= 40 ? "#fde68a" : "#fca5a5";
    }

    // ── Main Line Chart (historical + forecast) ─────────────────────────────
    function renderMainChart(data) {
        const ctx = document.getElementById("forecastChart").getContext("2d");

        const hLabels = data.historical.labels;
        const fLabels = data.forecast.labels;
        const allLabels = [...hLabels, ...fLabels];

        const hLen = hLabels.length;
        const fLen = fLabels.length;

        // Actual sales (historical only, NaN for forecast months)
        const actualSales = [
            ...data.historical.sales,
            ...Array(fLen).fill(null),
        ];
        // Forecast sales: bridge from last historical point
        const forecastSalesArr = [
            ...Array(hLen - 1).fill(null),
            data.historical.sales[hLen - 1], // bridge
            ...data.forecast.sales,
        ];
        // Same for expenses
        const actualExpenses = [
            ...data.historical.expenses,
            ...Array(fLen).fill(null),
        ];
        const forecastExpensesArr = [
            ...Array(hLen - 1).fill(null),
            data.historical.expenses[hLen - 1],
            ...data.forecast.expenses,
        ];

        if (forecastChart) forecastChart.destroy();

        forecastChart = new Chart(ctx, {
            type: "line",
            data: {
                labels: allLabels,
                datasets: [
                    {
                        label: "Sales (Actual)",
                        data: actualSales,
                        borderColor: "#22c55e",
                        backgroundColor: "rgba(34,197,94,0.08)",
                        borderWidth: 2.5,
                        pointRadius: 4,
                        pointBackgroundColor: "#22c55e",
                        fill: false,
                        tension: 0.35,
                        spanGaps: false,
                    },
                    {
                        label: "Sales (Forecast)",
                        data: forecastSalesArr,
                        borderColor: "#22c55e",
                        backgroundColor: "rgba(134,239,172,0.12)",
                        borderWidth: 2.5,
                        borderDash: [6, 4],
                        pointRadius: 4,
                        pointBackgroundColor: "#86efac",
                        fill: false,
                        tension: 0.35,
                        spanGaps: false,
                    },
                    {
                        label: "Expenses (Actual)",
                        data: actualExpenses,
                        borderColor: "#f97316",
                        backgroundColor: "rgba(249,115,22,0.08)",
                        borderWidth: 2.5,
                        pointRadius: 4,
                        pointBackgroundColor: "#f97316",
                        fill: false,
                        tension: 0.35,
                        spanGaps: false,
                    },
                    {
                        label: "Expenses (Forecast)",
                        data: forecastExpensesArr,
                        borderColor: "#f97316",
                        backgroundColor: "rgba(252,165,165,0.1)",
                        borderWidth: 2.5,
                        borderDash: [6, 4],
                        pointRadius: 4,
                        pointBackgroundColor: "#fca5a5",
                        fill: false,
                        tension: 0.35,
                        spanGaps: false,
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
                        callbacks: {
                            label: (ctx) => {
                                if (ctx.raw === null) return null;
                                return ` ${ctx.dataset.label}: ${fmt(ctx.raw)}`;
                            },
                        },
                    },
                    // Shaded forecast region annotation via plugin (manual)
                },
                scales: {
                    x: {
                        grid: { color: "rgba(0,0,0,0.05)" },
                        ticks: { color: "#6b7280", font: { size: 11 } },
                    },
                    y: {
                        grid: { color: "rgba(0,0,0,0.05)" },
                        ticks: {
                            color: "#6b7280",
                            font: { size: 11 },
                            callback: (v) => "₱" + Number(v).toLocaleString(),
                        },
                    },
                },
            },
        });

        // Draw forecast background shading via afterDraw plugin
        forecastChart.options.plugins.customForecastShade = true;
        const shadingPlugin = {
            id: "forecastShading",
            afterDraw(chart) {
                const { ctx: c, chartArea, scales } = chart;
                if (!chartArea) return;
                const xScale = scales.x;
                const splitIndex = hLen - 1; // first forecast label starts after this
                const x0 = xScale.getPixelForIndex(splitIndex);
                const x1 = chartArea.right;
                c.save();
                c.fillStyle = "rgba(99,102,241,0.05)";
                c.fillRect(x0, chartArea.top, x1 - x0, chartArea.bottom - chartArea.top);
                // Vertical divider
                c.strokeStyle = "rgba(99,102,241,0.35)";
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

    // ── Profit Bar Chart ────────────────────────────────────────────────────
    function renderProfitChart(forecast) {
        const ctx = document.getElementById("profitForecastChart").getContext("2d");
        const profits = forecast.profit;
        const colors = profits.map((p) => (p >= 0 ? "#22c55e" : "#dc2626"));
        const bgColors = profits.map((p) => (p >= 0 ? "rgba(34,197,94,0.15)" : "rgba(220,38,38,0.15)"));

        if (profitChart) profitChart.destroy();

        profitChart = new Chart(ctx, {
            type: "bar",
            data: {
                labels: forecast.labels,
                datasets: [
                    {
                        label: "Projected Profit",
                        data: profits,
                        backgroundColor: bgColors,
                        borderColor: colors,
                        borderWidth: 2,
                        borderRadius: 6,
                    },
                ],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => ` Profit: ${fmt(ctx.raw)}`,
                        },
                    },
                },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: { color: "#6b7280", font: { size: 11 } },
                    },
                    y: {
                        grid: { color: "rgba(0,0,0,0.05)" },
                        ticks: {
                            color: "#6b7280",
                            font: { size: 11 },
                            callback: (v) => "₱" + Number(v).toLocaleString(),
                        },
                    },
                },
            },
        });
    }

    // ── Recommendations ─────────────────────────────────────────────────────
    function renderRecommendations(recs) {
        elRecommendations.innerHTML = "";
        recs.forEach((r) => {
            elRecommendations.innerHTML += `
              <div class="d-flex gap-3 align-items-start p-3 rounded-3"
                   style="background:${hexToRgba(r.color, 0.06)};border:1px solid ${hexToRgba(r.color, 0.2)};">
                <span class="rounded-circle d-flex align-items-center justify-content-center text-white flex-shrink-0"
                      style="width:34px;height:34px;background:${r.color};font-size:0.85rem;">
                    <i class="fa-solid ${r.icon}"></i>
                </span>
                <div>
                    <div class="fw-bold mb-1" style="color:${r.color};">${r.title}</div>
                    <div class="small text-secondary">${r.text}</div>
                </div>
              </div>`;
        });
    }

    // ── Forecast Table ──────────────────────────────────────────────────────
    function renderTable(forecast) {
        const n = forecast.labels.length;
        elTablePeriodLabel.textContent = `${n}-month projection`;
        elTableBody.innerHTML = "";

        for (let i = 0; i < n; i++) {
            const s = forecast.sales[i];
            const e = forecast.expenses[i];
            const p = forecast.profit[i];
            const margin = s > 0 ? ((p / s) * 100).toFixed(1) : "0.0";

            elTableBody.innerHTML += `
              <tr>
                <td class="fw-semibold">${forecast.labels[i]}</td>
                <td class="amount-text">${fmt(s)}</td>
                <td style="color:#dc2626;font-weight:600;">${fmt(e)}</td>
                <td style="color:${p >= 0 ? "#16a34a" : "#dc2626"};font-weight:600;">${fmt(p)}</td>
                <td><span class="${p >= 0 ? "trend-up" : "trend-down"}">${margin}%</span></td>
                <td>${statusBadge(p)}</td>
              </tr>`;
        }
    }

    // ── Export CSV ──────────────────────────────────────────────────────────
    function exportCSV() {
        if (!currentData) return;
        const f = currentData.forecast;
        let csv = "Month,Projected Sales,Projected Expenses,Projected Profit,Margin\n";
        f.labels.forEach((lbl, i) => {
            const s = f.sales[i];
            const e = f.expenses[i];
            const p = f.profit[i];
            const m = s > 0 ? ((p / s) * 100).toFixed(1) : "0.0";
            csv += `${lbl},${s},${e},${p},${m}%\n`;
        });
        const blob = new Blob([csv], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "biztrack_forecast.csv";
        a.click();
        URL.revokeObjectURL(url);
    }

    // ── Helper ──────────────────────────────────────────────────────────────
    function hexToRgba(hex, alpha) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r},${g},${b},${alpha})`;
    }

    // ── Event Listeners ─────────────────────────────────────────────────────
    btnRun.addEventListener("click", loadForecast);
    btnExport.addEventListener("click", exportCSV);

    // Auto-load on page open
    loadForecast();
})();
