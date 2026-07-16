// Active state
let currentDoctorId = 'dr-mercer';
let voiceActive = false;
let eventSource = null;

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', async () => {
  // Session check
  const session = sessionStorage.getItem('vaiso_session');
  if (session) {
    const user = JSON.parse(session);
    if (user.role === 'doctor') {
      currentDoctorId = user.id;
      const greetingEl = document.getElementById('doctor-greeting');
      if (greetingEl) {
        greetingEl.innerHTML = `<i class="fa-solid fa-user-doctor" style="color:var(--color-accent)"></i> Welcome, ${user.name}`;
      }
    }
  }

  // Sync select dropdown with current selection
  const select = document.getElementById('active-doctor-select');
  if (select) {
    select.value = currentDoctorId;
  }
  
  // Initial load
  await loadDashboardData();
  
  // Connect to SSE for real-time updates
  setupRealTimeEvents();
});

// Logout handler
function handleLogout() {
  sessionStorage.removeItem('vaiso_session');
  window.location.href = 'index.html';
}

// Setup Server-Sent Events (SSE) connection
function setupRealTimeEvents() {
  if (eventSource) {
    eventSource.close();
  }
  
  eventSource = new EventSource('/api/events');
  
  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.event === 'appointments_updated' || data.event === 'doctors_updated') {
        // Reload dashboard in real-time!
        loadDashboardData();
      }
    } catch (err) {
      // Keep-alive or connection logs
    }
  };
  
  eventSource.onerror = (err) => {
    console.warn("SSE connection error. Retrying in 5s...", err);
    setTimeout(setupRealTimeEvents, 5000);
  };
}

// Switch active doctor
async function handleDoctorSwitch(doctorId) {
  currentDoctorId = doctorId;
  await loadDashboardData();
  showToast(`Switched profile to ${(await getDoctorById(doctorId)).title}`, 'success');
  
  // Restore newly selected doctor's co-pilot history
  await restoreCopilotHistory();
}

// Switch dashboard view tabs
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

// Load and render all details for the active doctor from Node Backend
async function loadDashboardData() {
  const doc = await getDoctorById(currentDoctorId);
  if (!doc) return;
  
  // 1. Sidebar Snapshot Card
  document.getElementById('snapshot-name').innerText = doc.title;
  document.getElementById('snapshot-specialty').innerText = `${doc.specialty} Department`;
  
  const statusBadge = document.getElementById('snapshot-status-badge');
  const statusText = document.getElementById('snapshot-status-text');
  
  if (doc.available) {
    statusBadge.className = 'status-indicator-badge active';
    statusText.innerText = 'Available';
  } else {
    statusBadge.className = 'status-indicator-badge inactive';
    statusText.innerText = 'Not Available';
  }
  
  // Update avatar icon inside snapshot card
  const avatarContainer = document.getElementById('snapshot-avatar');
  avatarContainer.innerHTML = `<i class="${doc.avatar}"></i>`;
  avatarContainer.style.background = `rgba(${hexToRgb(doc.avatarBg)}, 0.1)`;
  avatarContainer.style.color = doc.avatarBg;
  
  // 2. Stats Ribbon
  const totalApts = doc.appointments.length;
  const activeSlots = doc.availableSlots.length;
  
  document.getElementById('stat-total-apts').innerText = totalApts;
  document.getElementById('stat-active-slots').innerText = activeSlots;
  document.getElementById('stat-duty-status').innerText = doc.available ? 'On Duty' : 'Off Duty';
  
  const statStatusIconWrapper = document.getElementById('stat-duty-status').parentElement.previousElementSibling;
  if (doc.available) {
    statStatusIconWrapper.className = 'stat-icon-wrapper green';
    statStatusIconWrapper.innerHTML = '<i class="fa-solid fa-circle-check"></i>';
  } else {
    statStatusIconWrapper.className = 'stat-icon-wrapper red';
    statStatusIconWrapper.innerHTML = '<i class="fa-solid fa-circle-xmark"></i>';
  }

  // 3. Overview Tab Table
  renderAppointmentsTable(doc.appointments);
  
  // 4. Render Patient Uploaded Clinical Files
  await renderUploadedFilesLog();
  
  // 5. Schedule & Slots Tab
  const toggle = document.getElementById('availability-toggle');
  if (toggle) toggle.checked = doc.available;
  
  const banner = document.getElementById('status-banner');
  if (doc.available) {
    banner.className = 'availability-status-banner success';
    banner.innerHTML = '<i class="fa-solid fa-circle-check"></i><div><strong id="banner-title">Accepting Appointments</strong><p id="banner-desc">You are visible in the booking chatbot.</p></div>';
  } else {
    banner.className = 'availability-status-banner danger';
    banner.innerHTML = '<i class="fa-solid fa-ban"></i><div><strong id="banner-title">Booking Disabled</strong><p id="banner-desc">Patients cannot select your profile right now.</p></div>';
  }
  
  renderSlotsPills(doc.availableSlots);
  
  // 6. Populate Profile Edit Form
  document.getElementById('edit-name').value = doc.title;
  document.getElementById('edit-specialty').value = doc.specialty;
  document.getElementById('edit-hours').value = doc.hours;
  document.getElementById('edit-bio').value = doc.bio;
  document.getElementById('edit-avatar').value = doc.avatar;
  
  // 7. Load persistent co-pilot chat history
  await restoreCopilotHistory();
}

