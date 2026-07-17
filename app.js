// Initialize Firebase
const firebaseConfig = {
  apiKey: "AIzaSyBrWhgO_BlE_ukhqy3X_8MgUMp8l_4tVNk",
  authDomain: "vaisoverse-hospital.firebaseapp.com",
  projectId: "vaisoverse-hospital",
  storageBucket: "vaisoverse-hospital.firebasestorage.app",
  messagingSenderId: "962920668265",
  appId: "1:962920668265:web:e6e3ca16c6a4447dda96f8",
  measurementId: "G-XMJ84NEK76"
};

if (typeof firebase !== 'undefined') {
  firebase.initializeApp(firebaseConfig);
  console.log('[Firebase] Initialized successfully ✓');
}

// Global state
let firebaseConfirmationResult = null;
let chatbotOpen = false;
let notificationCleared = false;
let voiceActive = false;
let bookingState = {
  active: false,
  step: 0, // 0: select doctor, 1: select slot, 2: name, 3: reason, 4: email, 5: phone, 6: sms-otp
  selectedDoctorId: null,
  selectedSlot: null,
  patientName: '',
  patientReason: '',
  patientEmail: '',
  patientPhone: ''
};
let reportState = {
  active: false
};

const botResponses = {
  'check lab reports': "To view your diagnostic reports, please provide your 6-digit Patient Security Code or upload the report file using the clip icon.",
  'emergency help': "⚠️ <strong>Emergency Mode Active:</strong> If this is a life-threatening crisis, please dial 911 immediately. I have notified the ER Triage Desk of your request. An on-duty physician has been paged.",
  'default': "Thank you for reaching out to Vaisoverse AI. I am processing your inquiry regarding our hospital operations platform. Let me know if you would like me to schedule a demo with our team!"
};

// Initialize elements on load
document.addEventListener('DOMContentLoaded', async () => {
  setupNavbarScroll();
  setupMobileMenu();
  setupChatAutoscroll();
  await updateHeaderPlanState();
  await restoreChatHistory();
  initNotificationInbox();
});

// Restore chatbot history from backend
async function restoreChatHistory() {
  try {
    const history = await fetchChatHistory('patient-session');
    if (history && history.length > 0) {
      const messagesContainer = document.getElementById('chat-messages');
      messagesContainer.innerHTML = ''; // clear default welcome
      history.forEach(msg => {
        appendMessageDirectly(msg.text, msg.sender, msg.time);
      });
    }
  } catch (err) {
    console.error("Failed to restore chat logs:", err);
  }
}

// 1. Header scroll effect
function setupNavbarScroll() {
  const header = document.getElementById('main-header');
  window.addEventListener('scroll', () => {
    if (window.scrollY > 40) {
      header.classList.add('scrolled');
    } else {
      header.classList.remove('scrolled');
    }
  });
}

// 2. Mobile Menu Toggle
function setupMobileMenu() {
  const menuToggle = document.getElementById('menu-toggle');
  const navLinks = document.getElementById('nav-links');
  
  if (menuToggle && navLinks) {
    menuToggle.addEventListener('click', () => {
      navLinks.classList.toggle('active');
      const icon = menuToggle.querySelector('i');
      if (icon) {
        if (navLinks.classList.contains('active')) {
          icon.className = 'fa-solid fa-xmark';
        } else {
          icon.className = 'fa-solid fa-bars-staggered';
        }
      }
    });

    // Close mobile menu when a navigation link is clicked
    const links = navLinks.querySelectorAll('a');
    links.forEach(link => {
      link.addEventListener('click', () => {
        navLinks.classList.remove('active');
        const icon = menuToggle.querySelector('i');
        if (icon) {
          icon.className = 'fa-solid fa-bars-staggered';
        }
      });
    });
  }
}

// 3. Chatbot Toggle Visibility
function toggleChat() {
  const widget = document.getElementById('chatbot-widget');
  chatbotOpen = !chatbotOpen;
  
  if (chatbotOpen) {
    widget.classList.add('active');
    // Clear notifications bubble
    if (!notificationCleared) {
      const badge = document.getElementById('fab-badge');
      if (badge) badge.style.display = 'none';
      notificationCleared = true;
    }
  } else {
    widget.classList.remove('active');
  }
}

// 4. Send messages & Booking/Reports workflows
async function sendUserMessage() {
  const input = document.getElementById('chat-input');
  const text = input.value.trim();
  if (!text) return;

  // Case A: Active Report Verification mode
  if (reportState.active) {
    if (text.toLowerCase() === 'cancel' || text.toLowerCase() === 'exit') {
      reportState.active = false;
      await appendMessage(text, 'user');
      input.value = '';
      showTypingIndicator();
      setTimeout(async () => {
        removeTypingIndicator();
        await appendMessage("Lab reports query aborted. Let me know if I can help you with anything else!", 'bot');
      }, 800);
      return;
    }
    await handleReportVerificationInput(text);
    input.value = '';
    return;
  }

  // Case B: Active Booking mode
  if (bookingState.active) {
    if (text.toLowerCase() === 'cancel' || text.toLowerCase() === 'exit') {
      bookingState.active = false;
      await appendMessage(text, 'user');
      input.value = '';
      showTypingIndicator();
      setTimeout(async () => {
        removeTypingIndicator();
        await appendMessage("Appointment scheduling cancelled. Let me know if I can assist with anything else!", 'bot');
      }, 800);
      return;
    }
    await handleBookingStepInput(text);
    input.value = '';
    return;
  }

  // Case C: Normal Chat flow
  await appendMessage(text, 'user');
  input.value = '';
  
  showTypingIndicator();
  
  const botReply = await getBotReply(text);
  
  setTimeout(async () => {
    removeTypingIndicator();
    try {
      if (botReply === "START_BOOKING") {
        await startBookingFlow();
      } else {
        await appendMessage(botReply, 'bot');
      }
    } catch (error) {
      console.error("Error in bot response:", error);
      await appendMessage("I'm sorry, I'm having trouble connecting to the server. Please ensure the backend is running.", 'bot');
    }
  }, 1000);
}

