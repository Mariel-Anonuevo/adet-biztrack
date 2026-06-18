document.addEventListener('DOMContentLoaded', () => {
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
    }
}

function renderTable(records) {
    const tbody = document.getElementById('reportsTableBody');
    tbody.innerHTML = '';
    
    records.forEach(record => {
        const formattedAmount = new Intl.NumberFormat('en-PH', { 
            style: 'currency', currency: 'PHP', minimumFractionDigits: 0
        }).format(record.amount);

        const typeBadge = record.type === 'Sale' 
            ? `<span class="badge rounded-pill bg-success bg-opacity-25 text-success border border-success border-opacity-50 px-3 py-1">Sale</span>`
            : `<span class="badge rounded-pill bg-warning bg-opacity-25 text-warning border border-warning border-opacity-50 px-3 py-1">Expense</span>`;

        const amountColor = record.type === 'Sale' ? 'var(--amount-color)' : '#ff6d00';

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="ps-4 text-secondary">${record.month}</td>
            <td>${typeBadge}</td>
            <td class="fw-bold">${record.description}</td>
            <td class="text-secondary">${record.category}</td>
            <td class="fw-medium" style="color: ${amountColor}">${formattedAmount}</td>
        `;
        tbody.appendChild(tr);
    });
}