// Render appointments table
function renderAppointmentsTable(appointments) {
  const tbody = document.getElementById('appointments-tbody');
  tbody.innerHTML = '';
  
  const activeApts = appointments.filter(a => a.status === 'scheduled');
  document.getElementById('table-subtitle-count').innerText = `Active Scheduled: ${activeApts.length} (Total: ${appointments.length})`;
  
  if (appointments.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" style="text-align: center; padding: 40px 0;">
          <div class="dash-empty-icon"><i class="fa-regular fa-calendar-xmark"></i></div>
          <p style="color: var(--text-muted); margin-top: 10px;">No appointments recorded yet.</p>
        </td>
      </tr>
    `;
    return;
  }
  
  // Sort chronologically
  const sortedApts = [...appointments].sort((a, b) => {
    if (a.status === 'scheduled' && b.status !== 'scheduled') return -1;
    if (a.status !== 'scheduled' && b.status === 'scheduled') return 1;
    return a.time.localeCompare(b.time);
  });
  
  sortedApts.forEach(apt => {
    let statusClass = 'status-badge-scheduled';
    let statusText = 'Scheduled';
    
    if (apt.status === 'completed') {
      statusClass = 'status-badge-completed';
      statusText = 'Completed';
    } else if (apt.status === 'cancelled') {
      statusClass = 'status-badge-cancelled';
      statusText = 'Cancelled';
    }
    
    let actionsHtml = '';
    if (apt.status === 'scheduled') {
      actionsHtml = `
        <div class="table-actions">
          <button class="btn-action-success" onclick="changeAptStatus('${apt.id}', 'completed')" title="Mark as Completed">
            <i class="fa-solid fa-circle-check"></i>
          </button>
          <button class="btn-action-success" style="background:#7000FF; border-color:#7000FF;" onclick="openPrescriptionModal('${apt.patientName}', '${apt.id}')" title="Write Prescription">
            <i class="fa-solid fa-file-prescription"></i>
          </button>
          <button class="btn-action-danger" onclick="changeAptStatus('${apt.id}', 'cancelled')" title="Cancel Appointment">
            <i class="fa-solid fa-trash-can"></i>
          </button>
        </div>
      `;
    } else {
      actionsHtml = `<span style="font-size:12px; color: var(--text-muted);">No actions</span>`;
    }
    
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${apt.patientName}</strong></td>
      <td><span class="time-slot-tag"><i class="fa-regular fa-clock"></i> ${apt.time}</span></td>
      <td>${apt.reason}</td>
      <td><span class="status-badge ${statusClass}">${statusText}</span></td>
      <td>${actionsHtml}</td>
    `;
    tbody.appendChild(tr);
  });
}

// Change appointment status
async function changeAptStatus(aptId, status) {
  const updated = await updateAppointmentStatus(currentDoctorId, aptId, status);
  if (updated) {
    await loadDashboardData();
    showToast(`Appointment status updated to ${status}.`, 'success');
  }
}