function handleInputKeypress(event) {
  if (event.key === 'Enter') {
    sendUserMessage();
  }
}

async function handlePillClick(pillText) {
  await appendMessage(pillText, 'user');
  showTypingIndicator();
  
  const key = pillText.toLowerCase();
  
  setTimeout(async () => {
    removeTypingIndicator();
    
    try {
      if (key.includes('appointment') || key.includes('book') || key.includes('schedule')) {
        await startBookingFlow();
        return;
      }
      
      if (key.includes('doctor')) {
        const response = await getBotReply('doctor');
        await appendMessage(response, 'bot');
        return;
      }

      if (key.includes('report') || key.includes('lab')) {
        reportState.active = true;
        await appendMessage(botResponses['check lab reports'] + "<br><br><span style='font-size:11px; color:var(--text-muted);'>Type your 6-digit code or type <strong>'cancel'</strong> to exit.</span>", 'bot');
        return;
      }
      
      const response = botResponses[key] || botResponses['default'];
      await appendMessage(response, 'bot');
    } catch (error) {
      console.error("Error in pill click response:", error);
      await appendMessage("I'm sorry, I'm having trouble connecting to the server. Please ensure the backend is running.", 'bot');
    }
  }, 1000);
}

// Start booking process
async function startBookingFlow() {
  bookingState = {
    active: true,
    step: 0,
    selectedDoctorId: null,
    selectedSlot: null,
    patientName: '',
    patientReason: '',
    patientEmail: '',
    patientPhone: ''
  };
  
  const menuHtml = await getDoctorsBookingMenu();
  await appendMessage(menuHtml, 'bot');
}

// Generate list of available doctors as click actions
async function getDoctorsBookingMenu() {
  const doctors = await getDoctors();
  const availableDocs = doctors.filter(doc => doc.available);
  
  if (availableDocs.length === 0) {
    bookingState.active = false;
    return "We apologize, but all of our clinicians are currently off-duty or unavailable for booking. Please visit the <strong>Doctor Portal</strong> above to view their shift timings.";
  }
  
  let html = "I can help you coordinate an appointment. Please select one of our available doctors:<br><br>";
  availableDocs.forEach(doc => {
    html += `<button class="action-pill" style="margin-bottom: 8px; width: 100%; text-align: left; display: block;" onclick="chooseDoctorForBooking('${doc.id}')">
              <i class="fa-solid fa-user-doctor" style="color: ${doc.avatarBg}; margin-right: 6px;"></i> <strong>${doc.title}</strong> - ${doc.specialty}
             </button>`;
  });
  html += `<br><span style='font-size:11px; color:var(--text-muted);'>Or type <strong>'cancel'</strong> to exit booking.</span>`;
  return html;
}

// Step 1 handler: Doctor selected
window.chooseDoctorForBooking = async function(doctorId) {
  const doc = await getDoctorById(doctorId);
  if (!doc) return;
  
  await appendMessage(`Selected: ${doc.title}`, 'user');
  bookingState.selectedDoctorId = doctorId;
  bookingState.step = 1;
  
  showTypingIndicator();
  const slots = doc.availableSlots;
  
  setTimeout(async () => {
    removeTypingIndicator();
    
    if (slots.length === 0) {
      await appendMessage(`We're sorry, but <strong>${doc.title}</strong> has no open booking slots today. Please choose another doctor or try again later.`, 'bot');
      bookingState.active = false;
      return;
    }
    
    let html = `Excellent. Please select one of the open time slots for <strong>${doc.title}</strong>:<br><br>`;
    slots.forEach(slot => {
      html += `<button class="action-pill" style="margin: 4px;" onclick="chooseSlotForBooking('${slot}')"><i class="fa-regular fa-clock"></i> ${slot}</button>`;
    });
    html += `<br><br><span style='font-size:11px; color:var(--text-muted);'>Or type <strong>'cancel'</strong> to exit.</span>`;
    await appendMessage(html, 'bot');
  }, 800);
};

// Step 2: Slot selected
window.chooseSlotForBooking = async function(slot) {
  await appendMessage(`Selected slot: ${slot}`, 'user');
  bookingState.selectedSlot = slot;
  bookingState.step = 2;
  
  showTypingIndicator();
  
  setTimeout(async () => {
    removeTypingIndicator();
    await appendMessage(`You've chosen <strong>${slot}</strong>. Please type your <strong>Full Name</strong> in the chat input to continue:`, 'bot');
  }, 800);
};

