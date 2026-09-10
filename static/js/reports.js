// ── Pagination and Filter state ─────────────────────────────────────────────
const REPORTS_ROWS_PER_PAGE = 10;
let currentReportsPage = 1;
let allReportsRecords   = [];
let filteredReportsRecords = [];

document.addEventListener('DOMContentLoaded', () => {
    // Bind search input event
    const searchInput = document.getElementById('searchReports');
    if (searchInput) {
        searchInput.addEventListener('input', applySearchFilter);
    }

    const exportBtn = document.getElementById('btnExportReports');
    if (exportBtn) {
        exportBtn.addEventListener('click', handleExportReports);
    }

    const generatePdfBtn = document.getElementById('btnGeneratePDF');
    if (generatePdfBtn) {
        generatePdfBtn.addEventListener('click', handleGeneratePDF);
    }

    // Set up print event listeners
    window.addEventListener('beforeprint', handleBeforePrint);
    window.addEventListener('afterprint', handleAfterPrint);

    fetchHistoricalData();
});

async function fetchHistoricalData() {
    try {
        const response = await authFetch('/reports/api/historical');
        if (response.status === 403) {
            return;
        }
        const data = await response.json();
        renderTable(data);
    } catch (error) {
        console.error("Error fetching report data:", error);
        const tbody = document.getElementById('reportsTableBody');
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="5" class="text-center text-danger py-4">
                <i class="fa-solid fa-circle-exclamation me-2"></i>Failed to load records.
            </td></tr>`;
        }
    }
}

function renderTable(records) {
    allReportsRecords = records || [];
    populateMonthFilter(allReportsRecords);
    applySearchFilter();
}

function applySearchFilter() {
    const searchInput = document.getElementById('searchReports');
    const query = searchInput ? searchInput.value.trim().toLowerCase() : '';

    filteredReportsRecords = allReportsRecords.filter(record => {
        const matchDate = (record.date || '').toLowerCase().includes(query);
        const matchMonth = (record.month || '').toLowerCase().includes(query);
        const matchType = (record.type || '').toLowerCase().includes(query);
        const matchDesc = (record.description || '').toLowerCase().includes(query);
        const matchCat = (record.category || '').toLowerCase().includes(query);
        const matchAmount = String(record.amount || '').toLowerCase().includes(query);

        return matchDate || matchMonth || matchType || matchDesc || matchCat || matchAmount;
    });

    currentReportsPage = 1;
    renderReportsPage();
}

function renderReportsPage() {
    const tbody       = document.getElementById('reportsTableBody');
    const recordCount = document.getElementById('recordCount');
    const records     = filteredReportsRecords;

    tbody.innerHTML = '';

    if (!records || records.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-secondary">No matching records found.</td></tr>';
        if (recordCount) recordCount.innerText = '0 records total';
        renderReportsPagination(0);
        return;
    }

    const totalPages = Math.ceil(records.length / REPORTS_ROWS_PER_PAGE);
    currentReportsPage = Math.max(1, Math.min(currentReportsPage, totalPages));
    const start = (currentReportsPage - 1) * REPORTS_ROWS_PER_PAGE;
    const end   = Math.min(start + REPORTS_ROWS_PER_PAGE, records.length);
    const pageRecords = records.slice(start, end);

    pageRecords.forEach(record => {
        const formattedAmount = new Intl.NumberFormat('en-PH', { 
            style: 'currency', currency: 'PHP', minimumFractionDigits: 0
        }).format(record.amount);

        const typeBadge = record.type === 'Sale' 
            ? `<span class="badge rounded-pill bg-success bg-opacity-25 text-success border border-success border-opacity-50 px-3 py-1 d-print-none">Sale</span><span class="d-none d-print-inline text-success fw-bold">Sale</span>`
            : `<span class="badge rounded-pill bg-warning bg-opacity-25 text-warning border border-warning border-opacity-50 px-3 py-1 d-print-none">Expense</span><span class="d-none d-print-inline text-warning fw-bold">Expense</span>`;

        const amountColor = record.type === 'Sale' ? 'var(--amount-color)' : '#ff6d00';

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="ps-4 text-secondary">${record.date}</td>
            <td>${typeBadge}</td>
            <td class="fw-bold">${record.description}</td>
            <td class="text-secondary">${record.category}</td>
            <td class="fw-medium" style="color: ${amountColor}">${formattedAmount}</td>
        `;
        tbody.appendChild(tr);
    });

    if (recordCount) recordCount.innerText = `Showing ${start + 1}–${end} of ${records.length} records`;
    renderReportsPagination(totalPages);
}