// Render patient uploaded clinical files downloads panel
async function renderUploadedFilesLog() {
  const container = document.getElementById('clinical-files-container');
  if (!container) return;
  
  container.innerHTML = '';
  const files = await fetchUploadedFiles();
  
  if (!files || files.length === 0) {
    container.innerHTML = `
      <div style="text-align:center; padding:24px 0;">
        <div class="dash-empty-icon dash-empty-icon-sm"><i class="fa-regular fa-folder-open"></i></div>
        <p style="color: var(--text-muted); font-size:13px; margin-top: 8px;">No patient attachments uploaded to server.</p>
      </div>
    `;
    return;
  }
  
  // Sort files by upload time (newest first)
  const sortedFiles = [...files].sort((a, b) => new Date(b.uploadTime) - new Date(a.uploadTime));
  
  sortedFiles.forEach(file => {
    const timeStr = new Date(file.uploadTime).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
    const logItem = document.createElement('div');
    logItem.className = 'clinical-file-item';
    logItem.innerHTML = `
      <div class="file-details">
        <i class="fa-solid fa-file-medical file-type-icon"></i>
        <div>
          <strong class="file-name">${file.name}</strong>
          <span class="file-meta-desc">${timeStr} &bull; ${(file.size/1024).toFixed(1)} KB</span>
        </div>
      </div>
      <a href="${file.url}" target="_blank" class="btn btn-secondary file-download-btn" style="padding: 6px 12px; font-size: 11px;">
        <i class="fa-solid fa-download"></i> View / Download
      </a>
    `;
    container.appendChild(logItem);
  });
}

// Toggle doctor availability checkmark
async function toggleAvailability(isChecked) {
  await setDoctorAvailabilityStatus(currentDoctorId, isChecked);
  await loadDashboardData();
  showToast(isChecked ? "Availability activated!" : "Availability deactivated.", "info");
}