// Step 3 & 4 text parser
async function handleBookingStepInput(text) {
  await appendMessage(text, 'user');
  showTypingIndicator();
  
  setTimeout(async () => {
    removeTypingIndicator();
    
    if (bookingState.step === 2) {
      bookingState.patientName = text;
      bookingState.step = 3;
      await appendMessage(`Thank you, ${bookingState.patientName}. What is the <strong>medical reason</strong> for your visit today? (e.g. checkup, cardiogram, consultation)`, 'bot');
    } else if (bookingState.step === 3) {
      bookingState.patientReason = text;
      bookingState.step = 4;
      await appendMessage(`Got it. To send you the official appointment letter, please provide your <strong>Email Address</strong>:`, 'bot');
    } else if (bookingState.step === 4) {
      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(text)) {
        await appendMessage(`⚠️ That doesn't look like a valid email address. Please enter a valid <strong>Email Address</strong> (e.g. john@example.com):`, 'bot');
        return;
      }
      bookingState.patientEmail = text;
      bookingState.step = 5;
      await appendMessage(`Got it! Please enter your <strong>Mobile Phone Number</strong> with country code to receive an SMS verification code:<br><code style="font-size:12px;background:rgba(0,82,255,0.08);padding:2px 6px;border-radius:4px">e.g. 919876543210</code>`, 'bot');

    } else if (bookingState.step === 5) {
      // Clean and validate phone number
      let phoneClean = text.replace(/[\s\-\+()]/g, '');
      if (phoneClean.length === 10) phoneClean = '91' + phoneClean;  // Auto-prepend India code
      if (!/^\d{7,15}$/.test(phoneClean)) {
        await appendMessage(`⚠️ Please enter a valid phone number with country code, digits only (e.g. <code>919876543210</code>):`, 'bot');
        return;
      }
      bookingState.patientPhone = phoneClean;
      bookingState.step = 6;
      firebaseConfirmationResult = null;

      // Trigger Firebase Phone Auth (if firebase SDK loaded)
      let firebaseTriggered = false;
      if (typeof firebase !== 'undefined') {
        try {
          if (!window.recaptchaVerifier) {
            window.recaptchaVerifier = new firebase.auth.RecaptchaVerifier('recaptcha-container', {
              'size': 'invisible'
            });
          }
          const appVerifier = window.recaptchaVerifier;
          const formattedPhone = '+' + phoneClean; // Must be E.164 with + prefix
          
          firebaseConfirmationResult = await firebase.auth().signInWithPhoneNumber(formattedPhone, appVerifier);
          firebaseTriggered = true;
          await appendMessage(`📱 A **6-digit SMS verification code** has been sent to **+${bookingState.patientPhone}**.<br><br>Please enter it below to confirm your booking:`, 'bot');
        } catch (err) {
          console.warn("[Firebase Auth] Error launching phone auth:", err.message);
        }
      }

      // Local fallback (if Firebase not configured or fails)
      if (!firebaseTriggered) {
        const verificationRes = await sendVerificationCode(bookingState.patientEmail, bookingState.patientPhone);
        const devOtp = verificationRes && verificationRes.devOtp;
        if (devOtp) {
          console.log(`[SMS OTP Dev Fallback] Code: ${devOtp}`);
          await appendMessage(`📱 SMS not configured — your test verification code is: <strong style="font-size:1.2em;letter-spacing:3px">${devOtp}</strong><br><br>Enter this code below to confirm your booking:`, 'bot');
        } else {
          await appendMessage(`📱 A **4-digit SMS verification code** has been dispatched to your mobile **+${bookingState.patientPhone}**.<br><br>Please enter it below to confirm:`, 'bot');
        }
      }

    } else if (bookingState.step === 6) {
      let verificationSuccessful = false;

      // 1. Verify code via Firebase Auth
      if (firebaseConfirmationResult) {
        try {
          const result = await firebaseConfirmationResult.confirm(text.trim());
          verificationSuccessful = true;
          console.log("[Firebase Auth] Code verified successfully ✓", result.user);
        } catch (err) {
          console.warn("[Firebase Auth] Code verification failed:", err.message);
        }
      }

      // 2. Local fallback verification
      if (!verificationSuccessful) {
        const verificationResult = await verifyCode(bookingState.patientPhone, text.trim());
        if (verificationResult.success) {
          verificationSuccessful = true;
        }
      }

      if (!verificationSuccessful) {
        await appendMessage(`❌ Invalid verification code. Please check the SMS sent to <strong>+${bookingState.patientPhone}</strong> and try again, or type <em>cancel</em> to exit.`, 'bot');
        return;
      }

      // OTP verified — create the appointment
      const doc = await getDoctorById(bookingState.selectedDoctorId);
      const apt = await createAppointment(
        bookingState.selectedDoctorId,
        bookingState.patientName,
        bookingState.selectedSlot,
        bookingState.patientReason,
        bookingState.patientPhone,
        bookingState.patientEmail
      );

      if (apt) {
        await appendMessage(`🎉 <strong>Appointment Confirmed & Verified!</strong><br><br>
                       Physician: <strong>${doc.title}</strong><br>
                       Time Slot: <strong>${bookingState.selectedSlot}</strong><br>
                       Patient: <strong>${bookingState.patientName}</strong><br>
                       Complaint: <strong>${bookingState.patientReason}</strong><br><br>
                       📄 <a href="${apt.pdfUrl}" target="_blank" class="chat-attachment-link"><i class="fa-solid fa-file-pdf"></i> Download Official Appointment Letter</a><br><br>
                       🔔 Your booking details have been saved to your <strong>in-app notification inbox</strong>.`, 'bot');
        showToast("Appointment confirmed!", "success");
      } else {
        await appendMessage("An error occurred during reservation. Please restart booking.", 'bot');
      }
      bookingState.active = false;
    } else {
      await appendMessage("Please select one of the menu buttons above, or type 'cancel' to exit booking.", 'bot');
    }
  }, 1000);
}

