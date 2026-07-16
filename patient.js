// Active state
let currentPatientId = 'pat-1';
let selectedSlot = null;
let companionEventSource = null;

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', async () => {
  // Session check
  const session = sessionStorage.getItem('vaiso_session');
  if (session) {
    const user = JSON.parse(session);
    if (user.role === 'patient') {
      currentPatientId = user.id;
    }
  }

  // Sync select dropdown with current selection
  const select = document.getElementById('active-patient-select');
  if (select) {
    select.value = currentPatientId;
  }
  
  // Initial load
  await loadPatientDashboard();
  
  // Drag and drop setup for reports
  setupDragAndDrop();
});

// Logout handler
function handleLogout() {
  sessionStorage.removeItem('vaiso_session');
  window.location.href = 'index.html';
}

// Switch active patient profile
async function handlePatientSwitch(patientId) {
  currentPatientId = patientId;
  await loadPatientDashboard();
  const patient = await getPatientById(patientId);
  showToast(`Switched profile to ${patient.name}`, 'success');
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

// Load and render all details for the active patient
async function loadPatientDashboard() {
  try {
    const patient = await getPatientById(currentPatientId);
    if (!patient) return;

    // 1. Header Greeting
    const greetingEl = document.getElementById('patient-greeting');
    if (greetingEl) {
      greetingEl.innerHTML = `<i class="fa-solid fa-user-injured" style="color:#10B981"></i> Welcome, ${patient.name}`;
    }

    // 2. Sidebar Snapshot Card
    document.getElementById('snapshot-name').innerText = patient.name;
    document.getElementById('snapshot-meta').innerText = `Age: ${patient.age} | ${patient.gender}`;
    document.getElementById('snapshot-blood').innerText = patient.bloodGroup;

    // 3. Stats and Tables
    // Cross-reference doctor appointments to find this patient's consultations
    const doctorsList = await getDoctors();
    let patientApts = [];
    doctorsList.forEach(doc => {
      if (doc.appointments) {
        doc.appointments.forEach(apt => {
          if (apt.patientName.toLowerCase() === patient.name.toLowerCase()) {
            patientApts.push({
              ...apt,
              doctorId: doc.id,
              doctorTitle: doc.title,
              doctorSpecialty: doc.specialty
            });
          }
        });
      }
    });

    // Render stats
    document.getElementById('stat-total-apts').innerText = patientApts.length;
    document.getElementById('stat-active-meds').innerText = patient.activeMedications ? patient.activeMedications.length : 0;
    
    // Fetch uploaded files log count
    const files = await fetchUploadedFiles();
    document.getElementById('stat-total-reports').innerText = (patient.records ? patient.records.length : 0) + files.length;

    // Render Appointments Table
    renderAppointmentsTable(patientApts);

    // Render Medications
    renderMedications(patient.activeMedications);

    // Render Records
    renderRecordsList(patient.records || [], files);

    // Load Doctor selector options
    populateDoctorSelect(doctorsList);

  } catch (err) {
    console.error("Dashboard error:", err);
  }
}

// Render appointments table
function renderAppointmentsTable(apts) {
  const tbody = document.getElementById('appointments-tbody');
  tbody.innerHTML = '';
  
  const activeApts = apts.filter(a => a.status === 'scheduled');
  document.getElementById('table-subtitle-count').innerText = `Active Scheduled: ${activeApts.length} (Total: ${apts.length})`;
  
  if (apts.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" style="text-align: center; padding: 30px 0;">
          <div class="dash-empty-icon" style="color:var(--text-muted); font-size: 24px;"><i class="fa-regular fa-calendar-xmark"></i></div>
          <p style="color: var(--text-muted); margin-top: 10px; font-size:13px;">No medical consultations booked yet.</p>
        </td>
      </tr>
    `;
    return;
  }

  // Sort chronologically
  const sorted = [...apts].sort((a, b) => {
    if (a.status === 'scheduled' && b.status !== 'scheduled') return -1;
    if (a.status !== 'scheduled' && b.status === 'scheduled') return 1;
    return a.time.localeCompare(b.time);
  });

  sorted.forEach(apt => {
    let statusClass = 'status-badge-scheduled';
    let statusText = 'Scheduled';
    
    if (apt.status === 'completed') {
      statusClass = 'status-badge-completed';
      statusText = 'Completed';
    } else if (apt.status === 'cancelled') {
      statusClass = 'status-badge-cancelled';
      statusText = 'Cancelled';
    }

    let actionHtml = '';
    if (apt.status === 'scheduled') {
      actionHtml = `
        <button class="btn-action-danger" onclick="cancelAppointment('${apt.doctorId}', '${apt.id}')" title="Cancel Appointment">
          <i class="fa-solid fa-calendar-xmark"></i>
        </button>
      `;
    } else {
      actionHtml = `<span style="font-size:11px; color:var(--text-muted);">None</span>`;
    }

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${apt.doctorTitle}</strong><br><span style="font-size:11px; color:var(--text-muted);">${apt.doctorSpecialty}</span></td>
      <td><span class="time-slot-tag"><i class="fa-regular fa-clock"></i> ${apt.time}</span></td>
      <td>${apt.reason}</td>
      <td><span class="status-badge ${statusClass}">${statusText}</span></td>
      <td>${actionHtml}</td>
    `;
    tbody.appendChild(tr);
  });
}