// Render slots pills
function renderSlotsPills(slots) {
  const container = document.getElementById('slots-container');
  container.innerHTML = '';
  
  document.getElementById('slots-count-badge').innerText = `${slots.length} active slots`;
  
  if (slots.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 24px 0;">
        <div class="dash-empty-icon dash-empty-icon-sm"><i class="fa-regular fa-clock"></i></div>
        <p style="color: var(--text-muted); font-size: 13px; margin-top: 8px;">No active booking slots. Add slots above so patients can book.</p>
      </div>
    `;
    return;
  }
  
  slots.forEach(slot => {
    const pill = document.createElement('div');
    pill.className = 'slot-pill-interactive';
    pill.innerHTML = `
      <span>${slot}</span>
      <button class="slot-pill-delete" onclick="removeSlot('${slot}')" title="Delete slot">
        <i class="fa-solid fa-xmark"></i>
      </button>
    `;
    container.appendChild(pill);
  });
}

// Add a new slot
async function addNewSlot() {
  const timeInput = document.getElementById('new-slot-time');
  const timeVal = timeInput.value;
  if (!timeVal) return;
  
  const slot12 = convert24to12Hour(timeVal);
  const updated = await addDoctorSlot(currentDoctorId, slot12);
  
  if (updated) {
    await loadDashboardData();
    showToast(`Slot "${slot12}" added successfully`, 'success');
  } else {
    showToast(`Could not add slot`, 'error');
  }
}

// Remove slot
async function removeSlot(slot) {
  await removeDoctorSlot(currentDoctorId, slot);
  await loadDashboardData();
  showToast(`Slot "${slot}" removed`, 'info');
}

// Handle Profile form submission
async function handleProfileSubmit(event) {
  event.preventDefault();
  
  const updatedData = {
    title: document.getElementById('edit-name').value.trim(),
    specialty: document.getElementById('edit-specialty').value.trim(),
    hours: document.getElementById('edit-hours').value.trim(),
    bio: document.getElementById('edit-bio').value.trim(),
    avatar: document.getElementById('edit-avatar').value
  };
  
  const updated = await updateDoctorProfile(currentDoctorId, updatedData);
  if (updated) {
    await loadDashboardData();
    showToast("Profile details updated successfully!", "success");
  }
}

// Reset Profile form
async function resetProfileForm() {
  await loadDashboardData();
  showToast("Form details reset", "info");
}

// Helper: Hex color to RGB
function hexToRgb(hex) {
  hex = hex.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  return `${r}, ${g}, ${b}`;
}

// Helper: Convert "14:30" format to "02:30 PM"
function convert24to12Hour(time24) {
  const [hoursStr, minutesStr] = time24.split(':');
  let hours = parseInt(hoursStr);
  const minutes = parseInt(minutesStr);
  const ampm = hours >= 12 ? 'PM' : 'AM';
  
  hours = hours % 12;
  hours = hours ? hours : 12;
  
  const formattedHours = hours < 10 ? '0' + hours : hours;
  const formattedMinutes = minutes < 10 ? '0' + minutes : minutes;
  
  return `${formattedHours}:${formattedMinutes} ${ampm}`;
}

// ==========================================
// AI CO-PILOT CHATBOX FOR CLINICIANS
// ==========================================

// Restore clinician co-pilot logs
async function restoreCopilotHistory() {
  try {
    const sessionId = `copilot-session-${currentDoctorId}`;
    const history = await fetchChatHistory(sessionId);
    const container = document.getElementById('copilot-messages');
    
    // Clear display first
    container.innerHTML = '';
    
    if (history && history.length > 0) {
      history.forEach(msg => {
        appendCopilotMessageDirectly(msg.text, msg.sender, msg.time);
      });
    } else {
      // Welcome message
      container.innerHTML = `
        <div class="copilot-bubble-wrapper bot">
          <div class="copilot-avatar-msg">🤖</div>
          <div>
            <div class="copilot-bubble">
              Hello doctor. I am your operations co-pilot. I can help configure your availability and manage appointments instantly.
              <br><br>
              <em>Try saying:</em>
              <ul>
                <li>"What is my schedule?"</li>
                <li>"Set me as unavailable"</li>
                <li>"Add slot for 04:30 PM"</li>
                <li>"Cancel Robert's appointment"</li>
              </ul>
            </div>
            <span class="msg-time">Just now</span>
          </div>
        </div>
      `;
    }
    setupCopilotAutoscroll();
  } catch (err) {
    console.error("Failed to restore co-pilot chat logs:", err);
  }
}

function handleCopilotKeypress(event) {
  if (event.key === 'Enter') {
    sendCopilotMessage();
  }
}

async function sendCopilotMessage() {
  const input = document.getElementById('copilot-input');
  const text = input.value.trim();
  if (!text) return;
  
  await appendCopilotMessage(text, 'user');
  input.value = '';
  
  showCopilotTyping();
  
  const reply = await parseCopilotCommand(text);
  
  setTimeout(async () => {
    hideCopilotTyping();
    await appendCopilotMessage(reply, 'bot');
  }, 1000);
}

async function sendCopilotCommand(commandText) {
  await appendCopilotMessage(commandText, 'user');
  showCopilotTyping();
  
  const reply = await parseCopilotCommand(commandText);
  
  setTimeout(async () => {
    hideCopilotTyping();
    await appendCopilotMessage(reply, 'bot');
  }, 800);
}

// Parse clinician commands dynamically
async function parseCopilotCommand(query) {
  const doc = await getDoctorById(currentDoctorId);
  const normalized = query.toLowerCase();
  
  // 1. Show schedule
  if (normalized.includes('schedule') || normalized.includes('appointment') || normalized.includes('list') || normalized.includes('what is my')) {
    const activeApts = doc.appointments.filter(a => a.status === 'scheduled');
    if (activeApts.length === 0) {
      return `Doctor, your schedule is currently clear. You have no pending appointments today.`;
    }
    
    let scheduleStr = `You have <strong>${activeApts.length} scheduled appointments</strong>:<br><br>`;
    activeApts.forEach((a, i) => {
      scheduleStr += `${i+1}. <strong>${a.patientName}</strong> at <strong>${a.time}</strong> (${a.reason})<br>`;
    });
    return scheduleStr;
  }
  
  // 2. Go on duty / set available
  if (normalized.includes('go on duty') || normalized.includes('make me available') || normalized.includes('accept booking') || normalized.includes('active') || normalized.includes('set available')) {
    await setDoctorAvailabilityStatus(currentDoctorId, true);
    await loadDashboardData();
    return `Affirmative. I have updated your status to <strong>Available</strong>. Patients can now schedule consultations with you.`;
  }
  
  // 3. Go off duty / set unavailable
  if (normalized.includes('go off duty') || normalized.includes('make me unavailable') || normalized.includes('stop booking') || normalized.includes('inactive') || normalized.includes('set unavailable')) {
    await setDoctorAvailabilityStatus(currentDoctorId, false);
    await loadDashboardData();
    return `Understood. I have set your status to <strong>Unavailable</strong>. All slot bookings on the patient portal are temporarily disabled.`;
  }
  
  // 4. Add time slot
  if (normalized.includes('add slot')) {
    const timeMatch = query.match(/(\d{1,2}):(\d{2})\s*(am|pm)?/i);
    if (timeMatch) {
      let hours = parseInt(timeMatch[1]);
      const mins = timeMatch[2];
      let ampm = timeMatch[3];
      
      if (!ampm) {
        ampm = hours >= 12 ? 'PM' : 'AM';
        if (hours > 12) hours = hours - 12;
      }
      
      const hoursStr = hours < 10 ? '0' + hours : hours;
      const formattedSlot = `${hoursStr}:${mins} ${ampm.toUpperCase()}`;
      
      await addDoctorSlot(currentDoctorId, formattedSlot);
      await loadDashboardData();
      return `Added slot <strong>${formattedSlot}</strong> to your availability schedule.`;
    }
    return `I couldn't parse the time formatting. Please specify a slot like "Add slot for 04:30 PM" or "Add slot 11:00 AM".`;
  }
  
  // 5. Cancel patient appointment
  if (normalized.includes('cancel')) {
    const activeApts = doc.appointments.filter(a => a.status === 'scheduled');
    let matchedApt = null;
    
    for (const apt of activeApts) {
      if (normalized.includes(apt.patientName.toLowerCase()) || normalized.includes(apt.patientName.split(' ')[0].toLowerCase())) {
        matchedApt = apt;
        break;
      }
    }
    
    if (matchedApt) {
      await updateAppointmentStatus(currentDoctorId, matchedApt.id, 'cancelled');
      await loadDashboardData();
      return `Canceled appointment for patient <strong>${matchedApt.patientName}</strong> at <strong>${matchedApt.time}</strong>. The time slot has been returned to availability.`;
    }
    
    return `I couldn't find a matching active appointment. Please make sure to specify the patient's name (e.g., "Cancel Robert's appointment").`;
  }
  
  return `Understood, doctor. I am processing your operations request. Let me know if you would like me to cancel an appointment, toggle shift hours, or add slots.`;
}

