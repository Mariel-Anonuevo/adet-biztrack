/**
 * sales.js — BizTrack Sales Page
 * Handles: AI chat, form submit, records table, chart, delete, filtering, and pagination
 */


// ── Pagination and Filter state ─────────────────────────────────────────────
const SALES_ROWS_PER_PAGE = 10;
let currentSalesPage = 1;
let allSalesRecords   = [];
let filteredSalesRecords = [];
let salesPickerInstance = null;
let salesMinDate = "2020-01-01";

document.addEventListener('DOMContentLoaded', () => {



    // ── Date default ─────────────────────────────────────────────────────────
    const dateInput = document.getElementById('salesDate');
    if (dateInput) {
        const today = new Date().toISOString().split('T')[0];
        salesPickerInstance = flatpickr(dateInput, {
            defaultDate: today < salesMinDate ? salesMinDate : today,
            minDate: salesMinDate,
            maxDate: today,
            dateFormat: "Y-m-d",
            disableMobile: true,
            onChange: function(selectedDates, dateStr, instance) {
                const minDate = salesMinDate;
                if (dateStr < minDate) {
                    showAlert(`Transaction date cannot be before January 1, 2020.`, 'Form Validation', 'error');
                    instance.setDate(minDate);
                } else if (dateStr > today) {
                    showAlert('Transaction date cannot be in the future.', 'Form Validation', 'error');
                    instance.setDate(today);
                }
            }
        });
    }

    // ── Custom Category Toggle ───────────────────────────────────────────────
    const salesCategory = document.getElementById('salesCategory');
    const salesCustomCategoryGroup = document.getElementById('salesCustomCategoryGroup');
    const salesCustomCategory = document.getElementById('salesCustomCategory');
    if (salesCategory && salesCustomCategoryGroup && salesCustomCategory) {
        salesCategory.addEventListener('change', () => {
            if (salesCategory.value === 'Others') {
                salesCustomCategoryGroup.style.display = 'flex';
                salesCustomCategory.setAttribute('required', 'true');
            } else {
                salesCustomCategoryGroup.style.display = 'none';
                salesCustomCategory.removeAttribute('required');
                salesCustomCategory.value = '';
            }
        });
    }

    // ── Cancel button ────────────────────────────────────────────────────────
    const cancelBtn = document.getElementById('btnCancelSales');
    if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
            document.getElementById('addSalesForm').reset();
            if (salesCustomCategoryGroup) salesCustomCategoryGroup.style.display = 'none';
            if (salesCustomCategory) {
                salesCustomCategory.removeAttribute('required');
                salesCustomCategory.value = '';
            }
            if (dateInput) dateInput.value = new Date().toISOString().split('T')[0];
            const recordsTab = document.getElementById('pills-records-tab');
            if (recordsTab) recordsTab.click();
        });
    }

    // ── Form submit ──────────────────────────────────────────────────────────
    const salesForm = document.getElementById('addSalesForm');
    if (salesForm) {
        salesForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const dateVal        = document.getElementById('salesDate').value;
            const amountVal      = document.getElementById('salesAmount').value;
            const descriptionVal = document.getElementById('salesDescription').value.trim();
            let categoryVal      = document.getElementById('salesCategory').value;
            const receiptInput   = document.getElementById('salesReceipt');

            if (!dateVal) { showAlert('Date is empty.', 'Form Validation', 'error'); return; }
            const todayStr = new Date().toISOString().split('T')[0];
            if (dateVal > todayStr) {
                showAlert('Transaction date cannot be in the future.', 'Form Validation', 'error');
                return;
            }
            if (!amountVal || isNaN(amountVal) || parseFloat(amountVal) <= 0) {
                showAlert('Sales Amount must be a valid positive number.', 'Form Validation', 'error'); return;
            }
            if (!descriptionVal || !categoryVal) {
                showAlert('Please fill out all required fields (Description and Category).', 'Form Validation', 'error'); return;
            }
            if (categoryVal === 'Others') {
                const customCat = salesCustomCategory ? salesCustomCategory.value.trim() : '';
                if (!customCat) {
                    showAlert('Please specify your custom category.', 'Form Validation', 'error');
                    return;
                }
                categoryVal = customCat;
            }

            const saveBtn = document.getElementById('btnSaveSales');
            const originalBtnText = saveBtn.innerHTML;
            saveBtn.disabled = true;
            saveBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span> Saving...';

            let receiptName = null;
            if (receiptInput && receiptInput.files && receiptInput.files.length > 0) {
                const receiptFile = receiptInput.files[0];
                const uploadFormData = new FormData();
                uploadFormData.append('file', receiptFile);
                
                try {
                    const uploadResponse = await authFetch('/api/upload-receipt', {
                        method: 'POST',
                        body: uploadFormData
                    });
                    if (!uploadResponse.ok) {
                        throw new Error('Failed to upload receipt file.');
                    }
                    const uploadResult = await uploadResponse.json();
                    receiptName = uploadResult.filename;
                } catch (uploadErr) {
                    console.error('Receipt upload error:', uploadErr);
                    showAlert('Failed to upload receipt file: ' + uploadErr.message, 'Upload Error', 'error');
                    saveBtn.disabled = false;
                    saveBtn.innerHTML = originalBtnText;
                    return;
                }
            }

            const payload = {
                date:        dateVal,
                amount:      parseFloat(amountVal),
                description: descriptionVal,
                category:    categoryVal,
                receipt:     receiptName
            };

            try {
                const response = await authFetch('/sales/api/records', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (!response.ok) {
                    const errData = await response.json().catch(() => ({}));
                    throw new Error(errData.detail || 'Failed to save sales record');
                }

                showAlert('Sales data saved successfully', 'Success');
                salesForm.reset();
                if (salesCustomCategoryGroup) salesCustomCategoryGroup.style.display = 'none';
                if (salesCustomCategory) {
                    salesCustomCategory.removeAttribute('required');
                    salesCustomCategory.value = '';
                }
                salesForm.classList.remove('was-validated');
                if (dateInput) dateInput.value = new Date().toISOString().split('T')[0];

                const recordsTab = document.getElementById('pills-records-tab');
                if (recordsTab) recordsTab.click();

                await fetchSalesData();

            } catch (err) {
                console.error('Error saving sales record:', err);
                showAlert(err.message, 'Error', 'error');
            } finally {
                saveBtn.disabled = false;
                saveBtn.innerHTML = originalBtnText;
            }
        });
    }

    // ── Bind Filter Selects ──────────────────────────────────────────────────
    const filterMonth = document.getElementById('filterMonth');
    const filterCategory = document.getElementById('filterCategory');
    if (filterMonth) filterMonth.addEventListener('change', applyFilters);
    if (filterCategory) filterCategory.addEventListener('change', applyFilters);

    // ── Export CSV ───────────────────────────────────────────────────────────
    const exportBtn = document.getElementById('btnExportSales');
    if (exportBtn) {
        exportBtn.addEventListener('click', () => {
            if (allSalesRecords.length === 0) {
                showAlert('No sales records to export.', 'Export Error', 'error');
                return;
            }
            function decodeHtmlEntities(str) {
                if (!str) return '';
                const txt = document.createElement("textarea");
                txt.innerHTML = str;
                return txt.value;
            }
            let csv = "Date,Description,Category,Amount,Receipt\n";
            allSalesRecords.forEach(r => {
                const desc = decodeHtmlEntities(r.description || '').replace(/"/g, '""');
                const cat = decodeHtmlEntities(r.category || '').replace(/"/g, '""');
                const rec = decodeHtmlEntities(r.receipt || '').replace(/"/g, '""');
                csv += `${r.date},"${desc}","${cat}",${r.amount},"${rec}"\n`;
            });
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.setAttribute("href", url);
            link.setAttribute("download", "biztrack_sales_export.csv");
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        });
    }

    // ── Import Excel/CSV ──────────────────────────────────────────────────────
    const importInput = document.getElementById('btnImportSales');
    if (importInput) {
        importInput.addEventListener('change', async () => {
            const file = importInput.files[0];
            if (!file) return;

            const ext = file.name.split('.').pop().toLowerCase();
            if (ext !== 'csv' && ext !== 'xlsx') {
                showAlert('Please select a valid CSV or Excel (.xlsx) file.', 'Invalid File', 'error');
                importInput.value = '';
                return;
            }

            const confirmImport = await showConfirm(`Are you sure you want to import transactions from "${file.name}"?`, 'Confirm Import');
            if (!confirmImport) {
                importInput.value = '';
                return;
            }

            const formData = new FormData();
            formData.append('file', file);

            try {
                const tbody = document.getElementById('salesTableBody');
                if (tbody) {
                    tbody.innerHTML = `
                        <tr>
                            <td colspan="6" class="text-center py-4">
                                <div class="spinner-border text-success me-2" role="status"></div>
                                Importing transactions...
                            </td>
                        </tr>
                    `;
                }

                const response = await authFetch('/sales/api/upload', {
                    method: 'POST',
                    body: formData
                });

                if (!response.ok) {
                    const errData = await response.json().catch(() => ({}));
                    throw new Error(errData.detail || 'Failed to import transactions');
                }

                const result = await response.json();
                let msg = result.message || 'Import successful!';
                if (result.warnings && result.warnings.length > 0) {
                    msg += '\n\n⚠️ Warnings during parsing:\n' + result.warnings.slice(0, 8).map(w => '• ' + w).join('\n');
                    if (result.warnings.length > 8) {
                        msg += `\n... and ${result.warnings.length - 8} more warnings.`;
                    }
                }
                await showAlert(msg, 'Import Completed');
                await fetchSalesData();

            } catch (err) {
                console.error('Import error:', err);
                showAlert(err.message, 'Import Error', 'error');
                await fetchSalesData();
            } finally {
                importInput.value = '';
            }
        });
    }

    // Load records on page open
    fetchSalesData();
});

// ─────────────────────────────────────────────────────────────────────────────
// Data fetching
// ─────────────────────────────────────────────────────────────────────────────

function formatApiError(detail) {
    if (!detail) return 'Failed to load sales records.';
    if (typeof detail === 'string') return detail;
    if (detail.error_type === 'MISSING_TABLES') {
        return 'Database tables are not set up in Supabase yet. Run db/create_tables.sql in your Supabase SQL Editor.';
    }
    if (detail.message) return detail.message;
    return 'Failed to load sales records.';
}

async function fetchSalesData() {
    const tbody       = document.getElementById('salesTableBody');
    const recordCount = document.getElementById('recordCount');

    try {
        const response = await authFetch('/sales/api/records');
        const payload  = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(formatApiError(payload.detail));
        }

        const data = Array.isArray(payload) ? payload : [];
        renderTable(data);

    } catch (error) {
        console.error('Error fetching sales data:', error);
        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" class="text-center text-danger py-4">
                        <i class="fa-solid fa-circle-exclamation me-2"></i>${error.message || 'Failed to load records.'}
                    </td>
                </tr>
            `;
        }
        if (recordCount) recordCount.innerText = 'Could not load records';
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Table rendering and Filtering
// ─────────────────────────────────────────────────────────────────────────────

function renderTable(records) {
    allSalesRecords = records || [];
    applyFilters();
}

function applyFilters() {
    const monthVal = document.getElementById('filterMonth')?.value;
    const catVal = document.getElementById('filterCategory')?.value;

    filteredSalesRecords = allSalesRecords.filter(record => {
        // record.date is YYYY-MM-DD
        const recordMonth = record.date ? record.date.split('-')[1] : '';
        const matchMonth = !monthVal || recordMonth === monthVal;
        const matchCat = !catVal || record.category === catVal;
        return matchMonth && matchCat;
    });

    currentSalesPage = 1;
    renderSalesPage();


}

function renderSalesPage() {
    const tbody       = document.getElementById('salesTableBody');
    const recordCount = document.getElementById('recordCount');
    const records     = filteredSalesRecords;

    tbody.innerHTML = '';

    if (!records || records.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center py-4 text-secondary">No records found.</td></tr>';
        if (recordCount) recordCount.innerText = '0 records total';
        renderSalesPagination(0);
        return;
    }

    const totalPages = Math.ceil(records.length / SALES_ROWS_PER_PAGE);
    currentSalesPage = Math.max(1, Math.min(currentSalesPage, totalPages));
    const start = (currentSalesPage - 1) * SALES_ROWS_PER_PAGE;
    const end   = Math.min(start + SALES_ROWS_PER_PAGE, records.length);
    const pageRecords = records.slice(start, end);

    pageRecords.forEach(record => {
        const formattedAmount = new Intl.NumberFormat('en-PH', {
            style: 'currency', currency: 'PHP', minimumFractionDigits: 0
        }).format(record.amount);

        const catClass = (record.category || '').toLowerCase();

        let receiptHtml = '<span class="text-secondary">—</span>';
        if (record.receipt) {
            const ext = record.receipt.split('.').pop().toLowerCase();
            let iconClass = 'fa-file';
            if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) {
                iconClass = 'fa-file-image';
            } else if (ext === 'pdf') {
                iconClass = 'fa-file-pdf';
            }
            receiptHtml = `
                <a href="javascript:void(0)" onclick="viewReceiptFile('${record.receipt}')" class="d-inline-flex align-items-center gap-2 text-decoration-none text-success receipt-link" style="transition: opacity 0.15s;">
                    <i class="fa-regular ${iconClass} receipt-icon" style="font-size: 1.05rem;"></i>
                    <span style="font-size: 0.85rem; font-weight: 500; text-decoration: underline;">${record.receipt}</span>
                </a>
            `;
        }

        const recordId = record.id;
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="ps-4 text-secondary">${record.date}</td>
            <td class="fw-bold">${record.description}</td>
            <td><span class="badge-category badge-${catClass}">${record.category}</span></td>
            <td class="amount-text">${formattedAmount}</td>
            <td>${receiptHtml}</td>
            <td class="text-center pe-4">
                <button class="btn-action" title="Delete record"
                    ${recordId ? `onclick="deleteSalesRecord(${recordId})"` : 'disabled title="Cannot delete demo data"'}
                ><i class="fa-regular fa-trash-can"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    if (recordCount) recordCount.innerText = `Showing ${start + 1}–${end} of ${records.length} records`;
    renderSalesPagination(totalPages);
}

function renderSalesPagination(totalPages) {
    const container = document.getElementById('salesPagination');
    if (!container) return;

    if (totalPages <= 1) { container.innerHTML = ''; return; }

    const maxVisible = 5;
    let startPage = Math.max(1, currentSalesPage - Math.floor(maxVisible / 2));
    let endPage   = Math.min(totalPages, startPage + maxVisible - 1);
    if (endPage - startPage < maxVisible - 1) startPage = Math.max(1, endPage - maxVisible + 1);

    let html = '<ul class="pagination pagination-sm mb-0 flex-wrap">';

    // Prev
    html += `<li class="page-item ${currentSalesPage === 1 ? 'disabled' : ''}">
        <a class="page-link" href="javascript:void(0)" onclick="goToSalesPage(${currentSalesPage - 1})">
            <i class="fa-solid fa-chevron-left" style="font-size:.65rem;"></i>
        </a></li>`;

    if (startPage > 1) {
        html += `<li class="page-item"><a class="page-link" href="javascript:void(0)" onclick="goToSalesPage(1)">1</a></li>`;
        if (startPage > 2) html += `<li class="page-item disabled"><span class="page-link">…</span></li>`;
    }

    for (let p = startPage; p <= endPage; p++) {
        html += `<li class="page-item ${p === currentSalesPage ? 'active' : ''}">
            <a class="page-link" href="javascript:void(0)" onclick="goToSalesPage(${p})">${p}</a></li>`;
    }

    if (endPage < totalPages) {
        if (endPage < totalPages - 1) html += `<li class="page-item disabled"><span class="page-link">…</span></li>`;
        html += `<li class="page-item"><a class="page-link" href="javascript:void(0)" onclick="goToSalesPage(${totalPages})">${totalPages}</a></li>`;
    }

    // Next
    html += `<li class="page-item ${currentSalesPage === totalPages ? 'disabled' : ''}">
        <a class="page-link" href="javascript:void(0)" onclick="goToSalesPage(${currentSalesPage + 1})">
            <i class="fa-solid fa-chevron-right" style="font-size:.65rem;"></i>
        </a></li>`;

    html += '</ul>';
    container.innerHTML = html;
}

function goToSalesPage(page) {
    const totalPages = Math.ceil(filteredSalesRecords.length / SALES_ROWS_PER_PAGE);
    if (page < 1 || page > totalPages) return;
    currentSalesPage = page;
    renderSalesPage();
}

// ─────────────────────────────────────────────────────────────────────────────
// Delete record  (must be global — called from onclick in table HTML)
// ─────────────────────────────────────────────────────────────────────────────

async function deleteSalesRecord(recordId) {
    if (!await showConfirm('Are you sure you want to delete this sales record? This cannot be undone.', 'Confirm Delete')) return;

    try {
        const response = await authFetch(`/sales/api/records/${recordId}`, { method: 'DELETE' });
        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.detail || 'Failed to delete record');
        }
        await fetchSalesData();
        showAlert('Sales record deleted successfully.', 'Success');
    } catch (err) {
        console.error('Error deleting sales record:', err);
        showAlert(err.message, 'Error', 'error');
    }
}

// Global helper to view receipts with user-friendly existence checks
window.viewReceiptFile = async function(filename) {
    if (!filename) return;
    const fileUrl = `/static/uploads/receipts/${filename}`;
    try {
        const res = await fetch(fileUrl, { method: 'HEAD' });
        if (res.ok) {
            window.open(fileUrl, '_blank');
        } else {
            showAlert(
                `The receipt file "${filename}" is referenced in this record, but the actual file has not been uploaded to the server yet.`,
                'Receipt Not Found',
                'warning'
            );
        }
    } catch (err) {
        window.open(fileUrl, '_blank');
    }
};