// Cancel appointment
async function cancelAppointment(doctorId, aptId) {
  if (confirm("Are you sure you want to cancel this appointment?")) {
    try {
      await updateAppointmentStatus(doctorId, aptId, 'cancelled');
      showToast("Appointment successfully canceled.", "success");
      await loadPatientDashboard();
    } catch (err) {
      showToast("Failed to cancel appointment.", "error");
    }
  }
}

// Render active medications
function renderMedications(meds) {
  const container = document.getElementById('medications-list');
  container.innerHTML = '';
  
  if (!meds || meds.length === 0) {
    container.innerHTML = `
      <div style="text-align:center; padding: 20px 0; color:var(--text-muted); font-size:12px;">
        No active medications listed.
      </div>
    `;
    return;
  }
  
  meds.forEach(med => {
    const div = document.createElement('div');
    div.style = 'background: rgba(16, 185, 129, 0.04); border: 1px solid rgba(16, 185, 129, 0.15); padding: 10px 14px; border-radius: var(--radius-sm); display: flex; align-items: center; gap: 10px; font-size: 13px; color: var(--text-primary);';
    div.innerHTML = `
      <i class="fa-solid fa-circle-check" style="color:#10B981"></i>
      <div>
        <strong>${med}</strong>
      </div>
    `;
    container.appendChild(div);
  });
}

// Render records list
function renderRecordsList(records, uploadedFiles) {
  const container = document.getElementById('reports-list-container');
  container.innerHTML = '';
  
  if (records.length === 0 && uploadedFiles.length === 0) {
    container.innerHTML = `
      <div style="text-align:center; padding:40px 0; color:var(--text-muted); font-size:13px;">
        <i class="fa-regular fa-folder-open" style="font-size:24px; color:var(--text-muted)"></i>
        <p style="margin-top:8px">No clinical records loaded.</p>
      </div>
    `;
    return;
  }
  
  // Render default diagnostic records
  records.forEach(rec => {
    const item = document.createElement('div');
    item.style = 'background: rgba(59, 130, 246, 0.04); border: 1px solid rgba(59, 130, 246, 0.1); border-radius: var(--radius-sm); padding: 10px 14px; display:flex; justify-content:space-between; align-items:center;';
    item.innerHTML = `
      <div>
        <strong style="font-size:13px; color:var(--text-primary);">${rec.test}</strong>
        <p style="font-size:11px; color:var(--text-muted); margin:2px 0 0 0;">Date: ${rec.date} | Remarks: ${rec.remarks}</p>
      </div>
      <span class="status-badge status-badge-completed" style="font-size:10px;">${rec.status}</span>
    `;
    container.appendChild(item);
  });

  // Render uploaded PDF files
  uploadedFiles.forEach(file => {
    const item = document.createElement('div');
    item.style = 'background: rgba(112, 0, 255, 0.04); border: 1px solid rgba(112, 0, 255, 0.1); border-radius: var(--radius-sm); padding: 10px 14px; display:flex; justify-content:space-between; align-items:center;';
    item.innerHTML = `
      <div>
        <strong style="font-size:13px; color:var(--text-primary);"><i class="fa-solid fa-file-pdf" style="color:#ef4444"></i> ${file.name}</strong>
        <p style="font-size:11px; color:var(--text-muted); margin:2px 0 0 0;">Uploaded: ${new Date(file.uploadTime).toLocaleDateString()} | Size: ${(file.size/1024).toFixed(1)} KB</p>
      </div>
      <a href="${file.url}" target="_blank" class="btn btn-ghost" style="padding:4px 8px; font-size:11px; border:1px solid var(--border-color)"><i class="fa-solid fa-eye"></i> View</a>
    `;
    container.appendChild(item);
  });
}