function appendCopilotMessageDirectly(text, sender, time) {
  const container = document.getElementById('copilot-messages');
  const wrapper = document.createElement('div');
  wrapper.className = `copilot-bubble-wrapper ${sender}`;
  const avatar = sender === 'bot' ? '🤖' : '👨‍⚕️';
  
  wrapper.innerHTML = `
    <div class="copilot-avatar-msg">${avatar}</div>
    <div>
      <div class="copilot-bubble">${text}</div>
      <span class="msg-time">${time}</span>
    </div>
  `;
  
  container.appendChild(wrapper);
  setupCopilotAutoscroll();
}

async function appendCopilotMessage(text, sender) {
  const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  appendCopilotMessageDirectly(text, sender, time);
  
  // Save messages to database
  const sessionId = `copilot-session-${currentDoctorId}`;
  await saveChatMessage(sessionId, { text, sender, time });
}

function showCopilotTyping() {
  const container = document.getElementById('copilot-messages');
  const indicator = document.createElement('div');
  indicator.className = 'typing-indicator';
  indicator.id = 'copilot-typing-bubble';
  indicator.style.marginLeft = '38px';
  indicator.innerHTML = `
    <div class="typing-dot"></div>
    <div class="typing-dot"></div>
    <div class="typing-dot"></div>
  `;
  container.appendChild(indicator);
  setupCopilotAutoscroll();
}