// Lab report verification handler
async function handleReportVerificationInput(text) {
  await appendMessage(text, 'user');
  showTypingIndicator();
  
  const result = await verifySecurityCode(text);
  
  setTimeout(async () => {
    removeTypingIndicator();
    
    if (result.success) {
      let html = `🔑 <strong>HIPAA Security Verification Passed!</strong><br>
                  Patient: <strong>${result.patient}</strong><br>
                  Record Date: <strong>${result.date}</strong><br><br>
                  <table style="width:100%; border-collapse:collapse; font-size:12px; margin-top:8px;">
                    <thead>
                      <tr style="border-bottom:1px solid #CBD5E1;">
                        <th style="text-align:left; padding:4px;">Diagnostic Test</th>
                        <th style="text-align:center; padding:4px;">Status</th>
                      </tr>
                    </thead>
                    <tbody>`;
                    
      result.diagnostics.forEach(d => {
        const color = d.status === 'Normal' ? '#10B981' : d.status === 'Critical Check' ? '#EF4444' : '#FFA800';
        html += `<tr style="border-bottom:1px solid rgba(0,0,0,0.03);">
                  <td style="padding:6px 4px;">
                    <strong>${d.test}</strong><br>
                    <span style="font-size:10px; color:var(--text-secondary);">${d.remarks}</span>
                  </td>
                  <td style="text-align:center; padding:6px 4px; font-weight:600; color:${color}">${d.status}</td>
                 </tr>`;
      });
      
      html += `</tbody></table>`;
      
      await appendMessage(html, 'bot');
      reportState.active = false;
    } else {
      await appendMessage(`❌ ${result.error}`, 'bot');
    }
  }, 1000);
}

// Bot reply router
async function getBotReply(query) {
  const normalizedQuery = query.toLowerCase();
  
  if (normalizedQuery.includes('appointment') || normalizedQuery.includes('book') || normalizedQuery.includes('schedule')) {
    return "START_BOOKING";
  }
  if (normalizedQuery.includes('report') || normalizedQuery.includes('lab') || normalizedQuery.includes('blood')) {
    reportState.active = true;
    return botResponses['check lab reports'] + "<br><br><span style='font-size:11px; color:var(--text-muted);'>Type your 6-digit code or type <strong>'cancel'</strong> to exit.</span>";
  }
  if (normalizedQuery.includes('emergency') || normalizedQuery.includes('icu') || normalizedQuery.includes('er')) {
    return botResponses['emergency help'];
  }
  if (normalizedQuery.includes('doctor') || normalizedQuery.includes('cardiologist') || normalizedQuery.includes('surgeon')) {
    const doctors = await getDoctors();
    let reply = "<strong>Vaisoverse Clinician Registry:</strong><br><br>";
    doctors.forEach(doc => {
      const statusIcon = doc.available ? "🟢 Available" : "🔴 Off-duty";
      reply += `<div style="margin-bottom: 12px; padding: 12px; background: rgba(0, 82, 255, 0.03); border-radius: var(--radius-md); border: 1px solid var(--border-color);">
        <strong>${doc.title}</strong> (${doc.specialty})<br>
        Status: <strong>${statusIcon}</strong><br>
        Shift Hours: ${doc.hours}<br>
        <span style="font-size:12px; color:var(--text-secondary);">${doc.bio}</span>
      </div>`;
    });
    return reply;
  }
  if (normalizedQuery.includes('bed') || normalizedQuery.includes('occupancy') || normalizedQuery.includes('available')) {
    return "Our Live Dashboard reports <strong>32 beds available</strong> across ICU, Cardiology, and ER wings. Patient tracking forecasts 4 checkouts in the next 2 hours.";
  }
  
  return `You mentioned "${query}". Our Vaisoverse AI Healthcare platform aggregates clinical charts, automated diagnostics, and scheduling rules. Please let us know how we can support your hospital network!`;
}

// Append message directly to chatbot DOM
function appendMessageDirectly(text, sender, time) {
  const messagesContainer = document.getElementById('chat-messages');
  const wrapper = document.createElement('div');
  wrapper.className = `chat-bubble-wrapper ${sender}`;
  
  const avatarHtml = sender === 'bot' 
    ? `<div class="msg-avatar"><img src="assets/images/robot_avatar.png" alt="Bot"></div>` 
    : `<div class="msg-avatar"><i class="fa-solid fa-user-md" style="color: var(--color-purple); font-size:14px;"></i></div>`;
  
  wrapper.innerHTML = `
    ${avatarHtml}
    <div>
      <div class="chat-bubble">
        ${text}
      </div>
      <span class="msg-time">${time}</span>
    </div>
  `;
  
  messagesContainer.appendChild(wrapper);
  setupChatAutoscroll();
}

// Wrapper for appending user and bot dialogues with server persistence
async function appendMessage(text, sender) {
  const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  appendMessageDirectly(text, sender, time);
  
  // Push message to backend database
  try {
    await saveChatMessage('patient-session', { text, sender, time });
  } catch (err) {
    console.error("Failed to save chat message:", err);
  }
}

// 5. Typing Indicator Controls
function showTypingIndicator() {
  const messagesContainer = document.getElementById('chat-messages');
  const indicator = document.createElement('div');
  indicator.className = 'typing-indicator';
  indicator.id = 'typing-indicator-bubble';
  indicator.innerHTML = `
    <div class="typing-dot"></div>
    <div class="typing-dot"></div>
    <div class="typing-dot"></div>
  `;
  messagesContainer.appendChild(indicator);
  setupChatAutoscroll();
}

