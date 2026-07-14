const API_BASE = (window.location.protocol === 'file:' || !window.location.host.includes('localhost:3000'))
  ? 'http://localhost:3000/api'
  : '/api';

// Offline fallback database template
const DEFAULT_DB = {
  doctors: [
    {
      id: "dr-mercer",
      name: "Alan Mercer",
      title: "Dr. Alan Mercer",
      specialty: "Cardiology",
      bio: "Senior Cardiologist with 15+ years experience in interventional cardiology and heart failure management.",
      avatar: "fa-solid fa-user-doctor",
      avatarBg: "#7000FF",
      available: true,
      hours: "09:00 AM - 05:00 PM",
      availableSlots: ["10:30 AM", "01:00 PM", "03:30 PM"],
      appointments: []
    },
    {
      id: "dr-reynolds",
      name: "Julia Reynolds",
      title: "Dr. Julia Reynolds",
      specialty: "Neurology",
      bio: "Consultant Neurologist specializing in neuro-oncology and cognitive disorders.",
      avatar: "fa-solid fa-user-md",
      avatarBg: "#10B981",
      available: true,
      hours: "10:00 AM - 04:00 PM",
      availableSlots: ["02:00 PM"],
      appointments: []
    },
    {
      id: "dr-carter",
      name: "Sarah Carter",
      title: "Dr. Sarah Carter",
      specialty: "Emergency Care",
      bio: "ER Director specializing in acute trauma care and critical emergency medicine.",
      avatar: "fa-solid fa-stethoscope",
      avatarBg: "#EF4444",
      available: true,
      hours: "08:00 AM - 08:00 PM",
      availableSlots: ["08:00 AM", "11:00 AM", "05:00 PM"],
      appointments: []
    }
  ],
  subscription: {
    activePlan: "",
    activeHospital: ""
  },
  chats: {},
  uploadedFiles: [],
  notifications: []
};

// Local storage database state management
let localDb = null;
function getLocalDb() {
  if (!localDb) {
    const data = localStorage.getItem('vaiso_db');
    if (data) {
      try {
        localDb = JSON.parse(data);
      } catch (e) {
        localDb = JSON.parse(JSON.stringify(DEFAULT_DB));
      }
    } else {
      localDb = JSON.parse(JSON.stringify(DEFAULT_DB));
      localStorage.setItem('vaiso_db', JSON.stringify(localDb));
    }
  }
  return localDb;
}

function saveLocalDb() {
  if (localDb) {
    localStorage.setItem('vaiso_db', JSON.stringify(localDb));
  }
}

// Global flag to track connection state
let isOffline = false;

// Wrapper helper to dynamically fall back to offline DB when server API is unavailable
async function executeApi(apiCall, fallbackCall) {
  if (isOffline) {
    return await fallbackCall();
  }
  try {
    return await apiCall();
  } catch (err) {
    console.warn("Vaisoverse API down or offline. Switching to client-side localStorage fallback database.", err);
    isOffline = true;
    return await fallbackCall();
  }
}

// In-app notifications generator (offline simulation)
function pushOfflineNotification(type, to, subject, body, icon) {
  const notif = {
    id: Date.now() + Math.floor(Math.random() * 1000),
    type,
    to,
    subject,
    body,
    icon,
    read: false,
    time: new Date().toISOString()
  };
  const db = getLocalDb();
  if (!db.notifications) db.notifications = [];
  db.notifications.push(notif);
  saveLocalDb();

  // Dispatch custom window event to alert front-end scripts (app.js)
  const event = new CustomEvent('offline_notification', { detail: notif });
  window.dispatchEvent(event);
}

// 1. Clinicians API calls
async function getDoctors() {
  return executeApi(
    async () => {
      const response = await fetch(`${API_BASE}/doctors`);
      if (!response.ok) throw new Error("HTTP " + response.status);
      return await response.json();
    },
    async () => {
      const db = getLocalDb();
      return db.doctors;
    }
  );
}

async function getDoctorById(id) {
  return executeApi(
    async () => {
      const response = await fetch(`${API_BASE}/doctors/${id}`);
      if (!response.ok) throw new Error("HTTP " + response.status);
      return await response.json();
    },
    async () => {
      const db = getLocalDb();
      return db.doctors.find(d => d.id === id) || null;
    }
  );
}

