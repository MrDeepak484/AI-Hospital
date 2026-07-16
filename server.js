// ==========================================
// SERVER SETUP
// ==========================================
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const nodemailer = require('nodemailer');
const twilio = require('twilio');
const https = require('https');
const http = require('http');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS and JSON parsing
app.use(cors());
app.use(express.json());

// Serve static frontend assets from workspace root
app.use(express.static('.'));

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
// Serve files in uploads folder
app.use('/uploads', express.static(uploadsDir));

// Configuration for file storage using Multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    // Retain original name format with timestamp to avoid name collisions
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});
const upload = multer({ storage: storage });

// Database path
const DB_PATH = path.join(__dirname, 'database.json');

// Default initial database state
const INITIAL_DATABASE = {
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
      availableSlots: ["09:00 AM", "10:30 AM", "01:00 PM", "03:30 PM"],
      appointments: [
        {
          id: "apt-101",
          patientName: "Robert Dowson",
          time: "09:00 AM",
          reason: "Regular Arrhythmia Checkup",
          status: "scheduled"
        },
        {
          id: "apt-102",
          patientName: "Emily Watson",
          time: "01:00 PM",
          reason: "Post-surgery Consultation",
          status: "completed"
        }
      ]
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
      availableSlots: ["10:00 AM", "11:30 AM", "02:00 PM", "03:30 PM"],
      appointments: [
        {
          id: "apt-201",
          patientName: "David Miller",
          time: "10:00 AM",
          reason: "Chronic Migraine Follow-up",
          status: "scheduled"
        }
      ]
    },
    {
      id: "dr-carter",
      name: "Sarah Carter",
      title: "Dr. Sarah Carter",
      specialty: "Emergency Care",
      bio: "ER Director specializing in acute trauma care and critical emergency medicine.",
      avatar: "fa-solid fa-stethoscope",
      avatarBg: "#EF4444",
      available: false,
      hours: "08:00 AM - 08:00 PM",
      availableSlots: ["08:00 AM", "11:00 AM", "02:00 PM", "05:00 PM"],
      appointments: []
    }
  ],
  subscription: {
    activePlan: "",
    activeHospital: ""
  },
  chats: {},
  uploadedFiles: [],
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

// ==========================================
// NODEMAILER CONFIGURATION
// ==========================================
let mailTransporter = null;
if (process.env.SMTP_HOST && process.env.SMTP_USER && !process.env.SMTP_USER.includes('your_')) {
  mailTransporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    secure: process.env.SMTP_PORT == 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
}

// ==========================================
// TWILIO SMS CONFIGURATION
// ==========================================
const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID || '';
const twilioAuthToken  = process.env.TWILIO_AUTH_TOKEN  || '';
const twilioFrom       = process.env.TWILIO_FROM        || '';
const twilioEnabled    = !!(twilioAccountSid && twilioAuthToken && twilioFrom
                            && !twilioAccountSid.includes('your_'));
let twilioClient = null;
if (twilioEnabled) {
  twilioClient = twilio(twilioAccountSid, twilioAuthToken);
  console.log('[Twilio] SMS client initialised ✓');
} else {
  console.log('[Twilio] SMS disabled — set TWILIO_ACCOUNT_SID / AUTH_TOKEN / FROM in .env to enable.');
}

// ==========================================
// FAST2SMS CONFIGURATION (Free — India)
// Sign up at fast2sms.com → get API key from Dashboard
// ==========================================
const fast2smsApiKey = process.env.FAST2SMS_API_KEY || '';
const fast2smsEnabled = !!(fast2smsApiKey && !fast2smsApiKey.includes('your_'));
if (fast2smsEnabled) {
  console.log('[Fast2SMS] ✓ Enabled — free SMS to any Indian number.');
} else {
  console.log('[Fast2SMS] Disabled — set FAST2SMS_API_KEY in .env to enable.');
}

