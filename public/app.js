// Automatically detect if running locally or on Render
const API_BASE = `${window.location.protocol}//${window.location.host}/api`;

// Load settings on page load
window.addEventListener('DOMContentLoaded', () => {
    loadSettings();
    loadStatus();
    // Check status every 3 seconds
    setInterval(loadStatus, 3000);
});

// Settings Form
document.getElementById('settingsForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const collections = document.getElementById('collections').value
        .split(',')
        .map(c => c.trim())
        .filter(c => c.length > 0);

    const settings = {
        collections,
        enablePriceTriggerAlerts: document.getElementById('enablePriceTriggerAlerts').checked,
        priceAlertMin: parseFloat(document.getElementById('priceAlertMin').value) || undefined,
        priceAlertMax: parseFloat(document.getElementById('priceAlertMax').value) || undefined
    };

    await saveSettings(settings, 'settingsAlert');
});

// Telegram Form
document.getElementById('telegramForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const settings = {
        telegramChatId: document.getElementById('telegramChatId').value || undefined
    };

    await saveSettings(settings, 'telegramAlert');
});

async function loadSettings() {
    try {
        const response = await fetch(`${API_BASE}/settings`);
        const settings = await response.json();

        // Populate form fields
        document.getElementById('collections').value = settings.collections?.join(', ') || '';
        document.getElementById('enablePriceTriggerAlerts').checked = settings.enablePriceTriggerAlerts || false;
        document.getElementById('priceAlertMin').value = settings.priceAlertMin || '';
        document.getElementById('priceAlertMax').value = settings.priceAlertMax || '';

        document.getElementById('telegramChatId').value = settings.telegramChatId || '';

    } catch (error) {
        console.error('Failed to load settings:', error);
    }
}

async function saveSettings(settings, alertId) {
    try {
        const response = await fetch(`${API_BASE}/settings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(settings)
        });

        const result = await response.json();
        showAlert(alertId, result.message, result.success ? 'success' : 'error');

        if (result.success) {
            setTimeout(() => hideAlert(alertId), 3000);
        }
    } catch (error) {
        showAlert(alertId, 'Failed to save settings', 'error');
    }
}

async function loadStatus() {
    try {
        const response = await fetch(`${API_BASE}/status`);
        const status = await response.json();

        const statusBadge = document.getElementById('statusBadge');
        const startBtn = document.getElementById('startBtn');
        const stopBtn = document.getElementById('stopBtn');

        if (status.isRunning) {
            statusBadge.textContent = '● Running';
            statusBadge.className = 'status-badge running';
            startBtn.classList.add('hidden');
            stopBtn.classList.remove('hidden');
        } else {
            statusBadge.textContent = '● Stopped';
            statusBadge.className = 'status-badge stopped';
            startBtn.classList.remove('hidden');
            stopBtn.classList.add('hidden');
        }
    } catch (error) {
        console.error('Failed to load status:', error);
    }
}

async function startBot() {
    try {
        const response = await fetch(`${API_BASE}/start`, { method: 'POST' });
        const result = await response.json();

        if (result.success) {
            await loadStatus();
        }
    } catch (error) {
        console.error('Failed to start bot:', error);
    }
}

async function stopBot() {
    try {
        const response = await fetch(`${API_BASE}/stop`, { method: 'POST' });
        const result = await response.json();

        if (result.success) {
            await loadStatus();
        }
    } catch (error) {
        console.error('Failed to stop bot:', error);
    }
}

function showAlert(elementId, message, type) {
    const alert = document.getElementById(elementId);
    alert.className = `alert alert-${type}`;
    alert.textContent = message;
    alert.classList.remove('hidden');
}

function hideAlert(elementId) {
    const alert = document.getElementById(elementId);
    alert.classList.add('hidden');
}