async function updateDoctorProfile(id, profileData) {
  return executeApi(
    async () => {
      const response = await fetch(`${API_BASE}/doctors/${id}/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profileData)
      });
      if (!response.ok) throw new Error("HTTP " + response.status);
      return await response.json();
    },
    async () => {
      const db = getLocalDb();
      const doc = db.doctors.find(d => d.id === id);
      if (doc) {
        Object.assign(doc, profileData);
        saveLocalDb();
      }
      return doc || { error: 'Clinician not found' };
    }
  );
}

async function setDoctorAvailabilityStatus(id, available) {
  return executeApi(
    async () => {
      const response = await fetch(`${API_BASE}/doctors/${id}/availability`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ available })
      });
      if (!response.ok) throw new Error("HTTP " + response.status);
      return await response.json();
    },
    async () => {
      const db = getLocalDb();
      const doc = db.doctors.find(d => d.id === id);
      if (doc) {
        doc.available = available;
        saveLocalDb();
      }
      return doc || { error: 'Clinician not found' };
    }
  );
}

async function addDoctorSlot(id, slot) {
  return executeApi(
    async () => {
      const response = await fetch(`${API_BASE}/doctors/${id}/slots`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slot })
      });
      if (!response.ok) throw new Error("HTTP " + response.status);
      return await response.json();
    },
    async () => {
      const db = getLocalDb();
      const doc = db.doctors.find(d => d.id === id);
      if (doc) {
        if (!doc.availableSlots.includes(slot)) {
          doc.availableSlots.push(slot);
          doc.availableSlots.sort();
          saveLocalDb();
        }
      }
      return doc || { error: 'Clinician not found' };
    }
  );
}

async function removeDoctorSlot(id, slot) {
  return executeApi(
    async () => {
      const response = await fetch(`${API_BASE}/doctors/${id}/slots/${encodeURIComponent(slot)}`, {
        method: 'DELETE'
      });
      if (!response.ok) throw new Error("HTTP " + response.status);
      return await response.json();
    },
    async () => {
      const db = getLocalDb();
      const doc = db.doctors.find(d => d.id === id);
      if (doc) {
        doc.availableSlots = doc.availableSlots.filter(s => s !== slot);
        saveLocalDb();
      }
      return doc || { error: 'Clinician not found' };
    }
  );
}

// Book a new patient appointment
async function createAppointment(doctorId, patientName, time, reason, phone, email) {
  return executeApi(
    async () => {
      const response = await fetch(`${API_BASE}/doctors/${doctorId}/appointments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patientName, time, reason, phone, email })
      });
      if (!response.ok) throw new Error("HTTP " + response.status);
      const result = await response.json();
      return result.appointment;
    },
    async () => {
      const db = getLocalDb();
      const index = db.doctors.findIndex(d => d.id === doctorId);
      if (index !== -1) {
        const doc = db.doctors[index];
        const refNumber = `VHC-${Date.now().toString().slice(-8).toUpperCase()}`;
        const docText = `VAISOVERSE Hospital & Healthcare Appointment Letter\n\nReference: ${refNumber}\nPatient: ${patientName}\nDoctor: ${doc.title}\nTime Slot: ${time}\nReason: ${reason || 'General checkup'}\nStatus: Confirmed`;
        const pdfUrl = `data:text/plain;charset=utf-8,${encodeURIComponent(docText)}`;

        const newApt = {
          id: "apt-" + Date.now(),
          patientName,
          time,
          reason: reason || "General consultation",
          status: "scheduled",
          pdfUrl: pdfUrl
        };
        
        doc.appointments.push(newApt);
        doc.availableSlots = doc.availableSlots.filter(s => s !== time);
        saveLocalDb();

        const aptSummaryHtml = `<br><br>
          <div style="background:rgba(0,82,255,0.04);border:1px solid rgba(0,82,255,0.15);padding:14px;border-radius:8px;font-size:13px;line-height:1.5;color:#1e293b">
            <strong>Booking Summary:</strong><br>
            • Doctor: <strong>${doc.title}</strong><br>
            • Time: <strong>${time}</strong><br>
            • Complaint: <strong>${reason || 'General checkup'}</strong>
          </div>`;

        if (phone) {
          pushOfflineNotification('confirmation', phone,
            '✅ Appointment Confirmed — Vaisoverse Hospital',
            `Dear <strong>${patientName}</strong>, your appointment has been confirmed!${aptSummaryHtml}`,
            '✅'
          );
        }
        if (email) {
          pushOfflineNotification('confirmation', email,
            '✅ Appointment Confirmed — Vaisoverse Hospital',
            `Dear <strong>${patientName}</strong>, your appointment has been confirmed!${aptSummaryHtml}`,
            '📧'
          );
        }

        window.dispatchEvent(new CustomEvent('appointments_updated', { detail: { doctorId, doctor: doc } }));
        window.dispatchEvent(new CustomEvent('doctors_updated', { detail: doc }));

        return newApt;
      }
      throw new Error("Doctor not found");
    }
  );
}