// Helper: send OTP via Fast2SMS
async function sendFast2SMS(phone, otp) {
  // Strip country code for Fast2SMS (it expects 10-digit Indian numbers)
  let mobile = phone.replace(/\D/g, '');
  if (mobile.startsWith('91') && mobile.length === 12) mobile = mobile.slice(2);
  if (mobile.length !== 10) throw new Error(`Fast2SMS requires 10-digit Indian number, got: ${mobile}`);

  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      route: 'q',
      message: `🏥 Vaisoverse Hospital: Your verification code is ${otp}. Valid for 10 minutes. Do not share this code.`,
      language: 'english',
      numbers: mobile
    });
    const options = {
      hostname: 'www.fast2sms.com',
      path: '/dev/bulkV2',
      method: 'POST',
      headers: {
        authorization: fast2smsApiKey,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.return === true) resolve(json);
          else reject(new Error(json.message || JSON.stringify(json)));
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

// ==========================================
// GREEN API & WAHA WHATSAPP CONFIGURATIONS
// ==========================================
const greenApiInstanceId = process.env.GREEN_API_INSTANCE_ID || '';
const greenApiToken = process.env.GREEN_API_TOKEN || '';
const greenApiEnabled = !!(greenApiInstanceId && greenApiToken);
const greenApiHost = process.env.GREEN_API_HOST || 
                     (greenApiInstanceId.length >= 4 ? `${greenApiInstanceId.substring(0, 4)}.api.greenapi.com` : 'api.green-api.com');

const wahaUrl = process.env.WAHA_URL || '';
const wahaSession = process.env.WAHA_SESSION || 'default';
const wahaApiKey = process.env.WAHA_API_KEY || '';
const wahaEnabled = !!wahaUrl;

// Helper function to send WhatsApp messages via Green API
function sendGreenApiWhatsApp(phone, messageText) {
  if (!greenApiEnabled) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    let cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.length === 10) {
      cleanPhone = '91' + cleanPhone;
    }
    const chatId = `${cleanPhone}@c.us`;
    const payload = { chatId, message: messageText };
    const bodyData = JSON.stringify(payload);

    const options = {
      hostname: greenApiHost,
      path: `/waInstance${greenApiInstanceId}/sendMessage/${greenApiToken}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyData)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve({ raw: data }); }
      });
    });
    req.on('error', reject);
    req.write(bodyData, 'utf8');
    req.end();
  });
}

// Helper function to send WhatsApp messages via WAHA API (Free & Self-Hosted)
function sendWahaWhatsApp(phone, messageText) {
  if (!wahaEnabled) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    let cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.length === 10) {
      cleanPhone = '91' + cleanPhone;
    }
    const chatId = `${cleanPhone}@c.us`;
    const payload = { chatId, text: messageText, session: wahaSession };
    const bodyData = JSON.stringify(payload);

    let parsedUrl;
    try {
      parsedUrl = new URL(`${wahaUrl}/api/sendText`);
    } catch (e) {
      return reject(new Error("Invalid WAHA_URL: " + wahaUrl));
    }

    const headers = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(bodyData)
    };
    if (wahaApiKey) {
      headers['X-Api-Key'] = wahaApiKey;
    }

    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
      path: parsedUrl.pathname,
      method: 'POST',
      headers: headers
    };

    const client = parsedUrl.protocol === 'https:' ? https : http;

    const req = client.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve({ raw: data }); }
      });
    });
    req.on('error', reject);
    req.write(bodyData, 'utf8');
    req.end();
  });
}

// Helper function to upload and send document files via Green API
function uploadAndSendGreenApiFile(phone, filePath, fileName, caption) {
  if (!greenApiEnabled) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    fs.readFile(filePath, (err, fileBuffer) => {
      if (err) return reject(err);

      const uploadOptions = {
        hostname: greenApiHost,
        path: `/waInstance${greenApiInstanceId}/uploadFile/${greenApiToken}`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/pdf',
          'GA-Filename': fileName,
          'Content-Length': fileBuffer.length
        }
      };

      const uploadReq = https.request(uploadOptions, (uploadRes) => {
        let uploadData = '';
        uploadRes.on('data', (chunk) => { uploadData += chunk; });
        uploadRes.on('end', () => {
          try {
            const uploadResult = JSON.parse(uploadData);
            const urlFile = uploadResult.urlFile;
            if (!urlFile) {
              return reject(new Error('Failed to retrieve urlFile: ' + uploadData));
            }

            let cleanPhone = phone.replace(/\D/g, '');
            if (cleanPhone.length === 10) {
              cleanPhone = '91' + cleanPhone;
            }
            const chatId = `${cleanPhone}@c.us`;
            const payload = { chatId, urlFile, fileName, caption };
            const bodyData = JSON.stringify(payload);

            const sendOptions = {
              hostname: greenApiHost,
              path: `/waInstance${greenApiInstanceId}/sendFileByUrl/${greenApiToken}`,
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(bodyData)
              }
            };

            const sendReq = https.request(sendOptions, (sendRes) => {
              let sendData = '';
              sendRes.on('data', (chunk) => { sendData += chunk; });
              sendRes.on('end', () => {
                try { resolve(JSON.parse(sendData)); }
                catch { resolve({ raw: sendData }); }
              });
            });
            sendReq.on('error', reject);
            sendReq.write(bodyData, 'utf8');
            sendReq.end();
          } catch (uploadErr) {
            reject(uploadErr);
          }
        });
      });
      uploadReq.on('error', reject);
      uploadReq.write(fileBuffer);
      uploadReq.end();
    });
  });
}

// Helper function to send files via WAHA API (Free & Self-Hosted)
function sendWahaFile(phone, filePath, fileName, caption) {
  if (!wahaEnabled) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    fs.readFile(filePath, (err, fileBuffer) => {
      if (err) return reject(err);

      const base64Data = fileBuffer.toString('base64');
      let cleanPhone = phone.replace(/\D/g, '');
      if (cleanPhone.length === 10) {
        cleanPhone = '91' + cleanPhone;
      }
      const chatId = `${cleanPhone}@c.us`;

      const payload = {
        chatId: chatId,
        file: {
          filename: fileName,
          data: base64Data
        },
        caption: caption || '',
        session: wahaSession
      };
      const bodyData = JSON.stringify(payload);

      let parsedUrl;
      try {
        parsedUrl = new URL(`${wahaUrl}/api/sendFile`);
      } catch (e) {
        return reject(new Error("Invalid WAHA_URL: " + wahaUrl));
      }

      const headers = {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyData)
      };
      if (wahaApiKey) {
        headers['X-Api-Key'] = wahaApiKey;
      }

      const options = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
        path: parsedUrl.pathname,
        method: 'POST',
        headers: headers
      };

      const client = parsedUrl.protocol === 'https:' ? https : http;

      const req = client.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try { resolve(JSON.parse(data)); }
          catch { resolve({ raw: data }); }
        });
      });
      req.on('error', reject);
      req.write(bodyData, 'utf8');
      req.end();
    });
  });
}

// Global messaging wrapper that decides whether to route via WAHA or Green API
function sendWhatsAppMessage(phone, messageText) {
  if (wahaEnabled) {
    return sendWahaWhatsApp(phone, messageText);
  } else if (greenApiEnabled) {
    return sendGreenApiWhatsApp(phone, messageText);
  }
  return Promise.resolve(null);
}

function sendWhatsAppFile(phone, filePath, fileName, caption) {
  if (wahaEnabled) {
    return sendWahaFile(phone, filePath, fileName, caption);
  } else if (greenApiEnabled) {
    return uploadAndSendGreenApiFile(phone, filePath, fileName, caption);
  }
  return Promise.resolve(null);
}

// In-memory OTP storage
const otpStore = {};

// In-memory notification inbox (self-contained — no third-party services needed)
const notificationInbox = [];
let notifIdCounter = 1;

function pushNotification(type, to, subject, body, icon = '🏥') {
  const notif = {
    id: notifIdCounter++,
    type,          // 'otp' | 'confirmation'
    to,            // phone or email
    subject,
    body,
    icon,
    read: false,
    time: new Date().toISOString()
  };
  notificationInbox.unshift(notif);
  // Keep last 50 notifications
  if (notificationInbox.length > 50) notificationInbox.pop();
  // Push to all connected browsers via SSE
  broadcastEvent('new_notification', notif);
  return notif;
}

// Reading database from file system
function readDatabase() {
  try {
    if (!fs.existsSync(DB_PATH)) {
      writeDatabase(INITIAL_DATABASE);
      return INITIAL_DATABASE;
    }
    const data = fs.readFileSync(DB_PATH, 'utf8');
    const parsed = JSON.parse(data);
    let updated = false;
    if (!parsed.patients) {
      parsed.patients = INITIAL_DATABASE.patients;
      updated = true;
    }
    if (!parsed.pharmacyInventory) {
      parsed.pharmacyInventory = INITIAL_DATABASE.pharmacyInventory;
      updated = true;
    }
    if (!parsed.prescriptions) {
      parsed.prescriptions = INITIAL_DATABASE.prescriptions;
      updated = true;
    }
    if (updated) {
      writeDatabase(parsed);
    }
    return parsed;
  } catch (err) {
    console.error("Error reading database file:", err);
    return INITIAL_DATABASE;
  }
}

// Saving database to file system
function writeDatabase(data) {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error("Error writing database file:", err);
  }
}

// ==========================================
// SERVER-SENT EVENTS (SSE) EVENT HUB
// ==========================================

let clients = [];

// Establish SSE connections
app.get('/api/events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });

  // Send heart-beat keepalive immediately
  res.write('data: {"status":"connected"}\n\n');

  clients.push(res);

  req.on('close', () => {
    clients = clients.filter(client => client !== res);
  });
});

// Broadcast changes to active screens
function broadcastEvent(event, data) {
  const payload = JSON.stringify({ event, data });
  clients.forEach(client => {
    client.write(`data: ${payload}\n\n`);
  });
}

// Helper: parse slot string to minutes for sorting
function parseTime(timeStr) {
  const match = timeStr.match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!match) return 0;
  let hours = parseInt(match[1]);
  const minutes = parseInt(match[2]);
  const ampm = match[3].toUpperCase();
  if (ampm === 'PM' && hours < 12) hours += 12;
  if (ampm === 'AM' && hours === 12) hours = 0;
  return hours * 60 + minutes;
}

// ==========================================
// REST APIS
// ==========================================

// 1. Doctors Endpoint
app.get('/api/doctors', (req, res) => {
  const db = readDatabase();
  res.json(db.doctors);
});

app.get('/api/doctors/:id', (req, res) => {
  const db = readDatabase();
  const doc = db.doctors.find(d => d.id === req.params.id);
  if (doc) {
    res.json(doc);
  } else {
    res.status(404).json({ error: 'Clinician not found' });
  }
});

// Update doctor profile (bio, specialty, hours, title)
app.put('/api/doctors/:id/profile', (req, res) => {
  const db = readDatabase();
  const index = db.doctors.findIndex(d => d.id === req.params.id);

  if (index !== -1) {
    const { title, specialty, hours, bio, avatar } = req.body;
    db.doctors[index] = {
      ...db.doctors[index],
      title: title || db.doctors[index].title,
      specialty: specialty || db.doctors[index].specialty,
      hours: hours || db.doctors[index].hours,
      bio: bio || db.doctors[index].bio,
      avatar: avatar || db.doctors[index].avatar
    };
    writeDatabase(db);
    broadcastEvent('doctors_updated', db.doctors[index]);
    res.json(db.doctors[index]);
  } else {
    res.status(404).json({ error: 'Clinician not found' });
  }
});

// Update doctor availability status
app.put('/api/doctors/:id/availability', (req, res) => {
  const db = readDatabase();
  const index = db.doctors.findIndex(d => d.id === req.params.id);

  if (index !== -1) {
    const { available } = req.body;
    db.doctors[index].available = available !== undefined ? available : db.doctors[index].available;
    writeDatabase(db);
    broadcastEvent('doctors_updated', db.doctors[index]);
    res.json(db.doctors[index]);
  } else {
    res.status(404).json({ error: 'Clinician not found' });
  }
});

// Add a time-slot to doctor's availability
app.post('/api/doctors/:id/slots', (req, res) => {
  const db = readDatabase();
  const index = db.doctors.findIndex(d => d.id === req.params.id);

  if (index !== -1) {
    const { slot } = req.body;
    if (!slot) return res.status(400).json({ error: 'Time slot required' });

    if (!db.doctors[index].availableSlots.includes(slot)) {
      db.doctors[index].availableSlots.push(slot);
      db.doctors[index].availableSlots.sort((a, b) => parseTime(a) - parseTime(b));
      writeDatabase(db);
      broadcastEvent('doctors_updated', db.doctors[index]);
    }
    res.json(db.doctors[index]);
  } else {
    res.status(404).json({ error: 'Clinician not found' });
  }
});

// Remove a time-slot
app.delete('/api/doctors/:id/slots/:slot', (req, res) => {
  const db = readDatabase();
  const index = db.doctors.findIndex(d => d.id === req.params.id);

  if (index !== -1) {
    const slotToDelete = req.params.slot;
    db.doctors[index].availableSlots = db.doctors[index].availableSlots.filter(s => s !== slotToDelete);
    writeDatabase(db);
    broadcastEvent('doctors_updated', db.doctors[index]);
    res.json(db.doctors[index]);
  } else {
    res.status(404).json({ error: 'Clinician not found' });
  }
});

// Reserve a new appointment
app.post('/api/doctors/:id/appointments', async (req, res) => {
  const db = readDatabase();
  const index = db.doctors.findIndex(d => d.id === req.params.id);

  if (index !== -1) {
    const { patientName, time, reason, phone, email } = req.body;
    if (!patientName || !time) return res.status(400).json({ error: 'Patient name and time required' });

    // Generate Professional PDF Letter
    let pdfUrl = '';
    let pdfFilename = `appointment-${Date.now()}.pdf`;
    let pdfPath = path.join(uploadsDir, pdfFilename);
    pdfUrl = `/uploads/${pdfFilename}`;

    try {
      const refNumber = `VHC-${Date.now().toString().slice(-8).toUpperCase()}`;
      const issuedDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

      const doc = new PDFDocument({ margin: 60, size: 'A4' });
      const pdfStream = fs.createWriteStream(pdfPath);
      doc.pipe(pdfStream);

      // Header bar
      doc.rect(0, 0, doc.page.width, 80).fill('#0052FF');
      doc.fill('#FFFFFF').fontSize(22).font('Helvetica-Bold').text('VAISOVERSE', 60, 22, { continued: true });
      doc.fontSize(22).font('Helvetica').fill('#A0BFFF').text('  Hospital & Healthcare', { continued: false });
      doc.fill('#FFFFFF').fontSize(10).font('Helvetica').text('Where Care Meets Technology', 60, 52);

      // Top right ref box
      doc.roundedRect(doc.page.width - 200, 16, 145, 48, 6).fill('#003ECC');
      doc.fill('#FFFFFF').fontSize(8).font('Helvetica').text('REFERENCE NO.', doc.page.width - 195, 22);
      doc.fill('#A0BFFF').fontSize(12).font('Helvetica-Bold').text(refNumber, doc.page.width - 195, 36);

      doc.moveDown(3);

      // Title
      doc.fill('#0052FF').fontSize(16).font('Helvetica-Bold').text('Official Appointment Confirmation Letter', { align: 'center' });
      doc.moveDown(0.3);
      doc.fill('#4A5D6E').fontSize(11).font('Helvetica').text(`Issued on: ${issuedDate}`, { align: 'center' });

      // Divider
      doc.moveDown(1.2);
      doc.moveTo(60, doc.y).lineTo(doc.page.width - 60, doc.y).strokeColor('#E2E8F0').lineWidth(1).stroke();
      doc.moveDown(1.2);

      // Section: Patient Info
      const rowY = doc.y;
      doc.fill('#0A192F').fontSize(12).font('Helvetica-Bold').text('PATIENT DETAILS', 60, rowY);
      doc.moveDown(0.8);
      const infoFields = [
        ['Patient Name', patientName],
        ['Reason for Visit', reason || 'General Consultation'],
        ['Verification', 'Identity confirmed']
      ];
      infoFields.forEach(([label, val]) => {
        doc.fill('#8892B0').fontSize(9).font('Helvetica').text(label.toUpperCase(), 60, doc.y, { continued: false });
        doc.fill('#0A192F').fontSize(11).font('Helvetica').text(val, 60, doc.y);
        doc.moveDown(0.6);
      });

      doc.moveDown(0.5);
      doc.moveTo(60, doc.y).lineTo(doc.page.width - 60, doc.y).strokeColor('#E2E8F0').lineWidth(1).stroke();
      doc.moveDown(1);

      // Section: Appointment Info
      doc.fill('#0A192F').fontSize(12).font('Helvetica-Bold').text('APPOINTMENT DETAILS');
      doc.moveDown(0.8);

      const aptFields = [
        ['Attending Physician', db.doctors[index].title],
        ['Specialization', db.doctors[index].specialty],
        ['Scheduled Date & Time', time],
        ['Hospital Premises', 'Vaisoverse Main Campus, Medical Wing 3'],
        ['Appointment Status', 'CONFIRMED ✓']
      ];
      aptFields.forEach(([label, val]) => {
        doc.fill('#8892B0').fontSize(9).font('Helvetica').text(label.toUpperCase(), 60, doc.y);
        doc.fill('#0A192F').fontSize(11).font('Helvetica').text(val, 60, doc.y);
        doc.moveDown(0.6);
      });

      doc.moveDown(0.5);
      doc.moveTo(60, doc.y).lineTo(doc.page.width - 60, doc.y).strokeColor('#E2E8F0').lineWidth(1).stroke();
      doc.moveDown(1);

      // Important Notice box
      doc.roundedRect(60, doc.y, doc.page.width - 120, 66, 8).fill('#F0F4FF');
      const noticeY = doc.y + 12;
      doc.fill('#0052FF').fontSize(10).font('Helvetica-Bold').text('IMPORTANT NOTICE', 76, noticeY);
      doc.fill('#4A5D6E').fontSize(9.5).font('Helvetica').text(
        'Please arrive 15 minutes before your scheduled time. Carry a valid photo ID and this letter. Failure to attend without prior cancellation may result in a no-show fee.',
        76, noticeY + 16, { width: doc.page.width - 152 }
      );
      doc.moveDown(5.5);

      // Footer
      const footerY = doc.page.height - 60;
      doc.rect(0, footerY, doc.page.width, 60).fill('#F5F7FA');
      doc.fill('#8892B0').fontSize(9).font('Helvetica')
        .text('Vaisoverse Hospital  |  support@vaisoverse.com  |  +1 (800) 123-4567', 60, footerY + 12, { align: 'center', width: doc.page.width - 120 });
      doc.fill('#CBD5E1').fontSize(8).text('This is a computer-generated document. No signature required.', 60, footerY + 30, { align: 'center', width: doc.page.width - 120 });

      doc.end();
      // Wait for stream to finish writing
      await new Promise((resolveStream) => {
        pdfStream.on('finish', resolveStream);
      });
    } catch (err) {
      console.error("PDF generation failed:", err);
      return res.status(500).json({ error: 'Failed to generate appointment letter' });
    }

    // Push appointment confirmation to in-app notification inbox
    const aptSummaryHtml = `
      <div style="line-height:1.7">
        <div style="font-size:13px;color:#8892B0;margin-bottom:2px">DOCTOR</div>
        <div style="font-size:15px;font-weight:700;color:#0A192F;margin-bottom:10px">${db.doctors[index].title} &mdash; ${db.doctors[index].specialty}</div>
        <div style="font-size:13px;color:#8892B0;margin-bottom:2px">TIME SLOT</div>
        <div style="font-size:15px;font-weight:700;color:#0052FF;margin-bottom:10px">${time}</div>
        <div style="font-size:13px;color:#8892B0;margin-bottom:2px">REASON</div>
        <div style="font-size:14px;color:#0A192F;margin-bottom:14px">${reason || 'General Consultation'}</div>
        <div style="background:#F0F4FF;border-left:3px solid #0052FF;padding:10px 14px;border-radius:0 6px 6px 0;font-size:12.5px;color:#4A5D6E">
          ⏰ Arrive <strong>15 minutes early</strong> with a valid photo ID.
        </div>
        ${pdfUrl ? `<a href="http://localhost:3000${pdfUrl}" target="_blank" style="display:inline-block;margin-top:12px;background:#0052FF;color:#fff;padding:9px 20px;border-radius:999px;text-decoration:none;font-size:13px;font-weight:600">📄 Download Appointment Letter</a>` : ''}
      </div>`;

    // Push in-app confirmation notification for phone
    if (phone) {
      pushNotification('confirmation', phone,
        '✅ Appointment Confirmed — Vaisoverse Hospital',
        `Dear <strong>${patientName}</strong>, your appointment has been confirmed!${aptSummaryHtml}`,
        '✅'
      );
    }

    // Push in-app confirmation notification for email + send via Nodemailer
    if (email) {
      pushNotification('confirmation', email,
        '✅ Appointment Confirmed — Vaisoverse Hospital',
        `Dear <strong>${patientName}</strong>, your appointment has been confirmed!${aptSummaryHtml}`,
        '📧'
      );

      if (mailTransporter) {
        try {
          await mailTransporter.sendMail({
            from: process.env.EMAIL_FROM,
            to: email,
            subject: `✅ Appointment Confirmed – ${db.doctors[index].title} | Vaisoverse Hospital`,
            html: `
              <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
                <div style="background:#0052FF;padding:28px 32px;">
                  <h1 style="color:#ffffff;margin:0;font-size:22px;">VAISOVERSE <span style="color:#a0bfff;font-weight:400;">Hospital</span></h1>
                  <p style="color:#a0bfff;margin:6px 0 0;font-size:13px;">Where Care Meets Technology</p>
                </div>
                <div style="padding:32px;">
                  <h2 style="color:#0052FF;font-size:18px;margin-top:0;">✅ Appointment Confirmed</h2>
                  <p style="color:#4a5d6e;">Dear <strong>${patientName}</strong>,</p>
                  <p style="color:#4a5d6e;">Your appointment has been successfully booked and verified. Please find the details below.</p>
                  <table style="width:100%;border-collapse:collapse;margin:20px 0;">
                    <tr style="background:#f5f7fa;"><td style="padding:10px 14px;font-size:12px;color:#8892b0;font-weight:600;text-transform:uppercase;width:45%;">Attending Physician</td><td style="padding:10px 14px;font-size:14px;color:#0a192f;font-weight:600;">${db.doctors[index].title}</td></tr>
                    <tr><td style="padding:10px 14px;font-size:12px;color:#8892b0;font-weight:600;text-transform:uppercase;">Specialization</td><td style="padding:10px 14px;font-size:14px;color:#0a192f;">${db.doctors[index].specialty}</td></tr>
                    <tr style="background:#f5f7fa;"><td style="padding:10px 14px;font-size:12px;color:#8892b0;font-weight:600;text-transform:uppercase;">Time Slot</td><td style="padding:10px 14px;font-size:14px;color:#0a192f;font-weight:600;">${time}</td></tr>
                    <tr><td style="padding:10px 14px;font-size:12px;color:#8892b0;font-weight:600;text-transform:uppercase;">Reason</td><td style="padding:10px 14px;font-size:14px;color:#0a192f;">${reason || 'General Consultation'}</td></tr>
                    <tr style="background:#f5f7fa;"><td style="padding:10px 14px;font-size:12px;color:#8892b0;font-weight:600;text-transform:uppercase;">Status</td><td style="padding:10px 14px;font-size:14px;color:#10b981;font-weight:700;">CONFIRMED ✓</td></tr>
                  </table>
                  <div style="background:#f0f4ff;border-left:4px solid #0052FF;padding:14px 18px;border-radius:0 8px 8px 0;margin:20px 0;">
                    <p style="margin:0;color:#4a5d6e;font-size:13px;">⏰ Please arrive <strong>15 minutes</strong> before your scheduled time. Bring a valid photo ID and present this email at the reception.</p>
                  </div>
                  <a href="http://localhost:3000${pdfUrl}" style="display:inline-block;background:#0052FF;color:#ffffff;padding:12px 24px;border-radius:999px;text-decoration:none;font-weight:600;font-size:14px;margin-top:8px;">📄 Download Appointment Letter</a>
                </div>
                <div style="background:#f5f7fa;padding:18px 32px;text-align:center;">
                  <p style="color:#8892b0;font-size:12px;margin:0;">Vaisoverse Hospital &nbsp;|&nbsp; support@vaisoverse.com &nbsp;|&nbsp; +1 (800) 123-4567</p>
                  <p style="color:#cbd5e1;font-size:11px;margin:6px 0 0;">This is a computer-generated email. Please do not reply.</p>
                </div>
              </div>`
          });
        } catch (err) {
          console.error("Email Confirmation Error:", err.message);
        }
      }
    }

    // Send WhatsApp confirmation if configured (WAHA or Green API)
    let whatsAppSuccess = false;
    if (phone && (wahaEnabled || greenApiEnabled)) {
      try {
        const confirmationMsg = `\uD83C\uDFE5 *Vaisoverse Hospital – Appointment Confirmed!*\n\nDear ${patientName},\n\nYour appointment has been successfully confirmed.\n\n*Doctor:* ${db.doctors[index].title}\n*Specialty:* ${db.doctors[index].specialty}\n*Time Slot:* ${time}\n*Reason:* ${reason || 'General Consultation'}\n\nPlease arrive 15 minutes early with a valid photo ID.\n\n– Vaisoverse Hospital Team`;

        // 1. Send text confirmation first
        await sendWhatsAppMessage(phone, confirmationMsg);

        // 2. Send the actual PDF confirmation letter
        await sendWhatsAppFile(
          phone,
          pdfPath,
          pdfFilename,
          `Official Appointment Letter - ${db.doctors[index].title}`
        );

        whatsAppSuccess = true;
      } catch (err) {
        console.error("WhatsApp Confirmation Error:", err.message);
      }
    }

    console.log(`\n--- APPOINTMENT CONFIRMED ---`);
    console.log(`[Patient] ${patientName} | Email: ${email || 'N/A'} | Phone: +${phone || 'N/A'}`);
    console.log(`[WhatsApp] ${(wahaEnabled || greenApiEnabled) ? (whatsAppSuccess ? `✓ SENT (${wahaEnabled ? 'WAHA' : 'GreenAPI'})` : '✗ FAILED') : 'SKIPPED'}`);
    console.log(`[Email] ${mailTransporter ? 'SENT' : 'SKIPPED (no SMTP credentials)'}`);
    console.log(`-----------------------------\n`);

    const newApt = {
      id: "apt-" + Date.now(),
      patientName,
      time,
      reason: reason || "General consultation",
      status: "scheduled",
      pdfUrl: pdfUrl
    };

    db.doctors[index].appointments.push(newApt);

    // Remove slot from availableSlots since it's reserved
    db.doctors[index].availableSlots = db.doctors[index].availableSlots.filter(s => s !== time);

    writeDatabase(db);
    broadcastEvent('appointments_updated', { doctorId: req.params.id, doctor: db.doctors[index] });
    broadcastEvent('doctors_updated', db.doctors[index]);
    res.json({ appointment: newApt, doctor: db.doctors[index] });
  } else {
    res.status(404).json({ error: 'Clinician not found' });
  }
});

// Modify appointment status (Cancel / Complete)
app.put('/api/doctors/:id/appointments/:aptId/status', (req, res) => {
  const db = readDatabase();
  const docIndex = db.doctors.findIndex(d => d.id === req.params.id);

  if (docIndex !== -1) {
    const aptIndex = db.doctors[docIndex].appointments.findIndex(a => a.id === req.params.aptId);
    if (aptIndex !== -1) {
      const oldStatus = db.doctors[docIndex].appointments[aptIndex].status;
      const { status } = req.body;
      db.doctors[docIndex].appointments[aptIndex].status = status;

      // If cancelled, restore time-slot back to clinician schedules
      if (status === 'cancelled' && oldStatus === 'scheduled') {
        const slotTime = db.doctors[docIndex].appointments[aptIndex].time;
        if (!db.doctors[docIndex].availableSlots.includes(slotTime)) {
          db.doctors[docIndex].availableSlots.push(slotTime);
          db.doctors[docIndex].availableSlots.sort((a, b) => parseTime(a) - parseTime(b));
        }
      }

      writeDatabase(db);
      broadcastEvent('appointments_updated', { doctorId: req.params.id, doctor: db.doctors[docIndex] });
      broadcastEvent('doctors_updated', db.doctors[docIndex]);
      res.json(db.doctors[docIndex].appointments[aptIndex]);
    } else {
      res.status(404).json({ error: 'Appointment not found' });
    }
  } else {
    res.status(404).json({ error: 'Clinician not found' });
  }
});

// 2. Subscription Endpoints
app.get('/api/subscription', (req, res) => {
  const db = readDatabase();
  res.json(db.subscription);
});

app.post('/api/subscription', (req, res) => {
  const db = readDatabase();
  const { activePlan, activeHospital } = req.body;

  db.subscription = {
    activePlan: activePlan || "",
    activeHospital: activeHospital || ""
  };
  writeDatabase(db);
  broadcastEvent('subscription_updated', db.subscription);
  res.json(db.subscription);
});

// 3. Persistent Chat History Endpoints
app.get('/api/chat/:sessionId', (req, res) => {
  const db = readDatabase();
  const history = db.chats[req.params.sessionId] || [];
  res.json(history);
});

app.post('/api/chat/:sessionId', (req, res) => {
  const db = readDatabase();
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: 'Message payload required' });

  // If reset flag is set, clear the existing history before saving the new message
  if (message.reset) {
    db.chats[req.params.sessionId] = [message];
  } else {
    if (!db.chats[req.params.sessionId]) {
      db.chats[req.params.sessionId] = [];
    }
    db.chats[req.params.sessionId].push(message);
  }

  writeDatabase(db);
  res.json(db.chats[req.params.sessionId]);
});

// Clear entire chat session
app.delete('/api/chat/:sessionId', (req, res) => {
  const db = readDatabase();
  db.chats[req.params.sessionId] = [];
  writeDatabase(db);
  res.json({ success: true });
});

// 4. Verification Code API
app.post('/api/reports/verify', (req, res) => {
  const { code } = req.body;
  if (code === '123456') {
    res.json({
      success: true,
      patient: "John Doe",
      date: "2026-07-01",
      diagnostics: [
        { test: "Complete Blood Count (CBC)", status: "Normal", remarks: "WBC and RBC values within standard range." },
        { test: "Electrocardiogram (ECG)", status: "Minor Anomaly", remarks: "Detected mild sinus arrhythmia, no critical risk." },
        { test: "Lipid Panel", status: "Borderline High", remarks: "LDL Cholesterol: 135 mg/dL. Low-fat diet advised." }
      ]
    });
  } else if (code === '999999') {
    res.json({
      success: true,
      patient: "Jane Smith",
      date: "2026-07-03",
      diagnostics: [
        { test: "Basic Metabolic Panel (BMP)", status: "Normal", remarks: "Electrolytes and kidney function metrics clear." },
        { test: "Cardiac Troponin T", status: "Critical Check", remarks: "Valued at <0.01 ng/mL. Normal range cardiosignatures." }
      ]
    });
  } else {
    res.json({
      success: false,
      error: "Invalid 6-digit Patient Security Code. Please try '123456' or '999999' to query clinical records."
    });
  }
});

// 4a. Verification API — Fast2SMS (free) + Twilio fallback + console fallback
app.post('/api/verification/send', async (req, res) => {
  const { email, phone } = req.body;
  if (!email || !phone) return res.status(400).json({ error: 'Email and phone required' });

  // Generate 4-digit OTP
  const otp = phone === '555' ? '1234' : Math.floor(1000 + Math.random() * 9000).toString();
  otpStore[phone] = otp;

  // Auto-delete OTP after 10 minutes
  setTimeout(() => { delete otpStore[phone]; }, 10 * 60 * 1000);

  let smsSuccess = false;
  let smsProvider = 'none';

  // ── 1st: Fast2SMS (Free — any Indian number) ──────────────────────
  if (fast2smsEnabled && !smsSuccess) {
    try {
      await sendFast2SMS(phone, otp);
      smsSuccess = true;
      smsProvider = 'Fast2SMS';
      console.log(`[Fast2SMS] ✓ OTP sent to ${phone}`);
    } catch (err) {
      console.error('[Fast2SMS] ✗ Error:', err.message);
    }
  }

  // ── 2nd: Twilio (paid, any number worldwide) ──────────────────
  if (twilioClient && !smsSuccess) {
    try {
      const toNumber = phone.startsWith('+') ? phone : `+${phone}`;
      await twilioClient.messages.create({
        body: `🏥 Vaisoverse Hospital: Your SMS verification code is ${otp}. Valid for 10 minutes. Do not share this code.`,
        from: twilioFrom,
        to: toNumber
      });
      smsSuccess = true;
      smsProvider = 'Twilio';
      console.log(`[Twilio SMS] ✓ OTP sent to ${toNumber}`);
    } catch (err) {
      console.error('[Twilio SMS] ✗ Error:', err.message);
    }
  }

  // ── Console fallback (dev mode — no SMS provider configured) ──────
  console.log(`\n--- OTP DISPATCH ---`);
  console.log(`[OTP Code]  ${otp}  →  Phone: +${phone}`);
  console.log(`[Provider]  ${smsSuccess ? `✓ SENT via ${smsProvider}` : 'SKIPPED — no SMS provider configured. Use devOtp.'}`);
  console.log(`--------------------\n`);

  res.json({
    success: true,
    message: smsSuccess ? `OTP sent via ${smsProvider}` : 'OTP generated (check server console)',
    devOtp: !smsSuccess ? otp : undefined   // Only expose in dev when no SMS provider is active
  });
});

// 4b. Verify OTP
app.post('/api/verification/verify', async (req, res) => {
  const { phone, code } = req.body;
  if (!phone || !code) return res.status(400).json({ success: false, error: 'Phone and code required' });

  // ── Local OTP check ────────────────────────────────────────────────
  if (otpStore[phone] && otpStore[phone] === code) {
    delete otpStore[phone];
    return res.json({ success: true });
  }

  res.json({ success: false, error: 'Invalid verification code' });
});

// 4b. Notifications Inbox API
app.get('/api/notifications', (req, res) => {
  res.json(notificationInbox);
});

app.put('/api/notifications/:id/read', (req, res) => {
  const notif = notificationInbox.find(n => n.id === parseInt(req.params.id));
  if (notif) notif.read = true;
  res.json({ success: true });
});

app.delete('/api/notifications/:id', (req, res) => {
  const idx = notificationInbox.findIndex(n => n.id === parseInt(req.params.id));
  if (idx !== -1) notificationInbox.splice(idx, 1);
  res.json({ success: true });
});

app.delete('/api/notifications', (req, res) => {
  notificationInbox.length = 0;
  res.json({ success: true });
});

// 5. Patient File Upload APIs
app.post('/api/uploads/patient', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const db = readDatabase();

  const fileMeta = {
    id: "file-" + Date.now(),
    name: req.file.originalname,
    filename: req.file.filename,
    size: req.file.size,
    type: req.file.mimetype,
    uploadTime: new Date().toISOString(),
    url: `/uploads/${req.file.filename}`
  };

  db.uploadedFiles.push(fileMeta);
  writeDatabase(db);

  // Broadcast SSE event
  broadcastEvent('files_updated', fileMeta);

  res.json(fileMeta);
});

app.get('/api/uploads/patient', (req, res) => {
  const db = readDatabase();
  res.json(db.uploadedFiles);
});

// ==========================================
// PORTAL LOGIN & ROLE MANAGEMENT APIs
// ==========================================

// Authenticate user login
app.post('/api/auth/login', (req, res) => {
  const { username, password, role } = req.body;
  if (!username || !password || !role) {
    return res.status(400).json({ success: false, error: 'Username, password and role are required' });
  }

  const db = readDatabase();
  const lowerUser = username.toLowerCase();
  
  if (role === 'doctor') {
    const doc = db.doctors.find(d => 
      d.id.toLowerCase().includes(lowerUser) || 
      d.name.toLowerCase().includes(lowerUser)
    );
    if (doc && password === 'password') {
      return res.json({
        success: true,
        user: {
          id: doc.id,
          name: doc.title,
          role: 'doctor',
          specialty: doc.specialty
        }
      });
    }
  } else if (role === 'patient') {
    const patient = db.patients.find(p => p.username.toLowerCase() === lowerUser);
    if (patient && password === 'password') {
      return res.json({
        success: true,
        user: {
          id: patient.id,
          name: patient.name,
          role: 'patient',
          age: patient.age,
          gender: patient.gender,
          bloodGroup: patient.bloodGroup
        }
      });
    }
  } else if (role === 'pharmacy') {
    if ((lowerUser === 'pharmacy' || lowerUser === 'wellness') && password === 'password') {
      return res.json({
        success: true,
        user: {
          id: lowerUser === 'pharmacy' ? 'central-pharmacy' : 'wellness-pharmacy',
          name: lowerUser === 'pharmacy' ? 'Vaisoverse Central Pharmacy' : 'City Wellness Pharmacy',
          role: 'pharmacy',
          license: lowerUser === 'pharmacy' ? 'PH-2026-9876' : 'PH-2026-4321'
        }
      });
    }
  }

  return res.status(401).json({ success: false, error: 'Invalid username, password, or role selector.' });
});

// Register new patient
app.post('/api/auth/register', (req, res) => {
  const { name, username, email, phone, age, gender, bloodGroup, password } = req.body;
  if (!name || !username || !email || !phone || !age || !gender || !bloodGroup || !password) {
    return res.status(400).json({ success: false, error: 'All fields are required to register.' });
  }

  const db = readDatabase();
  const lowerUser = username.toLowerCase();
  
  const usernameTaken = db.patients.some(p => p.username.toLowerCase() === lowerUser) || 
                        db.doctors.some(d => d.id.toLowerCase() === lowerUser);
  if (usernameTaken) {
    return res.status(400).json({ success: false, error: 'Username is already taken.' });
  }

  const newPatient = {
    id: "pat-" + Date.now(),
    name,
    username,
    password,
    age: parseInt(age),
    gender,
    bloodGroup,
    phone,
    email,
    activeMedications: [],
    records: []
  };

  db.patients.push(newPatient);
  writeDatabase(db);

  return res.json({
    success: true,
    user: {
      id: newPatient.id,
      name: newPatient.name,
      role: 'patient',
      age: newPatient.age,
      gender: newPatient.gender,
      bloodGroup: newPatient.bloodGroup
    }
  });
});


// Register new doctor
app.post('/api/auth/register/doctor', (req, res) => {
  const { name, username, email, phone, specialty, qualification, experience, consultFee, password } = req.body;
  if (!name || !username || !email || !phone || !specialty || !password) {
    return res.status(400).json({ success: false, error: 'Name, username, email, phone, specialty and password are required.' });
  }
  const db = readDatabase();
  const lowerUser = username.toLowerCase();
  const taken = db.doctors.some(d => d.id.toLowerCase() === lowerUser) ||
                db.patients.some(p => p.username.toLowerCase() === lowerUser);
  if (taken) return res.status(400).json({ success: false, error: 'Username is already taken.' });

  const newId = username.toLowerCase().replace(/\s+/g, '-') + '-' + Date.now();
  const newDoc = {
    id: newId,
    title: 'Dr. ' + name,
    name: 'Dr. ' + name,
    username,
    password,
    specialty: specialty || 'General Physician',
    qualification: qualification || 'MBBS',
    experience: parseInt(experience) || 0,
    consultFee: parseInt(consultFee) || 50,
    email,
    phone,
    rating: 4.5,
    reviews: 0,
    available: true,
    slots: ['09:00 AM','10:00 AM','11:00 AM','02:00 PM','03:00 PM','04:00 PM'],
    appointments: []
  };
  db.doctors.push(newDoc);
  writeDatabase(db);
  return res.json({
    success: true,
    user: { id: newDoc.id, name: newDoc.title, role: 'doctor', specialty: newDoc.specialty }
  });
});

// Register new pharmacy
app.post('/api/auth/register/pharmacy', (req, res) => {
  const { name, username, email, phone, pharmacyName, license, address, password } = req.body;
  if (!name || !username || !email || !phone || !pharmacyName || !license || !password) {
    return res.status(400).json({ success: false, error: 'All pharmacy fields are required.' });
  }
  const db = readDatabase();
  const lowerUser = username.toLowerCase();
  const taken = db.doctors.some(d => d.id.toLowerCase() === lowerUser) ||
                db.patients.some(p => p.username.toLowerCase() === lowerUser);
  if (taken) return res.status(400).json({ success: false, error: 'Username is already taken.' });

  const newId = 'pharma-' + Date.now();
  // Optionally track pharmacies in the database if a list exists
  if (!db.pharmacies) db.pharmacies = [];
  db.pharmacies.push({ id: newId, username, password, pharmacyName, name, email, phone, license, address });
  writeDatabase(db);
  return res.json({
    success: true,
    user: { id: newId, name: pharmacyName, role: 'pharmacy', license }
  });
});

// Get all patients
app.get('/api/patients', (req, res) => {
  const db = readDatabase();
  res.json(db.patients || []);
});

// Get patient by id
app.get('/api/patients/:id', (req, res) => {
  const db = readDatabase();
  const patient = db.patients.find(p => p.id === req.params.id);
  if (!patient) return res.status(404).json({ error: 'Patient not found' });
  res.json(patient);
});

// Get all prescriptions or prescriptions for a specific patient
app.get('/api/prescriptions', (req, res) => {
  const db = readDatabase();
  const { patientId } = req.query;
  let list = db.prescriptions || [];
  if (patientId) {
    list = list.filter(r => r.patientId === patientId);
  }
  res.json(list);
});

// Create new prescription
app.post('/api/prescriptions', (req, res) => {
  const { patientId, doctorId, drugs, instructions } = req.body;
  if (!patientId || !doctorId || !drugs) {
    return res.status(400).json({ error: 'Missing patientId, doctorId, or drugs list' });
  }

  const db = readDatabase();
  const patient = db.patients.find(p => p.id === patientId);
  const doctor = db.doctors.find(d => d.id === doctorId);

  if (!patient) return res.status(404).json({ error: 'Patient not found' });
  if (!doctor) return res.status(404).json({ error: 'Doctor not found' });

  // Add drugs to active medications if not present
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
  
  writeDatabase(db);
  broadcastEvent('prescriptions_updated', newRx);

  res.json({ success: true, prescription: newRx });
});

// Update prescription status
app.put('/api/prescriptions/:id/status', (req, res) => {
  const { status } = req.body;
  if (!status) return res.status(400).json({ error: 'Status is required' });

  const db = readDatabase();
  const rxIndex = db.prescriptions.findIndex(r => r.id === req.params.id);
  if (rxIndex === -1) return res.status(404).json({ error: 'Prescription not found' });

  db.prescriptions[rxIndex].status = status;
  
  // If dispensed, also deduct from inventory if drugs match
  if (status === 'Dispensed') {
    const rx = db.prescriptions[rxIndex];
    rx.drugs.forEach(dString => {
      const drugName = dString.split(' - ')[0]; // E.g., "Atorvastatin 20mg"
      const item = db.pharmacyInventory.find(i => i.name.toLowerCase() === drugName.toLowerCase());
      if (item) {
        item.stock = Math.max(0, item.stock - 10); // Deduct standard quantity 10
      }
    });
  }

  writeDatabase(db);
  broadcastEvent('prescriptions_updated', db.prescriptions[rxIndex]);
  res.json({ success: true, prescription: db.prescriptions[rxIndex] });
});

// Get pharmacy inventory
app.get('/api/pharmacy/inventory', (req, res) => {
  const db = readDatabase();
  res.json(db.pharmacyInventory || []);
});

// Restock a drug
app.put('/api/pharmacy/inventory/restock', (req, res) => {
  const { name, quantity } = req.body;
  if (!name || !quantity) return res.status(400).json({ error: 'Name and quantity are required' });

  const db = readDatabase();
  const item = db.pharmacyInventory.find(i => i.name.toLowerCase() === name.toLowerCase());
  if (!item) return res.status(404).json({ error: 'Drug not found in inventory' });

  item.stock = (item.stock || 0) + parseInt(quantity);
  writeDatabase(db);
  
  broadcastEvent('inventory_updated', item);
  res.json({ success: true, item });
});

// Start Server listening
app.listen(PORT, () => {
  console.log(`=================================================`);
  console.log(`Vaisoverse Clinician Operations Backend Live!`);
  console.log(`Server listening at http://localhost:${PORT}`);
  console.log(`Database storage file: ${DB_PATH}`);
  console.log(`Clinical file uploads folder: ${uploadsDir}`);
  console.log(`=================================================`);

  // ── WAHA Keep-Alive Ping (every 10 min to prevent Render sleep) ──────
  if (wahaEnabled) {
    const pingWaha = () => {
      try {
        const parsedUrl = new URL(`${wahaUrl}/api/sessions`);
        const pingOptions = {
          hostname: parsedUrl.hostname,
          port: parsedUrl.port || 443,
          path: parsedUrl.pathname,
          method: 'GET',
          headers: wahaApiKey ? { 'X-Api-Key': wahaApiKey } : {}
        };
        const client = parsedUrl.protocol === 'https:' ? https : http;
        const req = client.request(pingOptions, (res) => {
          console.log(`[WAHA Keep-Alive] Ping OK (${res.statusCode})`);
        });
        req.on('error', (e) => console.warn('[WAHA Keep-Alive] Ping error:', e.message));
        req.end();
      } catch (e) {
        console.warn('[WAHA Keep-Alive] Ping setup error:', e.message);
      }
    };
    // Ping immediately on startup, then every 10 minutes
    pingWaha();
    setInterval(pingWaha, 10 * 60 * 1000);
    console.log('[WAHA Keep-Alive] Scheduled every 10 minutes to prevent Render sleep.');
  }
});