function removeTypingIndicator() {
  const indicator = document.getElementById('typing-indicator-bubble');
  if (indicator) {
    indicator.remove();
  }
}

function setupChatAutoscroll() {
  const messagesContainer = document.getElementById('chat-messages');
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

async function clearChat() {
  const messagesContainer = document.getElementById('chat-messages');
  messagesContainer.innerHTML = `
    <div class="chat-bubble-wrapper bot">
      <div class="msg-avatar">
        <img src="assets/images/robot_avatar.png" alt="Bot Avatar">
      </div>
      <div>
        <div class="chat-bubble">
          Welcome to Vaisoverse AI. How can I assist you?
        </div>
        <span class="msg-time">Just now</span>
      </div>
    </div>
  `;
  
  // Clear chat history on server
  await deleteChatHistory('patient-session');
  
  showToast("Chat history reset", "success");
}

// 6. Voice Mockup Controls
async function toggleVoiceMockup() {
  const voiceBtn = document.getElementById('voice-btn');
  voiceActive = !voiceActive;
  
  if (voiceActive) {
    voiceBtn.style.color = '#EF4444';
    voiceBtn.classList.add('pulse');
    showToast("Voice Listening Active... Speak now.", "info");
    
    // Simulate user speaking after 3 seconds
    setTimeout(async () => {
      if (voiceActive) {
        await appendMessage("Find cardiologists on duty today", 'user');
        voiceBtn.removeAttribute('style');
        voiceBtn.classList.remove('pulse');
        voiceActive = false;
        
        showTypingIndicator();
        setTimeout(async () => {
          removeTypingIndicator();
          await appendMessage("Searching duty rosters... <strong>Dr. Alan Mercer</strong> and <strong>Dr. Julia Reynolds</strong> are currently on shift in Cardiology Wing B.", 'bot');
        }, 1100);
      }
    }, 3200);
  } else {
    voiceBtn.removeAttribute('style');
    voiceBtn.classList.remove('pulse');
    showToast("Voice Listening Deactivated", "info");
  }
}

// 7. File Upload Integration
function triggerFileUpload() {
  document.getElementById('chat-file-input').click();
}

async function handleFileSelected(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  showToast(`Uploading ${file.name} to HIPAA storage...`, 'info');
  
  try {
    const fileMeta = await uploadPatientFile(file);
    
    // Render uploaded file as clickable attachment link
    await appendMessage(`<i class="fa-solid fa-file-pdf"></i> Attached Report: <a href="${fileMeta.url}" target="_blank" class="chat-attachment-link"><strong>${fileMeta.name}</strong></a> (${(fileMeta.size/1024).toFixed(1)} KB)`, 'user');
    
    showTypingIndicator();
    setTimeout(async () => {
      removeTypingIndicator();
      await appendMessage(`I have safely parsed and uploaded your medical attachment <strong>${fileMeta.name}</strong>. A diagnostic link has been registered in the secure clinician directory.`, 'bot');
    }, 1500);
  } catch (err) {
    showToast("File upload failed. Please try again.", "error");
    console.error("Upload error:", err);
  }
}

// 8. Book Demo (Portal Login) Modal Logic
function openDemoModal() {
  document.getElementById('demo-modal').classList.add('active');
  // Reset tabs to login
  toggleAuthMode('login');
  // Reset form inputs and default to doctor role on open
  selectLoginRole('doctor');
  document.getElementById('login-username').value = '';
  document.getElementById('login-password').value = '';
  
  // Clear registration fields if present
  if (document.getElementById('reg-name')) {
    document.getElementById('reg-name').value = '';
    document.getElementById('reg-username').value = '';
    document.getElementById('reg-password').value = '';
    document.getElementById('reg-email').value = '';
    document.getElementById('reg-phone').value = '';
    document.getElementById('reg-age').value = '';
  }
}

function closeDemoModal() {
  document.getElementById('demo-modal').classList.remove('active');
}

// Portal login role selector toggle
function selectLoginRole(role) {
  document.getElementById('login-role').value = role;
  
  const cards = document.querySelectorAll('.role-card');
  cards.forEach(card => {
    if (card.getAttribute('data-role') === role) {
      card.classList.add('active');
    } else {
      card.classList.remove('active');
    }
  });

  const nameInput = document.getElementById('login-username');
  if (role === 'doctor') {
    nameInput.placeholder = 'e.g., mercer, reynolds, carter';
  } else if (role === 'patient') {
    nameInput.placeholder = 'e.g., dowson, watson, miller';
  } else {
    nameInput.placeholder = 'e.g., pharmacy';
  }
}

// Handle login form submission
async function handleLogin(event) {
  event.preventDefault();
  const role = document.getElementById('login-role').value;
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value.trim();
  
  try {
    const result = await authenticateUser(username, password, role);
    if (result.success) {
      sessionStorage.setItem('vaiso_session', JSON.stringify(result.user));
      showToast(`Welcome back, ${result.user.name}! Redirecting...`, 'success');
      
      setTimeout(() => {
        closeDemoModal();
        if (role === 'doctor') {
          window.location.href = 'doctor.html';
        } else if (role === 'patient') {
          window.location.href = 'patient.html';
        } else if (role === 'pharmacy') {
          window.location.href = 'pharmacy.html';
        }
      }, 1000);
    }
  } catch (error) {
    showToast(error.message || 'Login failed. Please verify credentials.', 'error');
  }
}

// Toggle Auth mode (Login vs Register) in modal
function toggleAuthMode(mode) {
  const loginForm = document.getElementById('portal-login-form');
  const registerForm = document.getElementById('portal-register-form');
  const tabLogin = document.getElementById('auth-tab-login');
  const tabRegister = document.getElementById('auth-tab-register');
  
  if (mode === 'login') {
    loginForm.style.display = 'block';
    registerForm.style.display = 'none';
    tabLogin.classList.add('active-tab');
    tabRegister.classList.remove('active-tab');
  } else {
    loginForm.style.display = 'none';
    registerForm.style.display = 'block';
    tabLogin.classList.remove('active-tab');
    tabRegister.classList.add('active-tab');
    // Default to patient when switching to register tab
    selectRegRole('patient');
  }
}

// Select registration role (Doctor / Patient / Pharmacy)
function selectRegRole(role) {
  document.getElementById('reg-role').value = role;

  // Toggle active state on role cards
  document.querySelectorAll('#reg-role-cards .role-card').forEach(card => {
    card.classList.toggle('active', card.getAttribute('data-reg-role') === role);
  });

  // Show/hide role-specific field blocks
  document.getElementById('reg-patient-fields').style.display  = role === 'patient'  ? 'block' : 'none';
  document.getElementById('reg-doctor-fields').style.display   = role === 'doctor'   ? 'block' : 'none';
  document.getElementById('reg-pharmacy-fields').style.display = role === 'pharmacy' ? 'block' : 'none';

  // Update submit button colour per role
  const btn = document.getElementById('reg-submit-btn');
  if (role === 'doctor') {
    btn.style.background = '#7000FF';
    btn.style.borderColor = '#7000FF';
  } else if (role === 'pharmacy') {
    btn.style.background = '#F59E0B';
    btn.style.borderColor = '#F59E0B';
  } else {
    btn.style.background = 'var(--color-success)';
    btn.style.borderColor = 'var(--color-success)';
  }
}

// Handle registration form submission (all roles)
async function handleRegister(event) {
  event.preventDefault();

  const role        = document.getElementById('reg-role').value;
  const name        = document.getElementById('reg-name').value.trim();
  const username    = document.getElementById('reg-username').value.trim();
  const password    = document.getElementById('reg-password').value.trim();
  const email       = document.getElementById('reg-email').value.trim();
  const phone       = document.getElementById('reg-phone').value.trim();

  try {
    showToast('Creating account...', 'info');
    let result;

    if (role === 'patient') {
      const age        = document.getElementById('reg-age').value;
      const gender     = document.getElementById('reg-gender').value;
      const bloodGroup = document.getElementById('reg-blood').value;
      result = await registerUser({ name, username, password, email, phone, age, gender, bloodGroup });

    } else if (role === 'doctor') {
      const specialty     = document.getElementById('reg-specialty').value;
      const qualification = document.getElementById('reg-qualification').value.trim();
      const experience    = document.getElementById('reg-experience').value || '0';
      const consultFee    = document.getElementById('reg-consult-fee').value || '50';
      result = await registerDoctor({ name, username, password, email, phone, specialty, qualification, experience, consultFee });

    } else if (role === 'pharmacy') {
      const pharmacyName    = document.getElementById('reg-pharmacy-name').value.trim();
      const license         = document.getElementById('reg-license').value.trim();
      const address         = document.getElementById('reg-pharmacy-address').value.trim();
      result = await registerPharmacy({ name, username, password, email, phone, pharmacyName, license, address });
    }

    if (result && result.success) {
      sessionStorage.setItem('vaiso_session', JSON.stringify(result.user));
      showToast(`Welcome, ${result.user.name}! Redirecting to your portal...`, 'success');
      setTimeout(() => {
        closeDemoModal();
        if (role === 'doctor')   window.location.href = 'doctor.html';
        else if (role === 'pharmacy') window.location.href = 'pharmacy.html';
        else window.location.href = 'patient.html';
      }, 1200);
    }
  } catch (error) {
    showToast(error.message || 'Registration failed. Please check your inputs.', 'error');
  }
}




// Shortcut login handler
async function quickLogin(role, username) {
  selectLoginRole(role);
  document.getElementById('login-username').value = username;
  document.getElementById('login-password').value = 'password';

  showToast('Connecting to secure gateway...', 'info');
  setTimeout(async () => {
    try {
      const result = await authenticateUser(username, 'password', role);
      if (result.success) {
        sessionStorage.setItem('vaiso_session', JSON.stringify(result.user));
        showToast(`Access granted! Entering ${role} portal...`, 'success');
        setTimeout(() => {
          closeDemoModal();
          if (role === 'doctor') {
            window.location.href = 'doctor.html';
          } else if (role === 'patient') {
            window.location.href = 'patient.html';
          } else if (role === 'pharmacy') {
            window.location.href = 'pharmacy.html';
          }
        }, 1000);
      }
    } catch (e) {
      showToast('Quick login failed: ' + e.message, 'error');
    }
  }, 600);
}

// 9. Toast Notification Handler
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
  }
  
  container.classList.add('active');
  
  // Auto-hide toast
  setTimeout(() => {
    container.classList.remove('active');
  }, 3500);
}