function hideCopilotTyping() {
  const indicator = document.getElementById('copilot-typing-bubble');
  if (indicator) indicator.remove();
}

function setupCopilotAutoscroll() {
  const container = document.getElementById('copilot-messages');
  container.scrollTop = container.scrollHeight;
}

async function clearCopilotChat() {
  const container = document.getElementById('copilot-messages');
  container.innerHTML = `
    <div class="copilot-bubble-wrapper bot">
      <div class="copilot-avatar-msg">🤖</div>
      <div>
        <div class="copilot-bubble">
          Co-pilot history reset. How can I help you manage your dashboard?
        </div>
        <span class="msg-time">Just now</span>
      </div>
    </div>
  `;
  
  // Clear session history on server
  const sessionId = `copilot-session-${currentDoctorId}`;
  await deleteChatHistory(sessionId);
  
  showToast("Co-pilot chat cleared", "success");
}

// Voice Recognition Mockup
function toggleCopilotVoice() {
  const btn = document.getElementById('copilot-voice-btn');
  voiceActive = !voiceActive;
  
  if (voiceActive) {
    btn.style.color = '#EF4444';
    btn.classList.add('pulse');
    showToast("Co-pilot voice channel active... Speak now.", "info");
    
    // Simulate speaking after 3s
    setTimeout(() => {
      if (voiceActive) {
        btn.removeAttribute('style');
        btn.classList.remove('pulse');
        voiceActive = false;
        sendCopilotCommand("Add slot for 06:00 PM");
      }
    }, 3200);
  } else {
    btn.removeAttribute('style');
    btn.classList.remove('pulse');
    showToast("Co-pilot voice listening deactivated", "info");
  }
}

// Toast notification handler
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
  
  // Auto-hide toast
  setTimeout(() => {
    container.classList.remove('active');
  }, 3500);
}

// Support cross-tab real-time sync for offline mode
window.addEventListener('storage', (e) => {
  if (e.key === 'vaiso_db') {
    loadDashboardData();
  }
});

// ==========================================
// CLINICAL PRESCRIPTION UTILITIES
// ==========================================

async function findPatientIdByName(name) {
  try {
    const list = await getPatients();
    const matched = list.find(p => p.name.toLowerCase() === name.toLowerCase());
    return matched ? matched.id : 'pat-1';
  } catch (err) {
    return 'pat-1';
  }
}

async function openPrescriptionModal(patientName, aptId) {
  const patId = await findPatientIdByName(patientName);
  document.getElementById('rx-patient-id').value = patId;
  document.getElementById('rx-patient-name').value = patientName;
  document.getElementById('rx-instructions').value = '';
  
  // Uncheck all drug options
  const checkboxes = document.querySelectorAll('input[name="rx-drugs"]');
  checkboxes.forEach(c => c.checked = false);
  
  document.getElementById('prescription-modal').classList.add('active');
}

function closePrescriptionModal() {
  document.getElementById('prescription-modal').classList.remove('active');
}

async function submitPrescription(event) {
  event.preventDefault();
  const patId = document.getElementById('rx-patient-id').value;
  const patName = document.getElementById('rx-patient-name').value;
  const instructions = document.getElementById('rx-instructions').value.trim();
  
  const selectedDrugs = [];
  const checkboxes = document.querySelectorAll('input[name="rx-drugs"]:checked');
  checkboxes.forEach(c => selectedDrugs.push(c.value));
  
  if (selectedDrugs.length === 0) {
    showToast("Please select at least one medication.", "error");
    return;
  }
  
  try {
    const result = await createPrescription(patId, currentDoctorId, selectedDrugs, instructions);
    if (result.success || result.prescription) {
      showToast(`Prescription dispatched for ${patName}!`, 'success');
      closePrescriptionModal();
      
      // Auto complete the appointment after prescription is written (nice user touch!)
      // Wait, is there a matching appointment we should complete? Let's check.
      // Yes, we could find the appointment and complete it or just let the doc mark it complete manually. Let's let them complete it manually or do it here. Manual is fine.
    }
  } catch (err) {
    showToast("Failed to write prescription: " + err.message, "error");
  }
}
