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
  notifications: [],
  patients: [
    {
      id: "pat-1",
      name: "Robert Dowson",
      username: "dowson",
      password: "password",
      age: 45,
      gender: "Male",
      bloodGroup: "A+",
      phone: "5551234",
      email: "robert@vaisoverse.com",
      activeMedications: ["Atorvastatin 20mg", "Lisinopril 10mg"],
      records: [
        { date: "2026-07-01", test: "Lipid Panel", status: "Normal", remarks: "Cholesterol levels within optimal range." }
      ]
    },
    {
      id: "pat-2",
      name: "Emily Watson",
      username: "watson",
      password: "password",
      age: 32,
      gender: "Female",
      bloodGroup: "O-",
      phone: "5555678",
      email: "emily@vaisoverse.com",
      activeMedications: ["Ibuprofen 400mg"],
      records: [
        { date: "2026-07-03", test: "Basic Metabolic Panel (BMP)", status: "Normal", remarks: "Electrolytes clear." }
      ]
    },
    {
      id: "pat-3",
      name: "David Miller",
      username: "miller",
      password: "password",
      age: 58,
      gender: "Male",
      bloodGroup: "B+",
      phone: "5559012",
      email: "david@vaisoverse.com",
      activeMedications: ["Sumatriptan 50mg"],
      records: [
        { date: "2026-07-05", test: "ECG (Electrocardiogram)", status: "Check Required", remarks: "Slight rhythm asymmetry noted." }
      ]
    }
  ],
  pharmacyInventory: [
    { name: "Atorvastatin 20mg", stock: 150, threshold: 50, price: 15.00 },
    { name: "Lisinopril 10mg", stock: 200, threshold: 50, price: 8.50 },
    { name: "Ibuprofen 400mg", stock: 45, threshold: 60, price: 5.00 },
    { name: "Amoxicillin 500mg", stock: 120, threshold: 40, price: 12.00 },
    { name: "Sumatriptan 50mg", stock: 80, threshold: 20, price: 22.00 },
    { name: "Topiramate 25mg", stock: 15, threshold: 30, price: 18.50 }
  ],
  prescriptions: [
    {
      id: "rx-1",
      patientId: "pat-1",
      patientName: "Robert Dowson",
      doctorId: "dr-mercer",
      doctorName: "Dr. Alan Mercer",
      date: "2026-07-15",
      drugs: ["Atorvastatin 20mg - Once daily", "Lisinopril 10mg - Once daily"],
      instructions: "Take Atorvastatin at night and Lisinopril in the morning. Monitor blood pressure.",
      status: "Pending"
    },
    {
      id: "rx-2",
      patientId: "pat-2",
      patientName: "Emily Watson",
      doctorId: "dr-carter",
      doctorName: "Dr. Sarah Carter",
      date: "2026-07-16",
      drugs: ["Ibuprofen 400mg - As needed"],
      instructions: "Take with food for pain relief. Maximum 3 times a day.",
      status: "Dispensed"
    }
  ]
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

// ==========================================
// PORTAL AUTHENTICATION & DATA LAYER APIS
// ==========================================

// Authenticate user
async function authenticateUser(username, password, role) {
  return executeApi(
    async () => {
      const response = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, role })
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Authentication failed");
      }
      return await response.json();
    },
    async () => {
      const db = getLocalDb();
      const lowerUser = username.toLowerCase();
      if (role === 'doctor') {
        const doc = db.doctors.find(d => 
          d.id.toLowerCase().includes(lowerUser) || 
          d.name.toLowerCase().includes(lowerUser)
        );
        if (doc && password === 'password') {
          return {
            success: true,
            user: { id: doc.id, name: doc.title, role: 'doctor', specialty: doc.specialty }
          };
        }
      } else if (role === 'patient') {
        const patient = db.patients.find(p => p.username.toLowerCase() === lowerUser);
        if (patient && password === 'password') {
          return {
            success: true,
            user: { id: patient.id, name: patient.name, role: 'patient', age: patient.age, gender: patient.gender, bloodGroup: patient.bloodGroup }
          };
        }
      } else if (role === 'pharmacy') {
        if ((lowerUser === 'pharmacy' || lowerUser === 'wellness') && password === 'password') {
          return {
            success: true,
            user: {
              id: lowerUser === 'pharmacy' ? 'central-pharmacy' : 'wellness-pharmacy',
              name: lowerUser === 'pharmacy' ? 'Vaisoverse Central Pharmacy' : 'City Wellness Pharmacy',
              role: 'pharmacy',
              license: lowerUser === 'pharmacy' ? 'PH-2026-9876' : 'PH-2026-4321'
            }
          };
        }
      }
      throw new Error("Invalid username or password (offline mode)");
    }
  );
}