// ==========================================
// PRICING & SUBSCRIPTION LOGIC (Fullstack)
// ==========================================

let selectedPlanData = { name: '', price: 0 };

// Toggle Monthly/Yearly Billing
function toggleBillingCycle(isYearly) {
  const silverVal = document.getElementById('price-silver');
  const goldVal = document.getElementById('price-gold');
  const platinumVal = document.getElementById('price-platinum');
  
  const monthlyLabel = document.getElementById('billing-monthly');
  const yearlyLabel = document.getElementById('billing-yearly');
  
  // Transition fade-out
  [silverVal, goldVal, platinumVal].forEach(el => {
    if (el) {
      el.style.opacity = 0;
      el.style.transform = 'translateY(-10px)';
      el.style.transition = 'all 0.2s ease-in-out';
    }
  });
  
  setTimeout(() => {
    if (isYearly) {
      // 20% discount
      if (silverVal) silverVal.innerText = '11,999';
      if (goldVal) goldVal.innerText = '31,999';
      if (platinumVal) platinumVal.innerText = '63,999';
      
      if (monthlyLabel) monthlyLabel.classList.remove('active');
      if (yearlyLabel) yearlyLabel.classList.add('active');
    } else {
      if (silverVal) silverVal.innerText = '14,999';
      if (goldVal) goldVal.innerText = '39,999';
      if (platinumVal) platinumVal.innerText = '79,999';
      
      if (monthlyLabel) monthlyLabel.classList.add('active');
      if (yearlyLabel) yearlyLabel.classList.remove('active');
    }
    
    // Transition fade-in
    [silverVal, goldVal, platinumVal].forEach(el => {
      if (el) {
        el.style.opacity = 1;
        el.style.transform = 'translateY(0)';
      }
    });
  }, 200);
}

