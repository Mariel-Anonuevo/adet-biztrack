document.addEventListener('DOMContentLoaded', () => {
    
    // UI Elements
    const aiBadge = document.getElementById('aiBadge');
    const aiChatBox = document.getElementById('aiChatBox');
    const aiSendBtn = document.getElementById('aiSendBtn');
    const aiInput = document.getElementById('aiInput');
    const chatMessages = document.querySelector('.chat-messages');

    // Toggle AI Chat Box
    aiBadge.addEventListener('click', () => {
        aiChatBox.classList.toggle('d-none');
    });

    // Handle AI Send
    aiSendBtn.addEventListener('click', async () => {
        const question = aiInput.value.trim();
        if(!question) return;

        // Add user msg to chat
        chatMessages.innerHTML += `<div class="p-2 mb-2 rounded w-75 ms-auto text-end" style="background:#ffffff; border:1px solid #22c55e; color:var(--text-primary);">${question}</div>`;
        aiInput.value = '';

        try {
            const response = await authFetch('/sales/api/ask-ai', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ question })
            });
            const data = await response.json();
            
            // Add AI response to chat
            chatMessages.innerHTML += `<div class="ai-msg p-2 mb-2 rounded w-75">${data.reply}</div>`;
            chatMessages.scrollTop = chatMessages.scrollHeight;
        } catch (err) {
            console.error("AI Error:", err);
        }
    });

    // Set default date to today
    const dateInput = document.getElementById('salesDate');
    if (dateInput) {
        const today = new Date().toISOString().split('T')[0];
        dateInput.value = today;
    }

    // Cancel Button Action
    const cancelBtn = document.getElementById('btnCancelSales');
    if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
            document.getElementById('addSalesForm').reset();
            if (dateInput) {
                dateInput.value = new Date().toISOString().split('T')[0];
            }
            const recordsTab = document.getElementById('pills-records-tab');
            if (recordsTab) recordsTab.click();
        });
    }

    // Form submission
    const salesForm = document.getElementById('addSalesForm');
    if (salesForm) {
        salesForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const dateVal = document.getElementById('salesDate').value;
            const amountVal = document.getElementById('salesAmount').value;
            const descriptionVal = document.getElementById('salesDescription').value.trim();
            const categoryVal = document.getElementById('salesCategory').value;
            const receiptInput = document.getElementById('salesReceipt');

            // 1. Month/Year is empty check
            if (!dateVal) {
                alert("Error: Month/Year is empty. Please select a valid date.");
                return;
            }

            // 2. Non-numeric or empty amount check
            if (!amountVal || isNaN(amountVal) || parseFloat(amountVal) <= 0) {
                alert("Error: Sales Amount must be a valid positive number.");
                return;
            }

            // 3. Required fields validation
            if (!descriptionVal || !categoryVal) {
                alert("Error: Please fill out all required fields.");
                return;
            }

            const saveBtn = document.getElementById('btnSaveSales');
            const originalBtnText = saveBtn.innerHTML;
            saveBtn.disabled = true;
            saveBtn.innerHTML = `<span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span> Saving...`;

            // Capture file name if provided
            let receiptName = null;
            if (receiptInput && receiptInput.files && receiptInput.files.length > 0) {
                receiptName = receiptInput.files[0].name;
            }

            const payload = {
                date: dateVal,
                amount: parseFloat(amountVal),
                description: descriptionVal,
                category: categoryVal,
                receipt: receiptName
            };

            try {
                const response = await authFetch('/sales/api/records', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (!response.ok) {
                    const errData = await response.json();
                    throw new Error(errData.detail || 'Failed to save sales record');
                }

                // Success
                alert("Sales data saved successfully");
                salesForm.reset();
                salesForm.classList.remove('was-validated');
                if (dateInput) {
                    dateInput.value = new Date().toISOString().split('T')[0];
                }
                
                // Show records tab
                const recordsTab = document.getElementById('pills-records-tab');
                if (recordsTab) recordsTab.click();

                // Reload data
                await fetchSalesData();

            } catch (err) {
                console.error("Error saving sales record:", err);
                alert(`Error: ${err.message}`);
            } finally {
                saveBtn.disabled = false;
                saveBtn.innerHTML = originalBtnText;
            }
        });
    }

    // Fetch Sales Records
    fetchSalesData();
});

function formatApiError(detail) {
    if (!detail) return 'Failed to load sales records.';
    if (typeof detail === 'string') return detail;
    if (detail.error_type === 'MISSING_TABLES') {
        return 'Database tables are not set up in Supabase yet. Run db/create_tables.sql in your Supabase SQL Editor, or demo data will load automatically after refresh.';
    }
    if (detail.message) return detail.message;
    return 'Failed to load sales records.';
}

async function fetchSalesData() {
    const tbody = document.getElementById('salesTableBody');
    const recordCount = document.getElementById('recordCount');
    try {
        const response = await authFetch('/sales/api/records');
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(formatApiError(payload.detail));
        }
        const data = Array.isArray(payload) ? payload : [];
        renderTable(data);
        if (data.length > 0) {
            renderChart(data);
        }
    } catch (error) {
        console.error("Error fetching sales data:", error);
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="text-center text-danger py-4">
                    ${error.message || 'Failed to load records.'}
                </td>
            </tr>
        `;
        if (recordCount) recordCount.innerText = 'Could not load records';
    }
}

function renderTable(records) {
    const tbody = document.getElementById('salesTableBody');
    const recordCount = document.getElementById('recordCount');
    
    tbody.innerHTML = '';
    
    if(!records || records.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center">No records found</td></tr>';
        recordCount.innerText = "0 records total";
        return;
    }

    records.forEach(record => {
        // Format amount: ₱12,000
        const formattedAmount = new Intl.NumberFormat('en-PH', { 
            style: 'currency', 
            currency: 'PHP',
            minimumFractionDigits: 0
        }).format(record.amount);

        // Format Category Badge
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
            <td><span class="badge-category badge-${catClass}">${record.category}</span></td>
            <td class="amount-text">${formattedAmount}</td>
            <td>${receiptHtml}</td>
            <td class="text-center pe-4">
                <button class="btn-action"><i class="fa-regular fa-trash-can"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    recordCount.innerText = `${records.length} records total`;
}

function renderChart(records) {
    const chartSection = document.getElementById('chartSection');
    chartSection.classList.remove('d-none'); // Show chart section

    const ctx = document.getElementById('salesChart').getContext('2d');
    
    // Sort records by date for the chart
    const sortedRecords = [...records].sort((a, b) => new Date(a.date) - new Date(b.date));
    
    const labels = sortedRecords.map(r => r.date);
    const dataPoints = sortedRecords.map(r => r.amount);

    new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Sales Amount',
                data: dataPoints,
                borderColor: '#00e676',
                backgroundColor: 'rgba(0, 230, 118, 0.1)',
                borderWidth: 2,
                pointBackgroundColor: '#181818',
                pointBorderColor: '#00e676',
                pointBorderWidth: 2,
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#a0a0a0' }
                },
                x: {
                    grid: { display: false },
                    ticks: { color: '#a0a0a0' }
                }
            }
        }
    });
}