// Populate doctor select element
function populateDoctorSelect(doctors) {
  const select = document.getElementById('booking-doctor');
  // Retain first placeholder option
  select.innerHTML = '<option value="" disabled selected>Choose a physician...</option>';
  
  doctors.forEach(doc => {
    if (doc.available) {
      const option = document.createElement('option');
      option.value = doc.id;
      option.text = `${doc.title} (${doc.specialty})`;
      select.add(option);
    }
  });
}

// Load doctor slots as pills
async function loadDoctorSlots(doctorId) {
  const container = document.getElementById('slots-pills-container');
  container.innerHTML = '<div style="color:var(--text-muted); font-size:13px;"><i class="fa-solid fa-spinner fa-spin"></i> Fetching available slots...</div>';
  selectedSlot = null;
  
  try {
    const doc = await getDoctorById(doctorId);
    container.innerHTML = '';
    
    if (!doc.availableSlots || doc.availableSlots.length === 0) {
      container.innerHTML = '<div style="color:var(--color-danger); font-size:13px; font-style:italic;">No slots available today. Please choose another doctor.</div>';
      return;
    }
    
    const grid = document.createElement('div');
    grid.style = 'display:grid; grid-template-columns: repeat(4, 1fr); gap:8px; width:100%;';
    
    doc.availableSlots.forEach(slot => {
      const pill = document.createElement('div');
      pill.className = 'slot-pill';
      pill.style = 'border:1px solid var(--border-color); border-radius: var(--radius-sm); padding:6px; text-align:center; font-size:12px; cursor:pointer; font-weight:500; transition:all 0.2s ease; background:#fff;';
      pill.innerHTML = `<i class="fa-regular fa-clock"></i> ${slot}`;
      pill.onclick = () => {
        // Clear active slots styles
        const pills = container.querySelectorAll('.slot-pill');
        pills.forEach(p => {
          p.style.borderColor = 'var(--border-color)';
          p.style.background = '#fff';
          p.style.color = 'var(--text-primary)';
        });
        // Select this one
        pill.style.borderColor = 'var(--color-accent)';
        pill.style.background = 'rgba(59, 130, 246, 0.08)';
        pill.style.color = 'var(--color-accent)';
        selectedSlot = slot;
      };
      grid.appendChild(pill);
    });
    container.appendChild(grid);
  } catch (err) {
    container.innerHTML = '<div style="color:var(--color-danger); font-size:13px;">Error loading slots.</div>';
  }
}

// Book appointment
async function submitBooking(event) {
  event.preventDefault();
  const doctorId = document.getElementById('booking-doctor').value;
  const reason = document.getElementById('booking-reason').value.trim();
  
  if (!doctorId) {
    showToast("Please choose a physician specialist.", "error");
    return;
  }
  if (!selectedSlot) {
    showToast("Please select an available time slot.", "error");
    return;
  }
  
  try {
    const patient = await getPatientById(currentPatientId);
    showToast("Dispatching booking request...", "info");
    
    const apt = await createAppointment(
      doctorId,
      patient.name,
      selectedSlot,
      reason,
      patient.phone,
      patient.email
    );
    
    if (apt) {
      showToast("Appointment Confirmed & Dispatched!", "success");
      // Reset form fields
      document.getElementById('booking-reason').value = '';
      document.getElementById('booking-doctor').value = '';
      document.getElementById('slots-pills-container').innerHTML = '<div style="color:var(--text-muted); font-size:13px; font-style:italic;">Please select a doctor to load availability.</div>';
      selectedSlot = null;
      
      // Reload and go back to overview tab
      await loadPatientDashboard();
      switchTab('overview');
    }
  } catch (err) {
    showToast("Failed to book consultation: " + err.message, "error");
  }
}

// Drag & Drop Setup
function setupDragAndDrop() {
  const dropzone = document.getElementById('report-dropzone');
  
  ['dragenter', 'dragover'].forEach(eventName => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      dropzone.style.borderColor = 'var(--color-accent)';
      dropzone.style.background = 'rgba(59, 130, 246, 0.04)';
    }, false);
  });
  
  ['dragleave', 'drop'].forEach(eventName => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      dropzone.style.borderColor = 'var(--border-color)';
      dropzone.style.background = 'rgba(255,255,255,0.4)';
    }, false);
  });
  
  dropzone.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    const files = dt.files;
    handleReportUpload(files);
  });
}