// Register a new patient
async function registerUser(patientData) {
  return executeApi(
    async () => {
      const response = await fetch(`${API_BASE}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patientData)
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Registration failed");
      }
      return await response.json();
    },
    async () => {
      const db = getLocalDb();
      const lowerUser = patientData.username.toLowerCase();
      
      const usernameTaken = db.patients.some(p => p.username.toLowerCase() === lowerUser) || 
                            db.doctors.some(d => d.id.toLowerCase() === lowerUser);
      if (usernameTaken) {
        throw new Error("Username is already taken.");
      }

      const newPatient = {
        id: "pat-" + Date.now(),
        name: patientData.name,
        username: patientData.username,
        password: patientData.password,
        age: parseInt(patientData.age),
        gender: patientData.gender,
        bloodGroup: patientData.bloodGroup,
        phone: patientData.phone,
        email: patientData.email,
        activeMedications: [],
        records: []
      };

      db.patients.push(newPatient);
      saveLocalDb();

      return {
        success: true,
        user: {
          id: newPatient.id,
          name: newPatient.name,
          role: 'patient',
          age: newPatient.age,
          gender: newPatient.gender,
          bloodGroup: newPatient.bloodGroup
        }
      };
    }
  );
}


// Register a new doctor
async function registerDoctor(docData) {
  return executeApi(
    async () => {
      const response = await fetch(`${API_BASE}/auth/register/doctor`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(docData)
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Doctor registration failed');
      }
      return await response.json();
    },
    async () => {
      const db = getLocalDb();
      const lowerUser = docData.username.toLowerCase();
      if (db.doctors.some(d => d.id.toLowerCase() === lowerUser) ||
          db.patients.some(p => p.username.toLowerCase() === lowerUser)) {
        throw new Error('Username is already taken.');
      }
      const newId = lowerUser.replace(/\s+/g, '-') + '-' + Date.now();
      const newDoc = {
        id: newId, title: 'Dr. ' + docData.name, name: 'Dr. ' + docData.name,
        username: docData.username, password: docData.password,
        specialty: docData.specialty || 'General Physician',
        qualification: docData.qualification || 'MBBS',
        experience: parseInt(docData.experience) || 0,
        consultFee: parseInt(docData.consultFee) || 50,
        email: docData.email, phone: docData.phone,
        rating: 4.5, reviews: 0, available: true,
        slots: ['09:00 AM','10:00 AM','11:00 AM','02:00 PM','03:00 PM','04:00 PM'],
        appointments: []
      };
      db.doctors.push(newDoc);
      saveLocalDb();
      return { success: true, user: { id: newDoc.id, name: newDoc.title, role: 'doctor', specialty: newDoc.specialty } };
    }
  );
}

// Register a new pharmacy
async function registerPharmacy(pharmaData) {
  return executeApi(
    async () => {
      const response = await fetch(`${API_BASE}/auth/register/pharmacy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pharmaData)
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Pharmacy registration failed');
      }
      return await response.json();
    },
    async () => {
      const db = getLocalDb();
      const lowerUser = pharmaData.username.toLowerCase();
      if (db.doctors.some(d => d.id.toLowerCase() === lowerUser) ||
          db.patients.some(p => p.username.toLowerCase() === lowerUser)) {
        throw new Error('Username is already taken.');
      }
      const newId = 'pharma-' + Date.now();
      if (!db.pharmacies) db.pharmacies = [];
      db.pharmacies.push({ id: newId, ...pharmaData });
      saveLocalDb();
      return { success: true, user: { id: newId, name: pharmaData.pharmacyName, role: 'pharmacy', license: pharmaData.license } };
    }
  );
}

// Get all patients
async function getPatients() {
  return executeApi(
    async () => {
      const response = await fetch(`${API_BASE}/patients`);
      if (!response.ok) throw new Error("HTTP " + response.status);
      return await response.json();
    },
    async () => {
      const db = getLocalDb();
      return db.patients || [];
    }
  );
}