// Open Subscription Modal
function openSubscriptionModal(planName, basePrice) {
  const isYearly = document.getElementById('billing-cycle-toggle').checked;
  const finalPrice = isYearly ? Math.floor(basePrice * 0.8) : basePrice;
  const cycleText = isYearly ? 'Billed Annually' : 'Billed Monthly';
  
  selectedPlanData = { name: planName, price: finalPrice };
  
  document.getElementById('summary-plan').innerText = `${planName} Plan`;
  document.getElementById('summary-cycle').innerText = cycleText;
  document.getElementById('summary-price').innerText = `₹${finalPrice.toLocaleString('en-IN')}/${isYearly ? 'yr' : 'mo'}`;
  
  document.getElementById('subscription-modal').classList.add('active');
}

// Close Subscription Modal
function closeSubscriptionModal() {
  document.getElementById('subscription-modal').classList.remove('active');
}

// Format Credit Card number with spaces
function formatCardNumber(input) {
  let v = input.value.replace(/\s+/g, '').replace(/[^0-9]/gi, '');
  let parts = [];
  for (let i = 0, len = v.length; i < len; i += 4) {
    parts.push(v.substring(i, i + 4));
  }
  input.value = parts.join(' ');
}

// Format Credit Card Expiry Date (MM/YY)
function formatCardExpiry(input) {
  let v = input.value.replace(/[^0-9]/gi, '');
  if (v.length >= 2) {
    input.value = v.substring(0, 2) + '/' + v.substring(2, 4);
  } else {
    input.value = v;
  }
}

// Submit Subscription form to Node Backend
async function submitSubscriptionForm(event) {
  event.preventDefault();
  
  const hospitalName = document.getElementById('sub-hospital').value.trim();
  const billingEmail = document.getElementById('sub-email').value.trim();
  
  // Save active subscription in local storage & post to Node API
  const isYearly = document.getElementById('billing-cycle-toggle').checked;
  const billingTerm = isYearly ? 'Yearly' : 'Monthly';
  const planInfoString = `${selectedPlanData.name} Plan (${billingTerm})`;
  
  try {
    await saveSubscription(planInfoString, hospitalName);
    
    // Close Modal
    closeSubscriptionModal();
    
    // Update header buttons
    await updateHeaderPlanState();
    
    // Trigger Toast Notification
    showToast(`🎉 Subscription Activated! <strong>${planInfoString}</strong> is now live for ${hospitalName}.`, 'success');
  } catch (err) {
    showToast("Checkout authorization failed", "error");
    console.error("Subscription save error:", err);
  }
  
  // Clear checkout form fields
  document.getElementById('sub-hospital').value = '';
  document.getElementById('sub-email').value = '';
  document.getElementById('sub-card').value = '';
  document.getElementById('sub-expiry').value = '';
  document.getElementById('sub-cvv').value = '';
}

// Update header button to reflect active plan from Node Backend API
async function updateHeaderPlanState() {
  try {
    const sub = await fetchSubscription();
    const demoBtn = document.querySelector('header .btn-primary');
    
    if (sub && sub.activePlan && demoBtn) {
      demoBtn.innerHTML = `<i class="fa-solid fa-crown" style="color: #FFD700; margin-right: 4px;"></i> ${sub.activePlan.split(' ')[0]} Active`;
      demoBtn.style.background = 'linear-gradient(135deg, #7000FF, #D946EF)';
      demoBtn.setAttribute('onclick', `showToast('You are subscribed to the ${sub.activePlan}. Thank you!', 'info')`);
    }
  } catch (err) {
    console.error("Failed to load active plan details:", err);
  }
}

// ==========================================
// REAL-TIME NOTIFICATION INBOX
// ==========================================

let unreadCount = 0;