// File Upload Handler
async function handleReportUpload(files) {
  if (files.length === 0) return;
  const file = files[0];
  
  showToast("Uploading medical record...", "info");
  
  try {
    const result = await uploadPatientFile(file);
    if (result) {
      showToast(`Uploaded ${result.name} successfully!`, "success");
      await loadPatientDashboard();
    }
  } catch (err) {
    showToast("File upload failed: " + err.message, "error");
  }
}

// ==========================================
// AI HEALTH COMPANION CHATBOT
// ==========================================

function handleCompanionKeypress(event) {
  if (event.key === 'Enter') {
    sendCompanionMessage();
  }
}

async function sendCompanionMessage() {
  const input = document.getElementById('companion-input');
  const text = input.value.trim();
  if (!text) return;
  
  input.value = '';
  appendCompanionBubble(text, 'user');
  showCompanionTyping();
  
  setTimeout(async () => {
    hideCompanionTyping();
    const reply = await getCompanionResponse(text);
    appendCompanionBubble(reply, 'bot');
  }, 1000);
}

async function sendCompanionCommand(cmd) {
  appendCompanionBubble(cmd, 'user');
  showCompanionTyping();
  
  setTimeout(async () => {
    hideCompanionTyping();
    const reply = await getCompanionResponse(cmd);
    appendCompanionBubble(reply, 'bot');
  }, 800);
}

function appendCompanionBubble(text, sender) {
  const container = document.getElementById('companion-messages');
  const wrapper = document.createElement('div');
  wrapper.className = `copilot-bubble-wrapper ${sender}`;
  const avatar = sender === 'bot' ? '🏥' : '👤';
  
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

function showCompanionTyping() {
  const container = document.getElementById('companion-messages');
  const indicator = document.createElement('div');
  indicator.className = 'typing-indicator';
  indicator.id = 'companion-typing-bubble';
  indicator.style.marginLeft = '38px';
  indicator.innerHTML = `
    <div class="typing-dot"></div>
    <div class="typing-dot"></div>
    <div class="typing-dot"></div>
  `;
  container.appendChild(indicator);
  container.scrollTop = container.scrollHeight;
}

function hideCompanionTyping() {
  const ind = document.getElementById('companion-typing-bubble');
  if (ind) ind.remove();
}

function clearCompanionChat() {
  const container = document.getElementById('companion-messages');
  container.innerHTML = `
    <div class="copilot-bubble-wrapper bot">
      <div class="copilot-avatar-msg">🏥</div>
      <div>
        <div class="copilot-bubble">
          Chat history cleared. How can I help you manage your clinical health records?
        </div>
        <span class="msg-time">Just now</span>
      </div>
    </div>
  `;
  showToast("Health Companion chat reset", "success");
}

async function getCompanionResponse(query) {
  const patient = await getPatientById(currentPatientId);
  const lower = query.toLowerCase();
  
  if (lower.includes('medication') || lower.includes('medicine') || lower.includes('pills') || lower.includes('taking')) {
    if (patient.activeMedications && patient.activeMedications.length > 0) {
      return `You are currently taking: <strong style="color:var(--color-success)">${patient.activeMedications.join(', ')}</strong>. Please follow the instructions written on your prescriptions closely.`;
    }
    return `You have no active medications listed in your records.`;
  }
  
  if (lower.includes('appointment') || lower.includes('consultation') || lower.includes('doctor') || lower.includes('schedule')) {
    const docs = await getDoctors();
    let apts = [];
    docs.forEach(d => {
      d.appointments.forEach(a => {
        if (a.patientName.toLowerCase() === patient.name.toLowerCase() && a.status === 'scheduled') {
          apts.push(`• <strong>${d.title}</strong> at <strong>${a.time}</strong> for <em>${a.reason}</em>`);
        }
      });
    });
    if (apts.length > 0) {
      return `You have the following upcoming consultations scheduled:<br><br>${apts.join('<br>')}`;
    }
    return `You have no upcoming consultations scheduled. You can book one under the "Book Consultation" tab!`;
  }

  if (lower.includes('report') || lower.includes('lab') || lower.includes('test') || lower.includes('blood') || lower.includes('lipid')) {
    return `Your latest <strong>Lipid Panel</strong> from 2026-07-01 shows all metrics within normal limits (Total Cholesterol < 200 mg/dL, HDL > 50 mg/dL). No anomalies were flagged.`;
  }

  return `Understood. I am monitoring your vital logs and health files. If you feel acute pain or emergency symptoms, please call emergency services immediately or visit the Emergency Care department led by Dr. Carter.`;
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
