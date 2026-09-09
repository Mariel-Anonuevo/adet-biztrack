/**
 * scenario_sim.js – BizTrack Scenario Simulator
 * Performs real-time simulations in the client browser for instant interactivity.
 */

let scenarioChart = null;
let rawData = null; // Stores { historical, baseline } fetched from server

document.addEventListener("DOMContentLoaded", () => {
    // ── DOM References ────────────────────────────────────────────────────────
    const slideSalesGrowth = document.getElementById("slideSalesGrowth");
    const slideExpenseGrowth = document.getElementById("slideExpenseGrowth");
    const slideMarketing = document.getElementById("slideMarketing");
    const slideHiring = document.getElementById("slideHiring");

    const valSalesGrowth = document.getElementById("valSalesGrowth");
    const valExpenseGrowth = document.getElementById("valExpenseGrowth");
    const valMarketing = document.getElementById("valMarketing");
    const valHiring = document.getElementById("valHiring");

    const btnReset = document.getElementById("btnResetSliders");
    const btnGenerateReport = document.getElementById("btnGenerateReport");
    const aiReportModalEl = document.getElementById("aiReportModal");
    const aiReportModalBody = document.getElementById("aiReportModalBody");
    const aiReportModal = new bootstrap.Modal(aiReportModalEl);

    const kpiSalesMain = document.getElementById("simKpiSalesMain");
    const kpiSalesDiff = document.getElementById("simKpiSalesDiff");
    const kpiSalesBase = document.getElementById("simKpiSalesBase");

    const kpiExpensesMain = document.getElementById("simKpiExpensesMain");
    const kpiExpensesDiff = document.getElementById("simKpiExpensesDiff");
    const kpiExpensesBase = document.getElementById("simKpiExpensesBase");

    const kpiProfitMain = document.getElementById("simKpiProfitMain");
    const kpiProfitDiff = document.getElementById("simKpiProfitDiff");
    const kpiProfitBase = document.getElementById("simKpiProfitBase");

    const kpiMarginMain = document.getElementById("simKpiMarginMain");
    const kpiMarginDiff = document.getElementById("simKpiMarginDiff");
    const kpiMarginBase = document.getElementById("simKpiMarginBase");

    // Header AI Chat trigger linkage
    const headerAiBtn = document.getElementById("triggerAiChatFromHeader");
    if (headerAiBtn) {
        headerAiBtn.addEventListener("click", () => {
            const aiFab = document.getElementById("ai-chat-fab");
            if (aiFab) aiFab.click();
        });
    }

    if (!slideSalesGrowth) {
        console.error("[ScenarioSim] Controls not found in the DOM.");
        return;
    }

    // ── Formatting Utilities ──────────────────────────────────────────────────
    function fmt(n) {
        return "₱" + Math.round(n).toLocaleString("en-PH");
    }

    function fmtPct(n) {
        return (n >= 0 ? "+" : "") + n.toFixed(1) + "%";
    }

    // ── Main Initialization ──
    async function initSimulator() {
        try {
            const res = await authFetch("/scenario-sim/api/baseline");
            if (!res.ok) {
                throw new Error(`Server returned code ${res.status}`);
            }
            rawData = await res.json();
            if (rawData.error) {
                showError(rawData.error);
                return;
            }
            // Populate baseline display and run initial simulation
            populateBaselineDisplay();
            runSimulation();
        } catch (err) {
            console.error("Initialization error:", err);
            showError("Could not load simulation baseline data. Please try again later.");
        }
    }

    function showError(msg) {
        if (aiReportModalBody) {
            aiReportModalBody.innerHTML = `<div class="text-danger text-center py-4"><i class="fa-solid fa-circle-exclamation me-2"></i>${msg}</div>`;
            aiReportModal.show();
        }
    }

    // Populate the baseline labels in the KPI Cards
    function populateBaselineDisplay() {
        const base = rawData.baseline;
        const avgSales = base.sales.reduce((a, b) => a + b, 0) / base.sales.length;
        const avgExpenses = base.expenses.reduce((a, b) => a + b, 0) / base.expenses.length;
        const totalProfit = base.profit.reduce((a, b) => a + b, 0);
        const margin = (total_sales_sum = base.sales.reduce((a, b) => a + b, 0)) > 0 ? (totalProfit / total_sales_sum * 100) : 0;

        kpiSalesBase.textContent = fmt(avgSales);
        kpiExpensesBase.textContent = fmt(avgExpenses);
        kpiProfitBase.textContent = fmt(totalProfit);
        kpiMarginBase.textContent = margin.toFixed(1) + "%";
    }

    // ── Run Simulation and Update Interface ──────────────────────────────────
    function runSimulation() {
        if (!rawData) return;

        // Parse slider inputs
        const salesGrowthOffset = parseFloat(slideSalesGrowth.value) || 0;
        const expenseGrowthOffset = parseFloat(slideExpenseGrowth.value) || 0;
        const flatMarketing = parseFloat(slideMarketing.value) || 0;
        const flatHiring = parseFloat(slideHiring.value) || 0;

        // Update slider value text badges
        valSalesGrowth.textContent = (salesGrowthOffset >= 0 ? "+" : "") + salesGrowthOffset + "%";
        valExpenseGrowth.textContent = (expenseGrowthOffset >= 0 ? "+" : "") + expenseGrowthOffset + "%";
        valMarketing.textContent = fmt(flatMarketing);
        valHiring.textContent = fmt(flatHiring);

        // Extract raw baseline projection vectors
        const base = rawData.baseline;
        const simSales = [];
        const simExpenses = [];
        const simProfit = [];

        for (let i = 0; i < base.sales.length; i++) {
            // Apply sales growth offset
            const s = base.sales[i] * (1.0 + salesGrowthOffset / 100.0);
            simSales.push(s);

            // Apply expense growth offset + flat budgets
            const e = base.expenses[i] * (1.0 + expenseGrowthOffset / 100.0) + flatMarketing + flatHiring;
            simExpenses.push(e);

            simProfit.push(s - e);
        }

        // Calculate simulated metrics
        const simAvgSales = simSales.reduce((a, b) => a + b, 0) / simSales.length;
        const simAvgExpenses = simExpenses.reduce((a, b) => a + b, 0) / simExpenses.length;
        const simTotalProfit = simProfit.reduce((a, b) => a + b, 0);
        
        const simTotalSales = simSales.reduce((a, b) => a + b, 0);
        const simMargin = simTotalSales > 0 ? (simTotalProfit / simTotalSales * 100) : 0;

        // Calculate baseline metrics for comparison
        const baseAvgSales = base.sales.reduce((a, b) => a + b, 0) / base.sales.length;
        const baseAvgExpenses = base.expenses.reduce((a, b) => a + b, 0) / base.expenses.length;
        const baseTotalProfit = base.profit.reduce((a, b) => a + b, 0);
        const baseTotalSales = base.sales.reduce((a, b) => a + b, 0);
        const baseMargin = baseTotalSales > 0 ? (baseTotalProfit / baseTotalSales * 100) : 0;

        // Update KPI card text
        kpiSalesMain.textContent = fmt(simAvgSales);
        kpiExpensesMain.textContent = fmt(simAvgExpenses);
        kpiProfitMain.textContent = fmt(simTotalProfit);
        kpiMarginMain.textContent = simMargin.toFixed(1) + "%";

        // Update KPI Difference Badges
        updateDiffBadge(kpiSalesDiff, simAvgSales - baseAvgSales, (simAvgSales - baseAvgSales) / baseAvgSales * 100, true);
        updateDiffBadge(kpiExpensesDiff, simAvgExpenses - baseAvgExpenses, (simAvgExpenses - baseAvgExpenses) / baseAvgExpenses * 100, false);
        updateDiffBadge(kpiProfitDiff, simTotalProfit - baseTotalProfit, (simTotalProfit - baseTotalProfit), true, true);
        updateDiffBadge(kpiMarginDiff, simMargin - baseMargin, simMargin - baseMargin, true, false, true);

        // Update the visual chart
        updateChart(simSales, simExpenses);
    }

    function updateDiffBadge(badge, diffVal, percentageOrRaw, positiveIsGood, isCurrency = false, isRawMargin = false) {
        badge.className = "sim-kpi-diff-badge";
        
        const isBetter = positiveIsGood ? diffVal > 0 : diffVal < 0;
        const isWorse = positiveIsGood ? diffVal < 0 : diffVal > 0;

        if (isBetter) {
            badge.classList.add("diff-up");
            badge.innerHTML = `<i class="fa-solid fa-caret-up me-1"></i>`;
        } else if (isWorse) {
            badge.classList.add("diff-down");
            badge.innerHTML = `<i class="fa-solid fa-caret-down me-1"></i>`;
        } else {
            badge.classList.add("diff-neutral");
            badge.innerHTML = ``;
        }

        if (isCurrency) {
            const absFormatted = Math.abs(Math.round(diffVal)).toLocaleString("en-PH");
            badge.innerHTML += `${diffVal >= 0 ? "+" : "-"}₱${absFormatted}`;
        } else if (isRawMargin) {
            badge.innerHTML += `${diffVal >= 0 ? "+" : ""}${diffVal.toFixed(1)}%`;
        } else {
            badge.innerHTML += `${percentageOrRaw >= 0 ? "+" : ""}${percentageOrRaw.toFixed(1)}%`;
        }
    }

    // ── Render / Update Chart.js ──────────────────────────────────────────────
    function updateChart(simSales, simExpenses) {
        const canvas = document.getElementById("scenarioChart");
        if (!canvas) return;
        const ctx = canvas.getContext("2d");

        const h = rawData.historical;
        const b = rawData.baseline;
        const allLabels = [...h.labels, ...b.labels];
        const hLen = h.labels.length;
        const fLen = b.labels.length;

        // Formulate dataset paths
        // Historical data runs up to index hLen - 1
        const histSalesArr = [...h.sales, ...Array(fLen).fill(null)];
        const histExpensesArr = [...h.expenses, ...Array(fLen).fill(null)];

        // Baseline forecast starts blending from final historical point
        const baseSalesArr = [...Array(hLen - 1).fill(null), h.sales[hLen - 1], ...b.sales];
        const baseExpensesArr = [...Array(hLen - 1).fill(null), h.expenses[hLen - 1], ...b.expenses];

        // Simulated forecast starts blending from final historical point
        const simulatedSalesArr = [...Array(hLen - 1).fill(null), h.sales[hLen - 1], ...simSales];
        const simulatedExpensesArr = [...Array(hLen - 1).fill(null), h.expenses[hLen - 1], ...simExpenses];

        if (scenarioChart) {
            // Update datasets and redraw
            scenarioChart.data.labels = allLabels;
            scenarioChart.data.datasets[0].data = histSalesArr;
            scenarioChart.data.datasets[1].data = baseSalesArr;
            scenarioChart.data.datasets[2].data = simulatedSalesArr;
            scenarioChart.data.datasets[3].data = histExpensesArr;
            scenarioChart.data.datasets[4].data = baseExpensesArr;
            scenarioChart.data.datasets[5].data = simulatedExpensesArr;
            scenarioChart.update("none"); // Update without transition lag
            return;
        }

        scenarioChart = new Chart(ctx, {
            type: "line",
            data: {
                labels: allLabels,
                datasets: [
                    // SALES SERIES
                    {
                        label: "Sales (historical)",
                        data: histSalesArr,
                        borderColor: "#22c55e",
                        borderWidth: 2,
                        pointRadius: 3,
                        fill: false,
                        tension: 0.3,
                        spanGaps: false
                    },
                    {
                        label: "Sales (baseline)",
                        data: baseSalesArr,
                        borderColor: "#22c55e",
                        borderWidth: 1.5,
                        borderDash: [5, 5],
                        pointRadius: 0,
                        fill: false,
                        tension: 0.3,
                        spanGaps: false,
                        opacity: 0.4
                    },
                    {
                        label: "Sales (simulated)",
                        data: simulatedSalesArr,
                        borderColor: "#10b981",
                        borderWidth: 3,
                        pointRadius: 4,
                        pointBackgroundColor: "#10b981",
                        fill: false,
                        tension: 0.3,
                        spanGaps: false
                    },
                    // EXPENSES SERIES
                    {
                        label: "Expenses (historical)",
                        data: histExpensesArr,
                        borderColor: "#ef4444",
                        borderWidth: 2,
                        pointRadius: 3,
                        fill: false,
                        tension: 0.3,
                        spanGaps: false
                    },
                    {
                        label: "Expenses (baseline)",
                        data: baseExpensesArr,
                        borderColor: "#ef4444",
                        borderWidth: 1.5,
                        borderDash: [5, 5],
                        pointRadius: 0,
                        fill: false,
                        tension: 0.3,
                        spanGaps: false,
                        opacity: 0.4
                    },
                    {
                        label: "Expenses (simulated)",
                        data: simulatedExpensesArr,
                        borderColor: "#dc2626",
                        borderWidth: 3,
                        pointRadius: 4,
                        pointBackgroundColor: "#dc2626",
                        fill: false,
                        tension: 0.3,
                        spanGaps: false
                    }
                ]
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
                    x: { grid: { color: "rgba(0,0,0,0.03)" }, ticks: { color: "#6b7280", font: { size: 10 }, autoSkip: true, maxTicksLimit: 12 } },
                    y: {
                        grid: { color: "rgba(0,0,0,0.05)" },
                        ticks: {
                            color: "#6b7280",
                            font: { size: 10 },
                            callback: (v) => "₱" + Number(v).toLocaleString("en-PH")
                        }
                    }
                }
            }
        });

        // Add visual background split shading to highlight simulated section
        const shadingPlugin = {
            id: "scenarioShading_" + Date.now(),
            afterDraw(chart) {
                const { ctx: c, chartArea, scales } = chart;
                if (!chartArea) return;
                const x0 = scales.x.getPixelForValue(hLen - 1);
                const x1 = chartArea.right;
                c.save();
                c.fillStyle = "rgba(124, 58, 237, 0.03)";
                c.fillRect(x0, chartArea.top, x1 - x0, chartArea.bottom - chartArea.top);
                c.strokeStyle = "rgba(124, 58, 237, 0.2)";
                c.setLineDash([3, 3]);
                c.lineWidth = 1.5;
                c.beginPath();
                c.moveTo(x0, chartArea.top);
                c.lineTo(x0, chartArea.bottom);
                c.stroke();
                c.restore();
            }
        };
        Chart.register(shadingPlugin);
        scenarioChart.update();
    }

    // ── Generate AI Analysis via Gemini API ──────────────────────────────────
    async function fetchAiReport() {
        if (!aiReportModalBody) return;

        btnGenerateReport.disabled = true;
        btnGenerateReport.innerHTML = `<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Analyzing...`;
        
        // Show modal immediately with loading state
        aiReportModalBody.innerHTML = `
            <div class="text-center py-5">
                <div class="spinner-border text-primary mb-3" style="width: 2.5rem; height: 2.5rem;" role="status"></div>
                <div class="text-muted fw-semibold">Evaluating scenario feasibility and calculating strategic suggestions...</div>
            </div>
        `;
        aiReportModal.show();

        const payload = {
            sales_growth: parseFloat(slideSalesGrowth.value) || 0,
            expense_growth: parseFloat(slideExpenseGrowth.value) || 0,
            additional_marketing: parseFloat(slideMarketing.value) || 0,
            additional_hiring: parseFloat(slideHiring.value) || 0
        };

        try {
            const res = await authFetch("/scenario-sim/api/analyze", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });

            if (!res.ok) {
                throw new Error(`Server returned code ${res.status}`);
            }

            const data = await res.json();
            if (data.report) {
                // Parse markdown to HTML using marked.js defensively
                if (typeof marked !== "undefined" && typeof marked.parse === "function") {
                    aiReportModalBody.innerHTML = marked.parse(data.report);
                } else if (typeof marked === "function") {
                    aiReportModalBody.innerHTML = marked(data.report);
                } else {
                    aiReportModalBody.innerHTML = `<div class="ai-report-content"><pre style="white-space: pre-wrap; font-family: inherit;">${data.report}</pre></div>`;
                }
            } else {
                aiReportModalBody.textContent = "Unable to fetch strategic recommendation. Please try again.";
            }
        } catch (err) {
            console.error("AI report error:", err);
            aiReportModalBody.innerHTML = `<div class="text-danger py-4 text-center"><i class="fa-solid fa-circle-exclamation me-2"></i>Could not connect to AI advisor: ${err.message}</div>`;
        } finally {
            btnGenerateReport.disabled = false;
            btnGenerateReport.innerHTML = `<i class="fa-solid fa-wand-magic-sparkles"></i> Generate AI Analysis`;
        }
    }

    // ── Event Listeners ───────────────────────────────────────────────────────
    slideSalesGrowth.addEventListener("input", runSimulation);
    slideExpenseGrowth.addEventListener("input", runSimulation);
    slideMarketing.addEventListener("input", runSimulation);
    slideHiring.addEventListener("input", runSimulation);

    btnReset.addEventListener("click", () => {
        slideSalesGrowth.value = 0;
        slideExpenseGrowth.value = 0;
        slideMarketing.value = 0;
        slideHiring.value = 0;
        runSimulation();
    });

    btnGenerateReport.addEventListener("click", fetchAiReport);

    // Run
    initSimulator();
});