function renderReportsPagination(totalPages) {
    const container = document.getElementById('reportsPagination');
    if (!container) return;

    if (totalPages <= 1) { container.innerHTML = ''; return; }

    const maxVisible = 5;
    let startPage = Math.max(1, currentReportsPage - Math.floor(maxVisible / 2));
    let endPage   = Math.min(totalPages, startPage + maxVisible - 1);
    if (endPage - startPage < maxVisible - 1) startPage = Math.max(1, endPage - maxVisible + 1);

    let html = '<ul class="pagination pagination-sm mb-0 flex-wrap">';

    // Prev
    html += `<li class="page-item ${currentReportsPage === 1 ? 'disabled' : ''}">
        <a class="page-link" href="javascript:void(0)" onclick="goToReportsPage(${currentReportsPage - 1})">
            <i class="fa-solid fa-chevron-left" style="font-size:.65rem;"></i>
        </a></li>`;

    if (startPage > 1) {
        html += `<li class="page-item"><a class="page-link" href="javascript:void(0)" onclick="goToReportsPage(1)">1</a></li>`;
        if (startPage > 2) html += `<li class="page-item disabled"><span class="page-link">…</span></li>`;
    }

    for (let p = startPage; p <= endPage; p++) {
        html += `<li class="page-item ${p === currentReportsPage ? 'active' : ''}">
            <a class="page-link" href="javascript:void(0)" onclick="goToReportsPage(${p})">${p}</a></li>`;
    }

    if (endPage < totalPages) {
        if (endPage < totalPages - 1) html += `<li class="page-item disabled"><span class="page-link">…</span></li>`;
        html += `<li class="page-item"><a class="page-link" href="javascript:void(0)" onclick="goToReportsPage(${totalPages})">${totalPages}</a></li>`;
    }

    // Next
    html += `<li class="page-item ${currentReportsPage === totalPages ? 'disabled' : ''}">
        <a class="page-link" href="javascript:void(0)" onclick="goToReportsPage(${currentReportsPage + 1})">
            <i class="fa-solid fa-chevron-right" style="font-size:.65rem;"></i>
        </a></li>`;

    html += '</ul>';
    container.innerHTML = html;
}

function goToReportsPage(page) {
    const totalPages = Math.ceil(filteredReportsRecords.length / REPORTS_ROWS_PER_PAGE);
    if (page < 1 || page > totalPages) return;
    currentReportsPage = page;
    renderReportsPage();
}