// Get patient by id
async function getPatientById(id) {
  return executeApi(
    async () => {
      const response = await fetch(`${API_BASE}/patients/${id}`);
      if (!response.ok) throw new Error("HTTP " + response.status);
      return await response.json();
    },
    async () => {
      const db = getLocalDb();
      const patient = db.patients.find(p => p.id === id);
      if (!patient) throw new Error("Patient not found offline");
      return patient;
    }
  );
}

// Get prescriptions
async function getPrescriptions(patientId = null) {
  return executeApi(
    async () => {
      let url = `${API_BASE}/prescriptions`;
      if (patientId) url += `?patientId=${patientId}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error("HTTP " + response.status);
      return await response.json();
    },
    async () => {
      const db = getLocalDb();
      let list = db.prescriptions || [];
      if (patientId) {
        list = list.filter(r => r.patientId === patientId);
      }
      return list;
    }
  );
}

// Create prescription
async function createPrescription(patientId, doctorId, drugs, instructions) {
  return executeApi(
    async () => {
      const response = await fetch(`${API_BASE}/prescriptions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patientId, doctorId, drugs, instructions })
      });
      if (!response.ok) throw new Error("HTTP " + response.status);
      return await response.json();
    },
    async () => {
      const db = getLocalDb();
      const patient = db.patients.find(p => p.id === patientId);
      const doctor = db.doctors.find(d => d.id === doctorId);
      if (!patient || !doctor) throw new Error("Patient or doctor not found offline");

      const drugNames = drugs.map(d => d.split(' - ')[0]);
      drugNames.forEach(name => {
        if (!patient.activeMedications.includes(name)) {
          patient.activeMedications.push(name);
        }
      });

      const newRx = {
        id: "rx-" + Date.now(),
        patientId,
        patientName: patient.name,
        doctorId,
        doctorName: doctor.title,
        date: new Date().toISOString().split('T')[0],
        drugs,
        instructions: instructions || "Take as directed",
        status: "Pending"
      };

      db.prescriptions = db.prescriptions || [];
      db.prescriptions.push(newRx);
      saveLocalDb();

      window.dispatchEvent(new CustomEvent('prescriptions_updated', { detail: newRx }));
      return { success: true, prescription: newRx };
    }
  );
}

// Update prescription status
async function updatePrescriptionStatus(id, status) {
  return executeApi(
    async () => {
      const response = await fetch(`${API_BASE}/prescriptions/${id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      if (!response.ok) throw new Error("HTTP " + response.status);
      return await response.json();
    },
    async () => {
      const db = getLocalDb();
      const rxIndex = db.prescriptions.findIndex(r => r.id === id);
      if (rxIndex === -1) throw new Error("Prescription not found offline");

      db.prescriptions[rxIndex].status = status;

      if (status === 'Dispensed') {
        const rx = db.prescriptions[rxIndex];
        rx.drugs.forEach(dString => {
          const drugName = dString.split(' - ')[0];
          const item = db.pharmacyInventory.find(i => i.name.toLowerCase() === drugName.toLowerCase());
          if (item) {
            item.stock = Math.max(0, item.stock - 10);
          }
        });
      }

      saveLocalDb();
      window.dispatchEvent(new CustomEvent('prescriptions_updated', { detail: db.prescriptions[rxIndex] }));
      return { success: true, prescription: db.prescriptions[rxIndex] };
    }
  );
}

// Get inventory
async function getPharmacyInventory() {
  return executeApi(
    async () => {
      const response = await fetch(`${API_BASE}/pharmacy/inventory`);
      if (!response.ok) throw new Error("HTTP " + response.status);
      return await response.json();
    },
    async () => {
      const db = getLocalDb();
      return db.pharmacyInventory || [];
    }
  );
}

// Restock drug
async function restockDrug(name, quantity) {
  return executeApi(
    async () => {
      const response = await fetch(`${API_BASE}/pharmacy/inventory/restock`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, quantity })
      });
      if (!response.ok) throw new Error("HTTP " + response.status);
      return await response.json();
    },
    async () => {
      const db = getLocalDb();
      const item = db.pharmacyInventory.find(i => i.name.toLowerCase() === name.toLowerCase());
      if (!item) throw new Error("Drug not found offline");
      item.stock = (item.stock || 0) + parseInt(quantity);
      saveLocalDb();
      window.dispatchEvent(new CustomEvent('inventory_updated', { detail: item }));
      return { success: true, item };
    }
  );
}