// Cancel or Complete appointment
async function updateAppointmentStatus(doctorId, appointmentId, status) {
  return executeApi(
    async () => {
      const response = await fetch(`${API_BASE}/doctors/${doctorId}/appointments/${appointmentId}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      if (!response.ok) throw new Error("HTTP " + response.status);
      return await response.json();
    },
    async () => {
      const db = getLocalDb();
      const doc = db.doctors.find(d => d.id === doctorId);
      if (doc) {
        const apt = doc.appointments.find(a => a.id === appointmentId);
        if (apt) {
          apt.status = status;
          saveLocalDb();
        }
      }
      return doc || { error: 'Clinician not found' };
    }
  );
}

// 2. Subscription plans API calls
async function fetchSubscription() {
  return executeApi(
    async () => {
      const response = await fetch(`${API_BASE}/subscription`);
      if (!response.ok) throw new Error("HTTP " + response.status);
      return await response.json();
    },
    async () => {
      const db = getLocalDb();
      return db.subscription;
    }
  );
}

async function saveSubscription(activePlan, activeHospital) {
  return executeApi(
    async () => {
      const response = await fetch(`${API_BASE}/subscription`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activePlan, activeHospital })
      });
      if (!response.ok) throw new Error("HTTP " + response.status);
      return await response.json();
    },
    async () => {
      const db = getLocalDb();
      db.subscription = { activePlan, activeHospital };
      saveLocalDb();
      return db.subscription;
    }
  );
}

// 3. Persistent chats API calls
async function fetchChatHistory(sessionId) {
  return executeApi(
    async () => {
      const response = await fetch(`${API_BASE}/chat/${sessionId}`);
      if (!response.ok) throw new Error("HTTP " + response.status);
      return await response.json();
    },
    async () => {
      const db = getLocalDb();
      return db.chats[sessionId] || [];
    }
  );
}

async function saveChatMessage(sessionId, message) {
  return executeApi(
    async () => {
      const response = await fetch(`${API_BASE}/chat/${sessionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message })
      });
      if (!response.ok) throw new Error("HTTP " + response.status);
      return await response.json();
    },
    async () => {
      const db = getLocalDb();
      if (!db.chats[sessionId]) {
        db.chats[sessionId] = [];
      }
      db.chats[sessionId].push(message);
      saveLocalDb();
      return db.chats[sessionId];
    }
  );
}

async function deleteChatHistory(sessionId) {
  return executeApi(
    async () => {
      const response = await fetch(`${API_BASE}/chat/${sessionId}`, { method: 'DELETE' });
      if (!response.ok) throw new Error("HTTP " + response.status);
      return await response.json();
    },
    async () => {
      const db = getLocalDb();
      db.chats[sessionId] = [];
      saveLocalDb();
      return [];
    }
  );
}