async function handleExportReports() {
    if (!await showConfirm('Export historical reports data as CSV?', 'Export Data')) return;

    function decodeHtmlEntities(str) {
        if (!str) return '';
        const txt = document.createElement("textarea");
        txt.innerHTML = str;
        return txt.value;
    }

    let csv = 'BizTrack Historical Reports Export\r\n';
    csv += 'Date,Type,Description,Category,Amount\r\n';

    allReportsRecords.forEach(record => {
        const amt = record.amount;
        const desc = decodeHtmlEntities(record.description || '').replace(/"/g, '""');
        const cat = decodeHtmlEntities(record.category || '').replace(/"/g, '""');
        csv += `"${record.date}","${record.type}","${desc}","${cat}","${amt}"\r\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `BizTrack_Historical_Reports.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
}

// ── Print and Month Filter helpers ───────────────────────────────────────────
function populateMonthFilter(records) {
    const select = document.getElementById('reportMonthSelect');
    if (!select) return;

    select.innerHTML = '';
    const months = [...new Set(records.map(r => r.month))].filter(Boolean).sort().reverse();

    if (months.length === 0) {
        const opt = document.createElement('option');
        opt.text = "No records found";
        select.add(opt);
        return;
    }

    // Prepend "All Months (Entire History)" option at the top
    const allOpt = document.createElement('option');
    allOpt.value = 'all';
    allOpt.text = 'All Months (Entire History)';
    allOpt.selected = true;
    select.add(allOpt);

    months.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m;
        const [year, month] = m.split('-');
        const date = new Date(year, parseInt(month) - 1, 1);
        opt.text = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        select.add(opt);
    });
}

function handleGeneratePDF() {
    const select = document.getElementById('reportMonthSelect');
    if (!select) return;

    const selectedMonth = select.value;
    if (!selectedMonth) return;

    const selectedText = select.options[select.selectedIndex].text;

    window.isGeneratingPDF = true;
    window.pdfSelectedMonth = selectedMonth;
    window.pdfSelectedText = selectedText;

    window.print();

    window.isGeneratingPDF = false;
    window.pdfSelectedMonth = null;
    window.pdfSelectedText = null;
}

function handleBeforePrint() {
    // Set dynamic report generation timestamp
    const metaEl = document.getElementById('printReportMeta');
    if (metaEl) {
        const nowStr = new Date().toLocaleDateString('en-US', { 
            year: 'numeric', month: 'long', day: 'numeric', 
            hour: '2-digit', minute: '2-digit' 
        });
        metaEl.innerHTML = `<strong>Generated on:</strong> ${nowStr}`;
    }

    // Set dynamic printing scope text
    const scopeEl = document.getElementById('printReportScope');
    if (scopeEl) {
        scopeEl.textContent = '';
        const scopeLabel = document.createElement('strong');
        scopeLabel.textContent = 'Scope:';
        scopeEl.appendChild(scopeLabel);

        if (window.isGeneratingPDF && window.pdfSelectedText) {
            scopeEl.appendChild(document.createTextNode(` Monthly Report for ${window.pdfSelectedText}`));
        } else {
            const searchInput = document.getElementById('searchReports');
            const query = searchInput ? searchInput.value.trim() : '';
            if (query) {
                scopeEl.appendChild(document.createTextNode(` Filtered Records (Search: "${query}")`));
            } else {
                scopeEl.appendChild(document.createTextNode(' All Historical Records'));
            }
        }
    }

    // Render full list of rows to avoid pagination printing issues
    renderAllRecordsForPrint();
}

function handleAfterPrint() {
    renderReportsPage();
}

function renderAllRecordsForPrint() {
    const tbody = document.getElementById('reportsTableBody');
    if (!tbody) return;

    tbody.innerHTML = '';
    
    let records = [];
    if (window.isGeneratingPDF && window.pdfSelectedMonth) {
        if (window.pdfSelectedMonth === 'all') {
            records = allReportsRecords;
        } else {
            records = allReportsRecords.filter(r => r.month === window.pdfSelectedMonth);
        }
    } else {
        records = filteredReportsRecords;
    }

    if (!records || records.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-secondary">No records found.</td></tr>';
        return;
    }

    records.forEach(record => {
        const formattedAmount = new Intl.NumberFormat('en-PH', { 
            style: 'currency', currency: 'PHP', minimumFractionDigits: 0
        }).format(record.amount);

        const typeBadge = record.type === 'Sale' 
            ? `<span class="badge rounded-pill bg-success bg-opacity-25 text-success border border-success border-opacity-50 px-3 py-1 d-print-none">Sale</span><span class="d-none d-print-inline text-success fw-bold">Sale</span>`
            : `<span class="badge rounded-pill bg-warning bg-opacity-25 text-warning border border-warning border-opacity-50 px-3 py-1 d-print-none">Expense</span><span class="d-none d-print-inline text-warning fw-bold">Expense</span>`;

        const amountColor = record.type === 'Sale' ? 'var(--amount-color)' : '#ff6d00';

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="ps-4 text-secondary">${record.date}</td>
            <td>${typeBadge}</td>
            <td class="fw-bold">${record.description}</td>
            <td class="text-secondary">${record.category}</td>
            <td class="fw-medium" style="color: ${amountColor}">${formattedAmount}</td>
        `;
        tbody.appendChild(tr);
    });
}
