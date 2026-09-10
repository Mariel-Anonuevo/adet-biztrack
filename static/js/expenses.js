// ── Pagination and Filter state ────────────────────────────────────────────────
const EXP_ROWS_PER_PAGE  = 10;
let currentExpPage       = 1;
let allExpRecords        = [];
let filteredExpRecords   = [];
let expensePickerInstance = null;
let expenseMinDate = "2020-01-01";

document.addEventListener('DOMContentLoaded', () => {
    // Set default date to today
    const dateInput = document.getElementById('expenseDate');
    if (dateInput) {
        const today = new Date().toISOString().split('T')[0];
        expensePickerInstance = flatpickr(dateInput, {
            defaultDate: today < expenseMinDate ? expenseMinDate : today,
            minDate: expenseMinDate,
            maxDate: today,
            dateFormat: "Y-m-d",
            disableMobile: true,
            onChange: function(selectedDates, dateStr, instance) {
                const minDate = expenseMinDate;
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
    const expenseCategory = document.getElementById('expenseCategory');
    const expenseCustomCategoryGroup = document.getElementById('expenseCustomCategoryGroup');
    const expenseCustomCategory = document.getElementById('expenseCustomCategory');
    if (expenseCategory && expenseCustomCategoryGroup && expenseCustomCategory) {
        expenseCategory.addEventListener('change', () => {
            if (expenseCategory.value === 'Others') {
                expenseCustomCategoryGroup.style.display = 'flex';
                expenseCustomCategory.setAttribute('required', 'true');
            } else {
                expenseCustomCategoryGroup.style.display = 'none';
                expenseCustomCategory.removeAttribute('required');
                expenseCustomCategory.value = '';
            }
        });
    }

    // Cancel Button Action
    const cancelBtn = document.getElementById('btnCancelExpense');
    if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
            document.getElementById('addExpenseForm').reset();
            if (expenseCustomCategoryGroup) expenseCustomCategoryGroup.style.display = 'none';
            if (expenseCustomCategory) {
                expenseCustomCategory.removeAttribute('required');
                expenseCustomCategory.value = '';
            }
            if (dateInput) {
                dateInput.value = new Date().toISOString().split('T')[0];
            }
            const recordsTab = document.getElementById('pills-records-tab');
            if (recordsTab) recordsTab.click();
        });
    }

    // Form submission
    const expenseForm = document.getElementById('addExpenseForm');
    if (expenseForm) {
        expenseForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const dateVal = document.getElementById('expenseDate').value;
            const amountVal = document.getElementById('expenseAmount').value;
            const descriptionVal = document.getElementById('expenseDescription').value.trim();
            let categoryVal = document.getElementById('expenseCategory').value;
            const vendorVal = document.getElementById('expenseVendor').value.trim();
            const receiptInput = document.getElementById('expenseReceipt');

            // Validation
            if (!dateVal) {
                showAlert("Date is empty. Please select a valid date.", "Form Validation", "error");
                return;
            }
            const todayStr = new Date().toISOString().split('T')[0];
            if (dateVal > todayStr) {
                showAlert("Transaction date cannot be in the future.", "Form Validation", "error");
                return;
            }
            if (!amountVal || isNaN(amountVal) || parseFloat(amountVal) <= 0) {
                showAlert("Expense Amount must be a valid positive number.", "Form Validation", "error");
                return;
            }
            if (!descriptionVal || !categoryVal) {
                showAlert("Please fill out all required fields (Description and Category).", "Form Validation", "error");
                return;
            }
            if (categoryVal === 'Others') {
                const customCat = expenseCustomCategory ? expenseCustomCategory.value.trim() : '';
                if (!customCat) {
                    showAlert("Please specify your custom category.", "Form Validation", "error");
                    return;
                }
                categoryVal = customCat;
            }

            const saveBtn = document.getElementById('btnSaveExpense');
            const originalBtnText = saveBtn.innerHTML;
            saveBtn.disabled = true;
            saveBtn.innerHTML = `<span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span> Saving...`;

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
                date: dateVal,
                amount: parseFloat(amountVal),
                description: descriptionVal,
                category: categoryVal,
                vendor: vendorVal || null,   // send null instead of empty string or "None"
                receipt: receiptName
            };

            try {
                const response = await authFetch('/expenses/api/records', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (!response.ok) {
                    const errData = await response.json().catch(() => ({}));
                    throw new Error(errData.detail || 'Failed to save expense record');
                }

                // Success
                showAlert("Expense record saved successfully!", "Success");
                expenseForm.reset();
                if (expenseCustomCategoryGroup) expenseCustomCategoryGroup.style.display = 'none';
                if (expenseCustomCategory) {
                    expenseCustomCategory.removeAttribute('required');
                    expenseCustomCategory.value = '';
                }
                expenseForm.classList.remove('was-validated');
                if (dateInput) {
                    dateInput.value = new Date().toISOString().split('T')[0];
                }

                // Switch to records tab and reload data
                const recordsTab = document.getElementById('pills-records-tab');
                if (recordsTab) recordsTab.click();
                await fetchExpensesData();

            } catch (err) {
                console.error("Error saving expense record:", err);
                showAlert(err.message, "Error", "error");
            } finally {
                saveBtn.disabled = false;
                saveBtn.innerHTML = originalBtnText;
            }
        });
    }

    // Bind Filter Selects
    const filterMonth = document.getElementById('filterMonth');
    const filterCategory = document.getElementById('filterCategory');
    if (filterMonth) filterMonth.addEventListener('change', applyFilters);
    if (filterCategory) filterCategory.addEventListener('change', applyFilters);

    // ── Export CSV ───────────────────────────────────────────────────────────
    const exportBtn = document.getElementById('btnExportExpenses');
    if (exportBtn) {
        exportBtn.addEventListener('click', () => {
            if (allExpRecords.length === 0) {
                showAlert('No expense records to export.', 'Export Error', 'error');
                return;
            }
            function decodeHtmlEntities(str) {
                if (!str) return '';
                const txt = document.createElement("textarea");
                txt.innerHTML = str;
                return txt.value;
            }
            let csv = "Date,Description,Category,Vendor,Amount,Receipt\n";
            allExpRecords.forEach(r => {
                const desc = decodeHtmlEntities(r.description || '').replace(/"/g, '""');
                const cat = decodeHtmlEntities(r.category || '').replace(/"/g, '""');
                const vend = decodeHtmlEntities(r.vendor || '').replace(/"/g, '""');
                const rec = decodeHtmlEntities(r.receipt || '').replace(/"/g, '""');
                csv += `${r.date},"${desc}","${cat}","${vend}",${r.amount},"${rec}"\n`;
            });
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.setAttribute("href", url);
            link.setAttribute("download", "biztrack_expenses_export.csv");
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        });
    }

    // ── Import Excel/CSV ──────────────────────────────────────────────────────
    const importInput = document.getElementById('btnImportExpenses');
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
                const tbody = document.getElementById('expensesTableBody');
                if (tbody) {
                    tbody.innerHTML = `
                        <tr>
                            <td colspan="7" class="text-center py-4">
                                <div class="spinner-border text-success me-2" role="status"></div>
                                Importing transactions...
                            </td>
                        </tr>
                    `;
                }

                const response = await authFetch('/expenses/api/upload', {
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
                await fetchExpensesData();

            } catch (err) {
                console.error('Import error:', err);
                showAlert(err.message, 'Import Error', 'error');
                await fetchExpensesData();
            } finally {
                importInput.value = '';
            }
        });
    }

    fetchExpensesData();
});

async function fetchExpensesData() {
    try {
        const response = await authFetch('/expenses/api/records');
        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.detail || 'Failed to load expense records');
        }
        const data = await response.json();

        renderTable(data);
    } catch (error) {
        console.error("Error fetching expenses data:", error);
        const tbody = document.getElementById('expensesTableBody');
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="7" class="text-center text-danger py-4">
                <i class="fa-solid fa-circle-exclamation me-2"></i>Failed to load records. ${error.message}
            </td></tr>`;
        }
    }
}

async function deleteExpenseRecord(recordId) {
    if (!await showConfirm("Are you sure you want to delete this expense record? This cannot be undone.", "Confirm Delete")) return;

    try {
        const response = await authFetch(`/expenses/api/records/${recordId}`, {
            method: 'DELETE'
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.detail || 'Failed to delete record');
        }

        await fetchExpensesData(); // Refresh table
        showAlert("Expense record deleted successfully.", "Success");
    } catch (err) {
        console.error("Error deleting expense record:", err);
        showAlert(err.message, "Error", "error");
    }
}

function renderTable(records) {
    allExpRecords  = records || [];
    applyFilters();
}

function applyFilters() {
    const monthVal = document.getElementById('filterMonth')?.value;
    const catVal = document.getElementById('filterCategory')?.value;

    filteredExpRecords = allExpRecords.filter(record => {
        // record.date is YYYY-MM-DD, extract MM
        const recordMonth = record.date ? record.date.split('-')[1] : '';
        const matchMonth = !monthVal || recordMonth === monthVal;
        const matchCat = !catVal || record.category === catVal;
        return matchMonth && matchCat;
    });

    currentExpPage = 1;
    renderExpPage();
}

function renderExpPage() {
    const tbody       = document.getElementById('expensesTableBody');
    const recordCount = document.getElementById('recordCount');
    const records     = filteredExpRecords;

    tbody.innerHTML = '';

    if (!records || records.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center py-4 text-secondary">No expense records found.</td></tr>';
        if (recordCount) recordCount.innerText = '0 records total';
        renderExpPagination(0);
        return;
    }

    const totalPages = Math.ceil(records.length / EXP_ROWS_PER_PAGE);
    currentExpPage   = Math.max(1, Math.min(currentExpPage, totalPages));
    const start      = (currentExpPage - 1) * EXP_ROWS_PER_PAGE;
    const end        = Math.min(start + EXP_ROWS_PER_PAGE, records.length);
    const pageRecs   = records.slice(start, end);

    pageRecs.forEach(record => {
        const formattedAmount = new Intl.NumberFormat('en-PH', {
            style: 'currency', currency: 'PHP', minimumFractionDigits: 0
        }).format(record.amount);

        const catClass = (record.category || '').toLowerCase().replace(/\s+/g, '-');

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

        const vendorDisplay = record.vendor && record.vendor !== 'None'
            ? record.vendor
            : '<span class="text-secondary">—</span>';

        const recordId = record.id;
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="ps-4 text-secondary">${record.date}</td>
            <td class="fw-bold">${record.description}</td>
            <td><span class="badge-category badge-expense-${catClass}">${record.category}</span></td>
            <td class="text-secondary">${vendorDisplay}</td>
            <td class="text-danger fw-medium">${formattedAmount}</td>
            <td>${receiptHtml}</td>
            <td class="text-center pe-4">
                <button class="btn-action" title="Delete record"
                    ${recordId ? `onclick="deleteExpenseRecord(${recordId})"` : 'disabled title="Cannot delete demo data"'}
                ><i class="fa-regular fa-trash-can"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    if (recordCount) recordCount.innerText = `Showing ${start + 1}–${end} of ${records.length} records`;
    renderExpPagination(totalPages);
}

function renderExpPagination(totalPages) {
    const container = document.getElementById('expensesPagination');
    if (!container) return;

    if (totalPages <= 1) { container.innerHTML = ''; return; }

    const maxVisible = 5;
    let startPage = Math.max(1, currentExpPage - Math.floor(maxVisible / 2));
    let endPage   = Math.min(totalPages, startPage + maxVisible - 1);
    if (endPage - startPage < maxVisible - 1) startPage = Math.max(1, endPage - maxVisible + 1);

    let html = '<ul class="pagination pagination-sm mb-0 flex-wrap">';

    html += `<li class="page-item ${currentExpPage === 1 ? 'disabled' : ''}">
        <a class="page-link" href="javascript:void(0)" onclick="goToExpPage(${currentExpPage - 1})">
            <i class="fa-solid fa-chevron-left" style="font-size:.65rem;"></i>
        </a></li>`;

    if (startPage > 1) {
        html += `<li class="page-item"><a class="page-link" href="javascript:void(0)" onclick="goToExpPage(1)">1</a></li>`;
        if (startPage > 2) html += `<li class="page-item disabled"><span class="page-link">…</span></li>`;
    }

    for (let p = startPage; p <= endPage; p++) {
        html += `<li class="page-item ${p === currentExpPage ? 'active' : ''}">
            <a class="page-link" href="javascript:void(0)" onclick="goToExpPage(${p})">${p}</a></li>`;
    }

    if (endPage < totalPages) {
        if (endPage < totalPages - 1) html += `<li class="page-item disabled"><span class="page-link">…</span></li>`;
        html += `<li class="page-item"><a class="page-link" href="javascript:void(0)" onclick="goToExpPage(${totalPages})">${totalPages}</a></li>`;
    }

    html += `<li class="page-item ${currentExpPage === totalPages ? 'disabled' : ''}">
        <a class="page-link" href="javascript:void(0)" onclick="goToExpPage(${currentExpPage + 1})">
            <i class="fa-solid fa-chevron-right" style="font-size:.65rem;"></i>
        </a></li>`;

    html += '</ul>';
    container.innerHTML = html;
}

function goToExpPage(page) {
    const totalPages = Math.ceil(filteredExpRecords.length / EXP_ROWS_PER_PAGE);
    if (page < 1 || page > totalPages) return;
    currentExpPage = page;
    renderExpPage();
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
