/**
 * Custom GORGEOUS alert and confirmation modals.
 * Replaces ugly browser-native confirm() and alert() dialogs which display the local address.
 */

window.showConfirm = function(message, title = "Confirmation Required") {
    return new Promise((resolve) => {
        // Create modal overlay element
        const overlay = document.createElement('div');
        overlay.style.position = 'fixed';
        overlay.style.top = '0';
        overlay.style.left = '0';
        overlay.style.width = '100vw';
        overlay.style.height = '100vh';
        overlay.style.backgroundColor = 'rgba(15, 23, 42, 0.4)'; // slate backdrop
        overlay.style.backdropFilter = 'blur(6px)';
        overlay.style.zIndex = '99999';
        overlay.style.display = 'flex';
        overlay.style.alignItems = 'center';
        overlay.style.justifyContent = 'center';
        overlay.style.opacity = '0';
        overlay.style.transition = 'opacity 0.2s ease';
        
        // Modal card
        const card = document.createElement('div');
        card.style.background = '#ffffff';
        card.style.borderRadius = '16px';
        card.style.boxShadow = '0 10px 30px rgba(0, 0, 0, 0.15)';
        card.style.width = '90%';
        card.style.maxWidth = '420px';
        card.style.padding = '1.75rem';
        card.style.transform = 'scale(0.9)';
        card.style.transition = 'transform 0.2s ease';
        card.style.border = '1px solid rgba(0, 0, 0, 0.05)';
        
        card.innerHTML = `
            <div style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 1rem;">
                <div style="width: 38px; height: 38px; border-radius: 50%; background: #fef3c7; display: flex; align-items: center; justify-content: center; color: #d97706; font-size: 1.1rem; flex-shrink: 0;">
                    <i class="fa-solid fa-circle-question"></i>
                </div>
                <h5 style="margin: 0; font-weight: 700; color: #1e293b; font-size: 1.15rem;">${title}</h5>
            </div>
            <p style="color: #475569; font-size: 0.93rem; line-height: 1.5; margin-bottom: 1.5rem;">${message}</p>
            <div style="display: flex; justify-content: flex-end; gap: 0.75rem;">
                <button id="customConfirmCancel" style="background: #f1f5f9; color: #475569; border: none; border-radius: 8px; padding: 0.55rem 1.25rem; font-weight: 600; font-size: 0.88rem; cursor: pointer; transition: background 0.15s;">Cancel</button>
                <button id="customConfirmOk" style="background: linear-gradient(135deg, #22c55e, #16a34a); color: #fff; border: none; border-radius: 8px; padding: 0.55rem 1.25rem; font-weight: 600; font-size: 0.88rem; cursor: pointer; transition: opacity 0.15s; box-shadow: 0 4px 10px rgba(34, 197, 94, 0.2);">Confirm</button>
            </div>
        `;
        
        overlay.appendChild(card);
        document.body.appendChild(overlay);
        
        // Trigger reflow & animation
        setTimeout(() => {
            overlay.style.opacity = '1';
            card.style.transform = 'scale(1)';
        }, 10);
        
        const cleanup = (value) => {
            overlay.style.opacity = '0';
            card.style.transform = 'scale(0.9)';
            setTimeout(() => {
                document.body.removeChild(overlay);
                resolve(value);
            }, 200);
        };
        
        const btnCancel = card.querySelector('#customConfirmCancel');
        const btnOk = card.querySelector('#customConfirmOk');
        
        btnCancel.addEventListener('click', () => cleanup(false));
        btnOk.addEventListener('click', () => cleanup(true));
        
        // Hover effects
        btnCancel.addEventListener('mouseenter', () => btnCancel.style.background = '#e2e8f0');
        btnCancel.addEventListener('mouseleave', () => btnCancel.style.background = '#f1f5f9');
        btnOk.addEventListener('mouseenter', () => btnOk.style.opacity = '0.9');
        btnOk.addEventListener('mouseleave', () => btnOk.style.opacity = '1');
    });
};

window.showAlert = function(message, title = "Notice", type = "success") {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.style.position = 'fixed';
        overlay.style.top = '0';
        overlay.style.left = '0';
        overlay.style.width = '100vw';
        overlay.style.height = '100vh';
        overlay.style.backgroundColor = 'rgba(15, 23, 42, 0.4)';
        overlay.style.backdropFilter = 'blur(6px)';
        overlay.style.zIndex = '99999';
        overlay.style.display = 'flex';
        overlay.style.alignItems = 'center';
        overlay.style.justifyContent = 'center';
        overlay.style.opacity = '0';
        overlay.style.transition = 'opacity 0.2s ease';
        
        const isError = type === "error" || message.toLowerCase().includes("error") || message.toLowerCase().includes("fail") || message.toLowerCase().includes("unauthorized");
        const icon = isError ? "fa-solid fa-triangle-exclamation" : "fa-solid fa-circle-check";
        const iconBg = isError ? "#fee2e2" : "#d1fae5";
        const iconColor = isError ? "#ef4444" : "#10b981";
        const buttonBg = isError ? "linear-gradient(135deg, #ef4444, #dc2626)" : "linear-gradient(135deg, #22c55e, #16a34a)";
        const buttonShadow = isError ? "rgba(239, 68, 68, 0.2)" : "rgba(34, 197, 94, 0.2)";

        const card = document.createElement('div');
        card.style.background = '#ffffff';
        card.style.borderRadius = '16px';
        card.style.boxShadow = '0 10px 30px rgba(0, 0, 0, 0.15)';
        card.style.width = '90%';
        card.style.maxWidth = '400px';
        card.style.padding = '1.75rem';
        card.style.transform = 'scale(0.9)';
        card.style.transition = 'transform 0.2s ease';
        card.style.border = '1px solid rgba(0, 0, 0, 0.05)';
        
        card.innerHTML = `
            <div style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 1rem;">
                <div style="width: 38px; height: 38px; border-radius: 50%; background: ${iconBg}; display: flex; align-items: center; justify-content: center; color: ${iconColor}; font-size: 1.1rem; flex-shrink: 0;">
                    <i class="${icon}"></i>
                </div>
                <h5 style="margin: 0; font-weight: 700; color: #1e293b; font-size: 1.15rem;">${title}</h5>
            </div>
            <p style="color: #475569; font-size: 0.93rem; line-height: 1.5; margin-bottom: 1.5rem;">${message}</p>
            <div style="display: flex; justify-content: flex-end;">
                <button id="customAlertOk" style="background: ${buttonBg}; color: #fff; border: none; border-radius: 8px; padding: 0.55rem 1.5rem; font-weight: 600; font-size: 0.88rem; cursor: pointer; transition: opacity 0.15s; box-shadow: 0 4px 10px ${buttonShadow};">OK</button>
            </div>
        `;
        
        overlay.appendChild(card);
        document.body.appendChild(overlay);
        
        setTimeout(() => {
            overlay.style.opacity = '1';
            card.style.transform = 'scale(1)';
        }, 10);
        
        const cleanup = () => {
            overlay.style.opacity = '0';
            card.style.transform = 'scale(0.9)';
            setTimeout(() => {
                document.body.removeChild(overlay);
                resolve();
            }, 200);
        };
        
        const btnOk = card.querySelector('#customAlertOk');
        btnOk.addEventListener('click', cleanup);
        btnOk.addEventListener('mouseenter', () => btnOk.style.opacity = '0.9');
        btnOk.addEventListener('mouseleave', () => btnOk.style.opacity = '1');
    });
};
