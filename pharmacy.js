// Active state
let currentPharmacyId = 'central-pharmacy';

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', async () => {
  // Session check
  const session = sessionStorage.getItem('vaiso_session');
  if (session) {
    const user = JSON.parse(session);
    if (user.role === 'pharmacy') {
      currentPharmacyId = user.id;
    }
  }

  // Update Pharmacy Greeting and Details
  const greetingEl = document.getElementById('pharmacy-greeting');
  if (greetingEl) {
    const name = currentPharmacyId === 'central-pharmacy' ? 'Vaisoverse Central Pharmacy' : 'City Wellness Pharmacy';
    const license = currentPharmacyId === 'central-pharmacy' ? 'PH-2026-9876' : 'PH-2026-4321';
    
    greetingEl.innerHTML = `<i class="fa-solid fa-prescription-bottle-medical" style="color:#F59E0B"></i> Welcome, ${name}`;
    document.getElementById('snapshot-name').innerText = name;
    document.getElementById('snapshot-license').innerText = `License: ${license}`;
  }
  
  // Initial load
  await loadPharmacyDashboard();
});

// Logout handler
function handleLogout() {
  sessionStorage.removeItem('vaiso_session');
  window.location.href = 'index.html';
}

// Switch dashboard tabs
function switchTab(tabId) {
  const buttons = document.querySelectorAll('.nav-tab-btn');
  buttons.forEach(btn => {
    if (btn.getAttribute('data-tab') === tabId) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
  
  const contents = document.querySelectorAll('.dashboard-tab-content');
  contents.forEach(content => {
    if (content.id === `tab-${tabId}`) {
      content.classList.add('active');
    } else {
      content.classList.remove('active');
    }
  });
}

// Load and render all details for the pharmacy dashboard
async function loadPharmacyDashboard() {
  try {
    const prescriptions = await getPrescriptions();
    const inventory = await getPharmacyInventory();
    
    // Calculate stats
    const pending = prescriptions.filter(r => r.status === 'Pending' || r.status === 'Preparing').length;
    const dispensed = prescriptions.filter(r => r.status === 'Dispensed').length;
    const lowStock = inventory.filter(i => i.stock < i.threshold).length;
    
    document.getElementById('stat-pending-orders').innerText = pending;
    document.getElementById('stat-dispensed-today').innerText = dispensed;
    document.getElementById('stat-low-stock').innerText = lowStock;

    // Render tables
    renderPrescriptionsTable(prescriptions);
    renderInventoryTable(inventory);
    
  } catch (err) {
    console.error("Pharmacy Dashboard error:", err);
  }
}

// Render prescriptions table
function renderPrescriptionsTable(prescriptions) {
  const tbody = document.getElementById('prescriptions-tbody');
  tbody.innerHTML = '';
  
  document.getElementById('table-subtitle-count').innerText = `Active Queue: ${prescriptions.length} Orders`;
  
  if (prescriptions.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align: center; padding: 40px 0;">
          <div class="dash-empty-icon" style="color:var(--text-muted); font-size: 24px;"><i class="fa-regular fa-clipboard"></i></div>
          <p style="color: var(--text-muted); margin-top: 10px; font-size:13px;">No prescriptions submitted yet.</p>
        </td>
      </tr>
    `;
    return;
  }

  // Sort: Pending first, chronologically
  const sorted = [...prescriptions].sort((a, b) => {
    if (a.status !== 'Dispensed' && b.status === 'Dispensed') return -1;
    if (a.status === 'Dispensed' && b.status !== 'Dispensed') return 1;
    return b.id.localeCompare(a.id); // Newer first
  });

  sorted.forEach(rx => {
    let statusClass = 'status-badge-scheduled';
    let statusText = rx.status;
    
    if (rx.status === 'Dispensed') {
      statusClass = 'status-badge-completed';
    } else if (rx.status === 'Preparing') {
      statusClass = 'status-badge-scheduled'; // Yellow/blue
    }

    let actionHtml = '';
    if (rx.status === 'Pending') {
      actionHtml = `
        <button class="btn btn-primary" style="padding: 4px 10px; font-size: 11px;" onclick="advanceRxStatus('${rx.id}', 'Preparing')">
          <i class="fa-solid fa-spinner fa-spin-hover"></i> Prepare
        </button>
      `;
    } else if (rx.status === 'Preparing') {
      actionHtml = `
        <button class="btn btn-primary" style="padding: 4px 10px; font-size: 11px; background:var(--color-success); border-color:var(--color-success);" onclick="advanceRxStatus('${rx.id}', 'Dispensed')">
          <i class="fa-solid fa-hand-holding-medical"></i> Dispense
        </button>
      `;
    } else {
      actionHtml = `<span style="font-size:11px; color:var(--text-secondary);"><i class="fa-solid fa-circle-check" style="color:var(--color-success)"></i> Released</span>`;
    }

    // Format drugs list
    const drugsListHtml = rx.drugs.map(d => `• <strong>${d}</strong>`).join('<br>');

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${rx.patientName}</strong></td>
      <td>${rx.doctorName}</td>
      <td><span class="time-slot-tag" style="background:rgba(0,0,0,0.03)"><i class="fa-regular fa-calendar"></i> ${rx.date}</span></td>
      <td><div style="font-size: 12px; text-align: left; max-width:250px;">${drugsListHtml}</div></td>
      <td><span class="status-badge ${statusClass}">${statusText}</span></td>
      <td>${actionHtml}</td>
    `;
    tbody.appendChild(tr);
  });
}

// Advance prescription status
async function advanceRxStatus(rxId, nextStatus) {
  try {
    showToast(`Updating prescription status to ${nextStatus}...`, "info");
    const result = await updatePrescriptionStatus(rxId, nextStatus);
    if (result.success || result.prescription) {
      showToast(`Prescription status set to ${nextStatus}`, "success");
      await loadPharmacyDashboard();
    }
  } catch (err) {
    showToast("Failed to update status: " + err.message, "error");
  }
}

// Render inventory table
function renderInventoryTable(inventory) {
  const tbody = document.getElementById('inventory-tbody');
  tbody.innerHTML = '';
  
  if (inventory.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align: center; padding: 40px 0;">
          <p style="color: var(--text-muted); font-size:13px;">Inventory empty.</p>
        </td>
      </tr>
    `;
    return;
  }

  inventory.forEach(item => {
    const isLow = item.stock < item.threshold;
    
    let statusBadgeHtml = `<span class="status-badge status-badge-completed">Optimal</span>`;
    if (isLow) {
      statusBadgeHtml = `<span class="status-badge status-badge-cancelled" style="animation: pulse 1.5s infinite">LOW STOCK</span>`;
    }

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${item.name}</strong></td>
      <td style="font-weight: 600; color: ${isLow ? 'var(--color-danger)' : 'var(--text-primary)'}">${item.stock} units</td>
      <td>${item.threshold} units</td>
      <td>$${item.price.toFixed(2)}</td>
      <td>${statusBadgeHtml}</td>
      <td>
        <button class="btn btn-ghost" style="padding: 4px 8px; font-size:11px; border:1px solid var(--border-color);" onclick="refillStock('${item.name}')">
          <i class="fa-solid fa-plus-circle" style="color:var(--color-accent)"></i> Refill (+100)
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// Refill drug stock
async function refillStock(name) {
  try {
    showToast(`Refilling ${name}...`, "info");
    const result = await restockDrug(name, 100);
    if (result.success || result.item) {
      showToast(`Stock updated for ${name}`, "success");
      await loadPharmacyDashboard();
    }
  } catch (err) {
    showToast("Refill request failed: " + err.message, "error");
  }
}

// ==========================================
// AI PHARMACY CO-PILOT CHATBOT
// ==========================================

function handlePharmacyKeypress(event) {
  if (event.key === 'Enter') {
    sendPharmacyMessage();
  }
}

async function sendPharmacyMessage() {
  const input = document.getElementById('pharmacy-input');
  const text = input.value.trim();
  if (!text) return;
  
  input.value = '';
  appendPharmacyBubble(text, 'user');
  showPharmacyTyping();
  
  setTimeout(async () => {
    hidePharmacyTyping();
    const reply = await getPharmacyResponse(text);
    appendPharmacyBubble(reply, 'bot');
  }, 1000);
}

async function sendPharmacyCommand(cmd) {
  appendPharmacyBubble(cmd, 'user');
  showPharmacyTyping();
  
  setTimeout(async () => {
    hidePharmacyTyping();
    const reply = await getPharmacyResponse(cmd);
    appendPharmacyBubble(reply, 'bot');
  }, 800);
}

function appendPharmacyBubble(text, sender) {
  const container = document.getElementById('pharmacy-messages');
  const wrapper = document.createElement('div');
  wrapper.className = `copilot-bubble-wrapper ${sender}`;
  const avatar = sender === 'bot' ? '💊' : '👤';
  
  const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  
  wrapper.innerHTML = `
    <div class="copilot-avatar-msg">${avatar}</div>
    <div>
      <div class="copilot-bubble">${text}</div>
      <span class="msg-time">${time}</span>
    </div>
  `;
  container.appendChild(wrapper);
  container.scrollTop = container.scrollHeight;
}

function showPharmacyTyping() {
  const container = document.getElementById('pharmacy-messages');
  const indicator = document.createElement('div');
  indicator.className = 'typing-indicator';
  indicator.id = 'pharmacy-typing-bubble';
  indicator.style.marginLeft = '38px';
  indicator.innerHTML = `
    <div class="typing-dot"></div>
    <div class="typing-dot"></div>
    <div class="typing-dot"></div>
  `;
  container.appendChild(indicator);
  container.scrollTop = container.scrollHeight;
}

function hidePharmacyTyping() {
  const ind = document.getElementById('pharmacy-typing-bubble');
  if (ind) ind.remove();
}

function clearPharmacyChat() {
  const container = document.getElementById('pharmacy-messages');
  container.innerHTML = `
    <div class="copilot-bubble-wrapper bot">
      <div class="copilot-avatar-msg">💊</div>
      <div>
        <div class="copilot-bubble">
          Pharmacy interaction log reset. Ask me to verify warning categories or low stock alerts.
        </div>
        <span class="msg-time">Just now</span>
      </div>
    </div>
  `;
  showToast("Co-pilot chat reset", "success");
}

async function getPharmacyResponse(query) {
  const lower = query.toLowerCase();
  
  if (lower.includes('warning') || lower.includes('safety') || lower.includes('interaction') || lower.includes('check')) {
    return `<strong>Clinical Interaction Warning:</strong><br><br>• <strong>Lisinopril + Ibuprofen</strong>: Concomitant administration of ACE inhibitors and NSAIDs may lead to a significant decline in renal function. Co-therapy should be monitored closely for blood pressure and kidney filtration levels.`;
  }
  
  if (lower.includes('low') || lower.includes('stock') || lower.includes('inventory')) {
    const inventory = await getPharmacyInventory();
    const lowItems = inventory.filter(i => i.stock < i.threshold);
    if (lowItems.length > 0) {
      const itemsList = lowItems.map(item => `• <strong>${item.name}</strong>: Current stock ${item.stock} (Safety limit: ${item.threshold})`).join('<br>');
      return `Here are the low-stock drugs that require attention:<br><br>${itemsList}<br><br>Click the <strong>Refill</strong> button next to them to add +100 units.`;
    }
    return `All drug inventory levels are currently optimal. No refills are urgently needed.`;
  }

  return `Understood. I am connected to the Vaisoverse drug interaction database. Please specify a drug query (e.g. 'safety warnings' or 'low stock list') to retrieve statistics.`;
}

// Toast notification helper
function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  const toast = container.querySelector('.toast');
  const icon = toast.querySelector('.toast-icon');
  const text = document.getElementById('toast-message');
  
  text.innerHTML = message;
  
  if (type === 'success') {
    icon.className = 'fa-solid fa-circle-check toast-icon';
    icon.style.color = '#10B981';
  } else if (type === 'info') {
    icon.className = 'fa-solid fa-circle-notch toast-icon info';
    icon.style.color = '#0052FF';
  } else if (type === 'error') {
    icon.className = 'fa-solid fa-circle-xmark toast-icon';
    icon.style.color = '#EF4444';
  }
  
  container.classList.add('active');
  setTimeout(() => {
    container.classList.remove('active');
  }, 3500);
}