// 4. Lab report verification
async function verifySecurityCode(code) {
  return executeApi(
    async () => {
      const response = await fetch(`${API_BASE}/reports/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code })
      });
      if (!response.ok) throw new Error("HTTP " + response.status);
      return await response.json();
    },
    async () => {
      if (code === '123456') {
        return {
          success: true,
          patient: "John Doe",
          date: "2026-07-01",
          diagnostics: [
            { test: "Complete Blood Count (CBC)", status: "Normal", remarks: "WBC and RBC values within standard range." },
            { test: "Electrocardiogram (ECG)", status: "Minor Anomaly", remarks: "Detected mild sinus arrhythmia, no critical risk." },
            { test: "Lipid Panel", status: "Borderline High", remarks: "LDL Cholesterol: 135 mg/dL. Low-fat diet advised." }
          ]
        };
      } else if (code === '999999') {
        return {
          success: true,
          patient: "Jane Smith",
          date: "2026-07-03",
          diagnostics: [
            { test: "Basic Metabolic Panel (BMP)", status: "Normal", remarks: "Electrolytes and kidney function metrics clear." },
            { test: "Cardiac Troponin T", status: "Critical Check", remarks: "Valued at <0.01 ng/mL. Normal range cardiosignatures." }
          ]
        };
      } else {
        return {
          success: false,
          error: "Invalid 6-digit Patient Security Code. Please try '123456' or '999999' to query clinical records."
        };
      }
    }
  );
}

// 4a. Contact Verification
let offlineOtpStore = {};

async function sendVerificationCode(email, phone) {
  return executeApi(
    async () => {
      const response = await fetch(`${API_BASE}/verification/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, phone })
      });
      if (!response.ok) throw new Error("HTTP " + response.status);
      return await response.json();
    },
    async () => {
      const otp = phone === '555' ? '1234' : Math.floor(1000 + Math.random() * 9000).toString();
      offlineOtpStore[phone] = otp;
      
      console.log(`[Offline Fallback OTP] Your verification code is: ${otp}`);

      return {
        success: true,
        message: 'OTP sent via in-app notification',
        devOtp: otp
      };
    }
  );
}

async function verifyCode(phone, code) {
  return executeApi(
    async () => {
      const response = await fetch(`${API_BASE}/verification/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, code })
      });
      if (!response.ok) throw new Error("HTTP " + response.status);
      return await response.json();
    },
    async () => {
      if (offlineOtpStore[phone] && offlineOtpStore[phone] === code) {
        delete offlineOtpStore[phone];
        return { success: true };
      }
      return { success: false, error: 'Invalid verification code' };
    }
  );
}

// 5. File uploading APIs
async function uploadPatientFile(file) {
  return executeApi(
    async () => {
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await fetch(`${API_BASE}/uploads/patient`, {
        method: 'POST',
        body: formData
      });
      if (!response.ok) throw new Error("HTTP " + response.status);
      return await response.json();
    },
    async () => {
      const fileMeta = {
        id: "file-" + Date.now(),
        name: file.name,
        filename: file.name,
        size: file.size,
        type: file.type,
        uploadTime: new Date().toISOString(),
        url: URL.createObjectURL(file)
      };
      const db = getLocalDb();
      if (!db.uploadedFiles) db.uploadedFiles = [];
      db.uploadedFiles.push(fileMeta);
      saveLocalDb();
      return fileMeta;
    }
  );
}

async function fetchUploadedFiles() {
  return executeApi(
    async () => {
      const response = await fetch(`${API_BASE}/uploads/patient`);
      if (!response.ok) throw new Error("HTTP " + response.status);
      return await response.json();
    },
    async () => {
      const db = getLocalDb();
      return db.uploadedFiles || [];
    }
  );
}

// 6. Notification APIs
async function fetchNotifications() {
  return executeApi(
    async () => {
      const response = await fetch(`${API_BASE}/notifications`);
      if (!response.ok) throw new Error("HTTP " + response.status);
      return await response.json();
    },
    async () => {
      const db = getLocalDb();
      return db.notifications || [];
    }
  );
}

async function markNotificationRead(id) {
  return executeApi(
    async () => {
      const response = await fetch(`${API_BASE}/notifications/${id}/read`, { method: 'PUT' });
      if (!response.ok) throw new Error("HTTP " + response.status);
      return await response.json();
    },
    async () => {
      const db = getLocalDb();
      if (db.notifications) {
        const notif = db.notifications.find(n => n.id === id);
        if (notif) notif.read = true;
        saveLocalDb();
      }
      return { success: true };
    }
  );
}

async function deleteNotification(id) {
  return executeApi(
    async () => {
      const response = await fetch(`${API_BASE}/notifications/${id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error("HTTP " + response.status);
      return await response.json();
    },
    async () => {
      const db = getLocalDb();
      if (db.notifications) {
        db.notifications = db.notifications.filter(n => n.id !== id);
        saveLocalDb();
      }
      return { success: true };
    }
  );
}

async function clearAllNotificationsApi() {
  return executeApi(
    async () => {
      const response = await fetch(`${API_BASE}/notifications`, { method: 'DELETE' });
      if (!response.ok) throw new Error("HTTP " + response.status);
      return await response.json();
    },
    async () => {
      const db = getLocalDb();
      db.notifications = [];
      saveLocalDb();
      return { success: true };
    }
  );
}