function initNotificationInbox() {
  // Load existing notifications from server
  fetchNotifications()
    .then(notifications => {
      notifications.forEach(n => renderNotifCard(n, false));
      updateBadge();
    })
    .catch(() => {});

  // Listen for live notifications via SSE
  const sseSource = new EventSource('/api/events');
  sseSource.onmessage = (e) => {
    try {
      const payload = JSON.parse(e.data);
      if (payload.event === 'new_notification') {
        renderNotifCard(payload.data, true);
        updateBadge(true);
        // Briefly ring the bell
        const bell = document.getElementById('notif-bell-btn');
        if (bell) {
          bell.classList.add('has-unread');
          bell.style.animation = 'bell-ring 1.2s ease';
          setTimeout(() => { bell.style.animation = ''; }, 1400);
        }
      }
    } catch (_) {}
  };

  // Offline notification fallback event listener
  window.addEventListener('offline_notification', (e) => {
    renderNotifCard(e.detail, true);
    updateBadge(true);
    // Briefly ring the bell
    const bell = document.getElementById('notif-bell-btn');
    if (bell) {
      bell.classList.add('has-unread');
      bell.style.animation = 'bell-ring 1.2s ease';
      setTimeout(() => { bell.style.animation = ''; }, 1400);
    }
  });
}

function renderNotifCard(notif, prepend = true) {
  const list = document.getElementById('notif-list');
  const empty = document.getElementById('notif-empty');
  if (empty) empty.style.display = 'none';

  const timeAgo = formatTimeAgo(new Date(notif.time));
  const card = document.createElement('div');
  card.className = `notif-card type-${notif.type}${notif.read ? '' : ' unread'}`;
  card.id = `notif-${notif.id}`;
  card.innerHTML = `
    <div class="notif-card-header">
      <span class="notif-card-icon">${notif.icon}</span>
      <div class="notif-card-meta">
        <div class="notif-card-subject">
          ${!notif.read ? '<span class="notif-unread-dot"></span>' : ''}
          ${notif.subject}
        </div>
        <p class="notif-card-to">To: ${notif.to}</p>
      </div>
      <span class="notif-card-time">${timeAgo}</span>
    </div>
    <div class="notif-card-body">${notif.body}</div>
    <button class="notif-action-btn" onclick="dismissNotif(${notif.id})">✕ Dismiss</button>
  `;

  if (!notif.read) {
    card.addEventListener('click', () => markNotifRead(notif.id, card));
    unreadCount++;
  }

  if (prepend && list.firstChild) {
    list.insertBefore(card, list.firstChild);
  } else {
    list.appendChild(card);
  }
}

function markNotifRead(id, card) {
  markNotificationRead(id).catch(() => {});
  card.classList.remove('unread');
  const dot = card.querySelector('.notif-unread-dot');
  if (dot) dot.remove();
  if (unreadCount > 0) unreadCount--;
  updateBadge();
}

function dismissNotif(id) {
  deleteNotification(id).catch(() => {});
  const card = document.getElementById(`notif-${id}`);
  if (card) {
    card.style.opacity = '0';
    card.style.transform = 'translateX(20px)';
    card.style.transition = 'all 0.25s ease';
    setTimeout(() => {
      card.remove();
      checkIfEmpty();
    }, 280);
  }
  if (unreadCount > 0) unreadCount--;
  updateBadge();
}

async function clearAllNotifications() {
  await clearAllNotificationsApi().catch(() => {});
  const list = document.getElementById('notif-list');
  list.innerHTML = '';
  const empty = document.createElement('div');
  empty.className = 'notif-empty-state';
  empty.innerHTML = `<img src="assets/images/Image-14.svg" alt="" class="notif-empty-illustration" aria-hidden="true"><p>Your inbox is empty.<br>OTP codes and appointment confirmations will appear here.</p>`;
  list.appendChild(empty);
  unreadCount = 0;
  updateBadge();
}

function checkIfEmpty() {
  const list = document.getElementById('notif-list');
  if (list.querySelectorAll('.notif-card').length === 0) {
    list.innerHTML = `<div class="notif-empty-state" id="notif-empty"><img src="assets/images/Image-14.svg" alt="" class="notif-empty-illustration" aria-hidden="true"><p>Your inbox is empty.<br>OTP codes and confirmations will appear here.</p></div>`;
  }
}

function updateBadge(increment = false) {
  if (increment) unreadCount++;
  const badge = document.getElementById('notif-badge');
  const countLabel = document.getElementById('notif-count-label');
  const bell = document.getElementById('notif-bell-btn');
  if (badge) {
    badge.textContent = unreadCount;
    badge.style.display = unreadCount > 0 ? 'flex' : 'none';
  }
  if (countLabel) countLabel.textContent = unreadCount > 0 ? `${unreadCount} unread message${unreadCount > 1 ? 's' : ''}` : 'All caught up';
  if (bell) bell.classList.toggle('has-unread', unreadCount > 0);
}

function toggleNotifPanel() {
  const panel = document.getElementById('notif-panel');
  const overlay = document.getElementById('notif-overlay');
  const isOpen = panel.classList.contains('open');
  if (isOpen) {
    closeNotifPanel();
  } else {
    panel.classList.add('open');
    overlay.classList.add('active');
  }
}

function closeNotifPanel() {
  document.getElementById('notif-panel').classList.remove('open');
  document.getElementById('notif-overlay').classList.remove('active');
}

function formatTimeAgo(date) {
  const diff = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return date.toLocaleDateString();
}

