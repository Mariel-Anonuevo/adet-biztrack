document.addEventListener('DOMContentLoaded', () => {
    // Set default date to today
    const dateInput = document.getElementById('expenseDate');
    if (dateInput) {
        const today = new Date().toISOString().split('T')[0];
        dateInput.value = today;
    }

    // Cancel Button Action
    const cancelBtn = document.getElementById('btnCancelExpense');
    if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
            document.getElementById('addExpenseForm').reset();
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
            const categoryVal = document.getElementById('expenseCategory').value;
            const vendorVal = document.getElementById('expenseVendor').value.trim();
            const receiptInput = document.getElementById('expenseReceipt');

            // 1. Month/Year is empty check
            if (!dateVal) {
                alert("Error: Month/Year is empty. Please select a valid date.");
                return;
            }

            // 2. Non-numeric or empty amount check
            if (!amountVal || isNaN(amountVal) || parseFloat(amountVal) <= 0) {
                alert("Error: Expense Amount must be a valid positive number.");
                return;
            }

            // 3. Required fields validation
            if (!descriptionVal || !categoryVal) {
                alert("Error: Please fill out all required fields.");
                return;
            }

            const saveBtn = document.getElementById('btnSaveExpense');
            const originalBtnText = saveBtn.innerHTML;
            saveBtn.disabled = true;
            saveBtn.innerHTML = `<span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span> Saving...`;

            // Capture optional receipt filename
            let receiptName = null;
            if (receiptInput && receiptInput.files && receiptInput.files.length > 0) {
                receiptName = receiptInput.files[0].name;
            }

            const payload = {
                date: dateVal,
                amount: parseFloat(amountVal),
                description: descriptionVal,
                category: categoryVal,
                vendor: vendorVal || "None", // default if empty
                receipt: receiptName
            };

            try {
                const response = await authFetch('/expenses/api/records', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (!response.ok) {
                    const errData = await response.json();
                    throw new Error(errData.detail || 'Failed to save expense record');
                }

                // Success
                alert("Expense data saved successfully");
                expenseForm.reset();
                expenseForm.classList.remove('was-validated');
                if (dateInput) {
                    dateInput.value = new Date().toISOString().split('T')[0];
                }
                
                // Show records tab
                const recordsTab = document.getElementById('pills-records-tab');
                if (recordsTab) recordsTab.click();

                // Reload data
                await fetchExpensesData();

            } catch (err) {
                console.error("Error saving expense record:", err);
                alert(`Error: ${err.message}`);
            } finally {
                saveBtn.disabled = false;
                saveBtn.innerHTML = originalBtnText;
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
    }
}

function renderTable(records) {
    const tbody = document.getElementById('expensesTableBody');
    const recordCount = document.getElementById('recordCount');
    
    tbody.innerHTML = '';
    
    if(!records || records.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center">No records found</td></tr>';
        recordCount.innerText = "0 records total";
        return;
    }

    records.forEach(record => {
        const formattedAmount = new Intl.NumberFormat('en-PH', { 
            style: 'currency', currency: 'PHP', minimumFractionDigits: 0
        }).format(record.amount);

        const catClass = record.category.toLowerCase();

        // Format Receipt
        let receiptHtml = '<span class="text-secondary">—</span>';
        if(record.receipt) {
            receiptHtml = `
                <div class="d-flex align-items-center gap-2">
                    <i class="fa-regular fa-file receipt-icon"></i>
                    <span class="text-secondary" style="font-size: 0.85rem">${record.receipt}</span>
                </div>
            `;
        }

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="ps-4 text-secondary">${record.date}</td>
            <td class="fw-bold">${record.description}</td>
            <td><span class="badge-category badge-expense-${catClass}">${record.category}</span></td>
            <td class="text-secondary">${record.vendor}</td>
            <td class="text-danger fw-medium">${formattedAmount}</td>
            <td>${receiptHtml}</td>
            <td class="text-center pe-4">
                <button class="btn-action"><i class="fa-regular fa-trash-can"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    recordCount.innerText = `${records.length} records total`;
}
