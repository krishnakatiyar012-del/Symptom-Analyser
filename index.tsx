import React, { useState, useEffect, useRef, useContext, createContext } from "react";
import ReactDOM from "react-dom/client";
import { GoogleGenAI, Chat, Part, LiveServerMessage, Modality, Blob } from "@google/genai";

const API_KEY = process.env.API_KEY;

// --- Data & Language Types ---
type AppState = "disclaimer" | "input" | "chat" | "conclusion" | "report";
type TipsState = "idle" | "loading" | "visible" | "declined";
type Message = { role: "user" | "model"; parts: Part[] };
type ImageData = { dataUrl: string; mimeType: string };
type ReportData = { patientComplaint: string; symptomImages: string[]; diagnosticQuestions: { question: string; answer: string }[]; preliminaryAssessment: { potentialConditions: { name: string; confidence: string; keyIndicators: string[] }[] } };
type Language = 'en' | 'es' | 'hi';
type UserProfile = { height: string; weight: string; age: string; conditions: string; language: Language; };
type User = { email: string; phone: string; password: string; profile: UserProfile | null };
type ActivePage = "dashboard" | "consult" | "diagnose" | "reports" | "profile";
type StoredReport = { id: string; timestamp: string; data: ReportData };

// --- Translations ---
const translations = {
  en: {
    welcomeBack: "Welcome Back", createAccount: "Create Account", emailAddress: "Email Address", phoneNumber: "Phone Number", password: "Password", login: "Login", signUp: "Sign Up", processing: "Processing...", invalidCredentialsError: "Invalid email or password.", userExistsError: "User with this email already exists.", dontHaveAccount: "Don't have an account?", alreadyHaveAccount: "Already have an account?",
    completeYourProfile: "Complete Your Profile", profileSetupSubheading: "This information helps us provide a more personalized experience.", height: "Height (e.g., 5ft 10in or 178cm)", weight: "Weight (e.g., 160lbs or 72kg)", age: "Age", existingConditions: "Existing Conditions (e.g., Diabetes, High BP)", existingConditionsPlaceholder: "Separate with commas", saveAndContinue: "Save and Continue", saving: "Saving...",
    profile: "Profile", logout: "Logout", language: "Language",
    dashboard: "Dashboard", consult: "Consult", diagnose: "Diagnose", reports: "Reports",
    dashboardWelcome: "Welcome, User!", dashboardSubheading: "Your personal health assistant is ready.", startNewDiagnosis: "Start New Diagnosis", startNewDiagnosisSub: "Describe your symptoms to get a preliminary analysis.", viewPastReports: "View Past Reports", viewPastReportsSub: "Access your previous symptom analysis reports.",
    yourReports: "Your Reports", noReports: "You don't have any reports yet.", backToList: "← Back to List", complaint: "Complaint", date: "Date", patientComplaint: "Patient's Initial Complaint", symptomImages: "Symptom Images", diagnosticQA: "Diagnostic Q&A", preliminaryAssessment: "Preliminary Assessment",
    yourProfile: "Your Profile", editProfile: "Edit Profile", saveChanges: "Save Changes", cancel: "Cancel",
    medicalDisclaimer: "Medical Disclaimer", disclaimerText: "SymptomAI is an AI-powered informational tool and is not a substitute for professional medical advice, diagnosis, or treatment. Always seek the advice of your physician or other qualified health provider with any questions you may have regarding a medical condition.", iUnderstandAndAgree: "I Understand and Agree", describeSymptoms: "Describe your symptoms in detail:", describeSymptomsPlaceholder: "e.g., I have a sore throat, a headache, and a rash on my arm...", uploadPhotos: "Upload photos of visible symptoms (optional):", clickToSelectImages: "Click to select images", startAnalysis: "Start Analysis", analyzing: "Analyzing...",
    typeYourAnswer: "Type your answer...", send: "Send",
    preliminaryAnalysis: "Preliminary Analysis", confidence: "Confidence", keyIndicators: "Key Indicators", finalDisclaimer: "This analysis is for informational purposes only. Please consult a qualified healthcare professional.", askForTips: "Would you like to receive some primary care and first-aid tips?", yesPlease: "Yes, please", noThankYou: "No, thank you", generatingTips: "Generating tips...", primaryCareTips: "Primary Care Tips", generateReport: "Generate Doctor's Summary", generating: "Generating...", startNewAnalysis: "Start New Analysis",
    doctorsSummary: "Doctor's Summary",
    audioConversation: "Audio Conversation", aiIsListening: "ArogyaAI is listening...", aiIsThinking: "ArogyaAI is thinking...", endConversation: "End Conversation",
    consultTitle: "Consult a Doctor",
    consultFindNearby: "Find Nearby Health Centers",
    consultLocationPrompt: "Please allow location access to find healthcare centers near you.",
    allowLocation: "Allow Location Access",
    gettingLocation: "Getting your location...",
    locationDenied: "Location access was denied. Please enable it in your browser settings to use this feature.",
    nearbyClinics: "Nearby Health Centers",
    nearbyAmbulances: "Nearby Ambulances",
    sos: "SOS",
    noAmbulanceData: "no ambulance data to show",
    kmAway: "{{distance}} away",
    viewOnMap: "View on Map",
    contactDoctor: "Contact a Doctor",
    chat: "Chat",
    voiceCall: "Voice Call",
    videoCall: "Video Call",
    symptomAnalyzerSystemInstruction: `You are an expert medical diagnostic assistant named 'SymptomAI'. Your purpose is to help users understand potential causes for their symptoms. Follow these rules strictly:
1. You are NOT a doctor. Never provide a definitive diagnosis or treatment advice.
2. Your primary goal is to gather information. Analyze the user's initial input (text and images) and identify what crucial information is missing.
3. Ask clear, simple, and targeted questions one at a time to fill in the gaps. Prefer multiple-choice or yes/no questions when possible.
4. After gathering sufficient information, begin your final message with the token \`CONCLUSION:\`. Then, present a list of potential conditions as a JSON object string. For each condition, provide a 'name', a 'confidence' (Low, Medium, or High), and a list of 'keyIndicators'.
5. ALWAYS conclude your analysis summary with a strong recommendation to consult a healthcare professional.
6. If the user later asks for a doctor's summary or report, reformat the entire conversation into a structured report. Respond ONLY with a single JSON object for the report. The JSON should have keys: 'patientComplaint', 'symptomImages' (as an array of data URLs), 'diagnosticQuestions' (array of {question, answer}), and 'preliminaryAssessment'. Do not include any other text or markdown formatting.`,
    symptomAnalyzerSystemInstructionVoice: `You are an expert medical diagnostic assistant named 'SymptomAI'. Your purpose is to help users understand potential causes for their symptoms. Follow these rules strictly:
1. You are NOT a doctor.
2. Ask clear, simple, and targeted questions one at a time.
3. After gathering sufficient information, begin your final message with the token \`CONCLUSION:\`. Then, present a list of possible conditions as a JSON object string.
4. This is a voice conversation. Keep your responses concise and clear.`,
    generateReportPrompt: `Based on our entire conversation, please generate a structured doctor's summary. Respond ONLY with a single JSON object. The JSON should have these keys: 'patientComplaint', 'symptomImages' (an array containing these data URLs: {{image_data_urls}}), 'diagnosticQuestions', and 'preliminaryAssessment'. Do not include any other text or markdown formatting.`,
    treatmentTipsPrompt: `Based on the potential conditions of "{{conditionNames}}", provide safe, primary first-aid and care tips. This is for someone in a rural or underdeveloped area with limited immediate access to a doctor. 
    IMPORTANT RULES:
    1. Start with a very strong, clear disclaimer in bold: **"This is not a substitute for professional medical advice. Please see a doctor as soon as possible."**
    2. Do NOT suggest any specific prescription medications. You can suggest over-the-counter relief if appropriate and safe (e.g., staying hydrated, rest, warm salt water gargle).
    3. The advice must be cautious, focusing on symptom relief and preventing the condition from worsening.
    4. Structure the tips with clear headings or bullet points.`,
  },
  es: {
    welcomeBack: "Bienvenido de Nuevo", createAccount: "Crear Cuenta", emailAddress: "Correo Electrónico", phoneNumber: "Número de Teléfono", password: "Contraseña", login: "Iniciar Sesión", signUp: "Registrarse", processing: "Procesando...", invalidCredentialsError: "Correo electrónico o contraseña no válidos.", userExistsError: "Un usuario con este correo electrónico ya existe.", dontHaveAccount: "¿No tienes una cuenta?", alreadyHaveAccount: "¿Ya tienes una cuenta?",
    completeYourProfile: "Completa Tu Perfil", profileSetupSubheading: "Esta información nos ayuda a proporcionar una experiencia más personalizada.", height: "Altura (ej., 5ft 10in o 178cm)", weight: "Peso (ej., 160lbs o 72kg)", age: "Edad", existingConditions: "Condiciones Existentes (ej., Diabetes, Presión Alta)", existingConditionsPlaceholder: "Separar con comas", saveAndContinue: "Guardar y Continuar", saving: "Guardando...",
    profile: "Perfil", logout: "Cerrar Sesión", language: "Idioma",
    dashboard: "Inicio", consult: "Consulta", diagnose: "Diagnóstico", reports: "Informes",
    dashboardWelcome: "¡Bienvenido, Usuario!", dashboardSubheading: "Tu asistente de salud personal está listo.", startNewDiagnosis: "Iniciar Nuevo Diagnóstico", startNewDiagnosisSub: "Describe tus síntomas para obtener un análisis preliminar.", viewPastReports: "Ver Informes Anteriores", viewPastReportsSub: "Accede a tus informes de análisis de síntomas previos.",
    yourReports: "Tus Informes", noReports: "Aún no tienes informes.", backToList: "← Volver a la Lista", complaint: "Queja", date: "Fecha", patientComplaint: "Queja Inicial del Paciente", symptomImages: "Imágenes de Síntomas", diagnosticQA: "Preguntas y Respuestas de Diagnóstico", preliminaryAssessment: "Evaluación Preliminar",
    yourProfile: "Tu Perfil", editProfile: "Editar Perfil", saveChanges: "Guardar Cambios", cancel: "Cancelar",
    medicalDisclaimer: "Aviso Médico", disclaimerText: "SymptomAI es una herramienta informativa impulsada por IA y no sustituye el consejo, diagnóstico o tratamiento médico profesional. Siempre busca el consejo de tu médico u otro proveedor de salud calificado con cualquier pregunta que puedas tener sobre una condición médica.", iUnderstandAndAgree: "Entiendo y Acepto", describeSymptoms: "Describe tus síntomas en detalle:", describeSymptomsPlaceholder: "Ej., tengo dolor de garganta, dolor de cabeza y una erupción en el brazo...", uploadPhotos: "Sube fotos de síntomas visibles (opcional):", clickToSelectImages: "Haz clic para seleccionar imágenes", startAnalysis: "Iniciar Análisis", analyzing: "Analizando...",
    typeYourAnswer: "Escribe tu respuesta...", send: "Enviar",
    preliminaryAnalysis: "Análisis Preliminar", confidence: "Confianza", keyIndicators: "Indicadores Clave", finalDisclaimer: "Este análisis es solo para fines informativos. Por favor, consulta a un profesional de la salud calificado.", askForTips: "¿Te gustaría recibir algunos consejos de cuidados primarios y primeros auxilios?", yesPlease: "Sí, por favor", noThankYou: "No, gracias", generatingTips: "Generando consejos...", primaryCareTips: "Consejos de Atención Primaria", generateReport: "Generar Resumen para el Médico", generating: "Generando...", startNewAnalysis: "Iniciar Nuevo Análisis",
    doctorsSummary: "Resumen para el Médico",
    audioConversation: "Conversación de Audio", aiIsListening: "ArogyaAI está escuchando...", aiIsThinking: "ArogyaAI está pensando...", endConversation: "Finalizar Conversación",
    consultTitle: "Consultar a un Médico",
    consultFindNearby: "Encontrar Centros de Salud Cercanos",
    consultLocationPrompt: "Por favor, permite el acceso a la ubicación para encontrar centros de salud cerca de ti.",
    allowLocation: "Permitir Acceso a la Ubicación",
    gettingLocation: "Obteniendo tu ubicación...",
    locationDenied: "El acceso a la ubicación fue denegado. Por favor, actívalo en la configuración de tu navegador para usar esta función.",
    nearbyClinics: "Centros de Salud Cercanos",
    nearbyAmbulances: "Ambulancias Cercanas",
    sos: "SOS",
    noAmbulanceData: "no hay datos de ambulancias para mostrar",
    kmAway: "a {{distance}} de distancia",
    viewOnMap: "Ver en el Mapa",
    contactDoctor: "Contactar a un Médico",
    chat: "Chat",
    voiceCall: "Llamada de Voz",
    videoCall: "Videollamada",
    symptomAnalyzerSystemInstruction: `Eres un asistente de diagnóstico médico experto llamado 'SymptomAI'. Tu propósito es ayudar a los usuarios a comprender las posibles causas de sus síntomas. Sigue estas reglas estrictamente:
1. NO eres un doctor. Nunca proporciones un diagnóstico definitivo o consejos de tratamiento.
2. Tu objetivo principal es recopilar información. Analiza la entrada inicial del usuario (texto e imágenes) e identifica qué información crucial falta.
3. Haz preguntas claras, simples y específicas una a la vez para llenar los vacíos. Prefiere preguntas de opción múltiple o sí/no cuando sea posible.
4. Después de recopilar suficiente información, comienza tu mensaje final con el token \`CONCLUSION:\`. Luego, presenta una lista de posibles condiciones como una cadena de objeto JSON. Para cada condición, proporciona un 'name' (nombre), una 'confidence' (confianza: Baja, Media, o Alta) y una lista de 'keyIndicators' (indicadores clave).
5. SIEMPRE concluye tu resumen del análisis con una fuerte recomendación de consultar a un profesional de la salud.
6. Si el usuario luego pide un resumen o informe para el médico, reformatea toda la conversación en un informe estructurado. Responde ÚNICAMENTE con un solo objeto JSON para el informe. El JSON debe tener las claves: 'patientComplaint', 'symptomImages', 'diagnosticQuestions' y 'preliminaryAssessment'. No incluyas ningún otro texto o formato markdown.`,
    symptomAnalyzerSystemInstructionVoice: `Eres un asistente de diagnóstico médico experto llamado 'SymptomAI'. Tu propósito es ayudar a los usuarios a comprender las posibles causas de sus síntomas. Sigue estas reglas estrictamente:
1. NO eres un doctor.
2. Haz preguntas claras, simples y específicas una a la vez.
3. Después de recopilar suficiente información, comienza tu mensaje final con el token \`CONCLUSION:\`. Luego, presenta una lista de posibles condiciones como una cadena de objeto JSON.
4. Esta es una conversación de voz. Mantén tus respuestas concisas y claras.`,
    generateReportPrompt: `Basado en toda nuestra conversación, genera un resumen estructurado para el médico. Responde ÚNICAMENTE con un solo objeto JSON. El JSON debe tener estas claves: 'patientComplaint', 'symptomImages' (un array que contenga estas URLs de datos: {{image_data_urls}}), 'diagnosticQuestions' y 'preliminaryAssessment'. No incluyas ningún otro texto o formato markdown.`,
    treatmentTipsPrompt: `Basado en las posibles condiciones de "{{conditionNames}}", proporciona consejos seguros de primeros auxilios y cuidados primarios. Este consejo es para alguien en una zona rural o subdesarrollada con acceso inmediato limitado a un médico.
    REGLAS IMPORTANTES:
    1. Comienza con un descargo de responsabilidad muy fuerte y claro en negrita: **"Esto no sustituye el consejo médico profesional. Por favor, consulta a un médico lo antes posible."**
    2. NO sugieras ningún medicamento con receta específico. Puedes sugerir alivio de venta libre si es apropiado y seguro (p. ej., mantenerse hidratado, descansar, hacer gárgaras con agua salada tibia).
    3. El consejo debe ser cauteloso, centrándose en el alivio de los síntomas y en prevenir que la condición empeore.
    4. Estructura los consejos con encabezados claros o viñetas.`,
  },
  hi: {
    welcomeBack: "वापसी पर स्वागत है", createAccount: "खाता बनाएं", emailAddress: "ईमेल पता", phoneNumber: "फ़ोन नंबर", password: "पासवर्ड", login: "लॉग इन करें", signUp: "साइन अप करें", processing: "प्रोसेस हो रहा है...", invalidCredentialsError: "अमान्य ईमेल या पासवर्ड।", userExistsError: "इस ईमेल वाला उपयोगकर्ता पहले से मौजूद है।", dontHaveAccount: "खाता नहीं है?", alreadyHaveAccount: "पहले से ही एक खाता है?",
    completeYourProfile: "अपनी प्रोफ़ाइल पूरी करें", profileSetupSubheading: "यह जानकारी हमें अधिक व्यक्तिगत अनुभव प्रदान करने में मदद करती है।", height: "ऊंचाई (जैसे, 5ft 10in या 178cm)", weight: "वजन (जैसे, 160lbs या 72kg)", age: "आयु", existingConditions: "मौजूदा स्थितियाँ (जैसे, मधुमेह, उच्च रक्तचाप)", existingConditionsPlaceholder: "अल्पविराम से अलग करें", saveAndContinue: "सहेजें और जारी रखें", saving: "सहेज रहा है...",
    profile: "प्रोफ़ाइल", logout: "लॉग आउट", language: "भाषा",
    dashboard: "डैशबोर्ड", consult: "परामर्श", diagnose: "निदान", reports: "रिपोर्ट",
    dashboardWelcome: "आपका स्वागत है, उपयोगकर्ता!", dashboardSubheading: "आपका व्यक्तिगत स्वास्थ्य सहायक तैयार है।", startNewDiagnosis: "नया निदान शुरू करें", startNewDiagnosisSub: "प्रारंभिक विश्लेषण प्राप्त करने के लिए अपने लक्षणों का वर्णन करें।", viewPastReports: "पिछली रिपोर्ट देखें", viewPastReportsSub: "अपनी पिछली लक्षण विश्लेषण रिपोर्ट तक पहुँचें।",
    yourReports: "आपकी रिपोर्ट", noReports: "आपके पास अभी तक कोई रिपोर्ट नहीं है।", backToList: "← सूची पर वापस", complaint: "शिकायत", date: "तारीख", patientComplaint: "रोगी की प्रारंभिक शिकायत", symptomsImages: "लक्षणों की छवियाँ", diagnosticQA: "निदान संबंधी प्रश्नोत्तर", preliminaryAssessment: "प्रारंभिक मूल्यांकन",
    yourProfile: "आपकी प्रोफ़ाइल", editProfile: "प्रोफ़ाइल संपादित करें", saveChanges: "बदलाव सहेजें", cancel: "रद्द करें",
    medicalDisclaimer: "चिकित्सा अस्वीकरण", disclaimerText: "सिम्प्टमएआई एक एआई-संचालित सूचनात्मक उपकरण है और यह पेशेवर चिकित्सा सलाह, निदान या उपचार का विकल्प नहीं है। किसी भी चिकित्सा स्थिति के बारे में आपके किसी भी प्रश्न के लिए हमेशा अपने चिकित्सक या अन्य योग्य स्वास्थ्य प्रदाता की सलाह लें।", iUnderstandAndAgree: "मैं समझता हूं और सहमत हूं", describeSymptoms: "अपने लक्षणों का विस्तार से वर्णन करें:", describeSymptomsPlaceholder: "जैसे, मेरे गले में खराश, सिरदर्द और बांह पर दाने हैं...", uploadPhotos: "दिखने वाले लक्षणों की तस्वीरें अपलोड करें (वैकल्पिक):", clickToSelectImages: "छवियां चुनने के लिए क्लिक करें", startAnalysis: "विश्लेषण शुरू करें", analyzing: "विश्लेषण हो रहा है...",
    typeYourAnswer: "अपना उत्तर टाइप करें...", send: "भेजें",
    preliminaryAnalysis: "प्रारंभिक विश्लेषण", confidence: "आत्मविश्वास", keyIndicators: "मुख्य संकेतक", finalDisclaimer: "यह विश्लेषण केवल सूचना के उद्देश्यों के लिए है। कृपया एक योग्य स्वास्थ्य पेशेवर से परामर्श करें।", askForTips: "क्या आप कुछ प्राथमिक देखभाल और प्राथमिक चिकित्सा युक्तियाँ प्राप्त करना चाहेंगे?", yesPlease: "हाँ, कृपया", noThankYou: "नहीं, धन्यवाद", generatingTips: "युक्तियाँ उत्पन्न हो रही हैं...", primaryCareTips: "प्राथमिक देखभाल युक्तियाँ", generateReport: "डॉक्टर का सारांश उत्पन्न करें", generating: "उत्पन्न हो रहा है...", startNewAnalysis: "नया विश्लेषण शुरू करें",
    doctorsSummary: "डॉक्टर का सारांश",
    audioConversation: "ऑडियो वार्तालाप", aiIsListening: "आरोग्यएआई सुन रहा है...", aiIsThinking: "आरोग्यएआई सोच रहा है...", endConversation: "वार्तालाप समाप्त करें",
    consultTitle: "डॉक्टर से परामर्श करें",
    consultFindNearby: "आस-पास के स्वास्थ्य केंद्र खोजें",
    consultLocationPrompt: "कृपया अपने आस-पास के स्वास्थ्य केंद्र खोजने के लिए स्थान पहुंच की अनुमति दें।",
    allowLocation: "स्थान पहुंच की अनुमति दें",
    gettingLocation: "आपका स्थान प्राप्त हो रहा है...",
    locationDenied: "स्थान पहुंच से इनकार कर दिया गया था। कृपया इस सुविधा का उपयोग करने के लिए इसे अपनी ब्राउज़र सेटिंग्स में सक्षम करें।",
    nearbyClinics: "आस-पास के स्वास्थ्य केंद्र",
    nearbyAmbulances: "आस-पास की एम्बुलेंस",
    sos: "एसओएस",
    noAmbulanceData: "दिखाने के लिए कोई एम्बुलेंस डेटा नहीं",
    kmAway: "{{distance}} दूर",
    viewOnMap: "मानचित्र पर देखें",
    contactDoctor: "डॉक्टर से संपर्क करें",
    chat: "चैट",
    voiceCall: "वॉयस कॉल",
    videoCall: "वीडियो कॉल",
    symptomAnalyzerSystemInstruction: `आप 'सिम्प्टमएआई' नामक एक विशेषज्ञ चिकित्सा नैदानिक सहायक हैं। आपका उद्देश्य उपयोगकर्ताओं को उनके लक्षणों के संभावित कारणों को समझने में मदद करना है। इन नियमों का सख्ती से पालन करें:
1. आप डॉक्टर नहीं हैं। कभी भी कोई निश्चित निदान या उपचार सलाह न दें।
2. आपका प्राथमिक लक्ष्य जानकारी इकट्ठा करना है। उपयोगकर्ता के प्रारंभिक इनपुट (पाठ और चित्र) का विश्लेषण करें और पहचानें कि कौन सी महत्वपूर्ण जानकारी गायब है।
3. कमियों को भरने के लिए एक-एक करके स्पष्ट, सरल और लक्षित प्रश्न पूछें। जब संभव हो तो बहुविकल्पीय या हाँ/नहीं वाले प्रश्नों को प्राथमिकता दें।
4. पर्याप्त जानकारी इकट्ठा करने के बाद, अपना अंतिम संदेश टोकन \`CONCLUSION:\` से शुरू करें। फिर, संभावित स्थितियों की एक सूची JSON ऑब्जेक्ट स्ट्रिंग के रूप में प्रस्तुत करें। प्रत्येक स्थिति के लिए, एक 'name' (नाम), एक 'confidence' (आत्मविश्वास: निम्न, मध्यम, या उच्च), और 'keyIndicators' (मुख्य संकेतक) की एक सूची प्रदान करें।
5. हमेशा अपने विश्लेषण सारांश को एक स्वास्थ्य पेशेवर से परामर्श करने की एक मजबूत सिफारिश के साथ समाप्त करें।
6. यदि उपयोगकर्ता बाद में डॉक्टर के सारांश या रिपोर्ट के लिए पूछता है, तो पूरी बातचीत को एक संरचित रिपोर्ट में पुन: स्वरूपित करें। रिपोर्ट के लिए केवल एक JSON ऑब्जेक्ट के साथ उत्तर दें। JSON में ये कुंजियाँ होनी चाहिए: 'patientComplaint', 'symptomImages', 'diagnosticQuestions', और 'preliminaryAssessment'। कोई अन्य पाठ या मार्कडाउन स्वरूपण शामिल न करें।`,
    symptomAnalyzerSystemInstructionVoice: `आप 'सिम्प्टमएआई' नामक एक विशेषज्ञ चिकित्सा नैदानिक सहायक हैं। आपका उद्देश्य उपयोगकर्ताओं को उनके लक्षणों के संभावित कारणों को समझने में मदद करना है। इन नियमों का सख्ती से पालन करें:
1. आप डॉक्टर नहीं हैं।
2. एक-एक करके स्पष्ट, सरल और लक्षित प्रश्न पूछें।
3. पर्याप्त जानकारी इकट्ठा करने के बाद, अपना अंतिम संदेश टोकन \`CONCLUSION:\` से शुरू करें। फिर, संभावित स्थितियों की एक सूची JSON ऑब्जेक्ट स्ट्रिंग के रूप में प्रस्तुत करें।
4. यह एक वॉयस वार्तालाप है। अपने उत्तरों को संक्षिप्त और स्पष्ट रखें।`,
    generateReportPrompt: `हमारी पूरी बातचीत के आधार पर, कृपया एक संरचित डॉक्टर का सारांश उत्पन्न करें। केवल एक JSON ऑब्जेक्ट के साथ उत्तर दें। JSON में ये कुंजियाँ होनी चाहिए: 'patientComplaint', 'symptomImages' (इस डेटा URL वाले एक सरणी: {{image_data_urls}}), 'diagnosticQuestions', और 'preliminaryAssessment'। कोई अन्य पाठ या मार्कडाउन स्वरूपण शामिल न करें।`,
    treatmentTipsPrompt: `"{{conditionNames}}" की संभावित स्थितियों के आधार पर, सुरक्षित, प्राथमिक प्राथमिक चिकित्सा और देखभाल युक्तियाँ प्रदान करें। यह सलाह किसी ग्रामीण या अविकसित क्षेत्र में किसी ऐसे व्यक्ति के लिए है जिसकी डॉक्टर तक तत्काल पहुँच सीमित है।
    महत्वपूर्ण नियम:
    1. एक बहुत मजबूत, स्पष्ट अस्वीकरण के साथ शुरू करें: **"यह पेशेवर चिकित्सा सलाह का विकल्प नहीं है। कृपया जल्द से जल्द एक डॉक्टर से मिलें।"**
    2. किसी भी विशिष्ट पर्चे वाली दवाओं का सुझाव न दें। आप ओवर-द-काउंटर राहत का सुझाव दे सकते हैं यदि उपयुक्त और सुरक्षित हो (जैसे, हाइड्रेटेड रहना, आराम करना, गर्म नमक के पानी से गरारे करना)।
    3. सलाह सतर्क होनी चाहिए, जिसमें लक्षणों से राहत और स्थिति को बिगड़ने से रोकने पर ध्यान केंद्रित किया गया हो।
    4. युक्तियों को स्पष्ट शीर्षकों या बुलेट बिंदुओं के साथ संरचित करें।`,
  },
};

// --- Localization Context ---
const LanguageContext = createContext({
  language: 'en' as Language,
  setLanguage: (lang: Language) => {},
  t: (key: string, replacements?: { [key: string]: string | number | string[] }): string => key,
});

const useTranslation = () => useContext(LanguageContext);

// FIX: Define a type alias for LanguageProvider props to improve clarity and help TypeScript's type inference.
type LanguageProviderProps = {
    children: React.ReactNode;
    user: User | null;
    onProfileSave: (profile: UserProfile) => Promise<void>;
};

const LanguageProvider = ({ children, user, onProfileSave }: LanguageProviderProps) => {
    const [language, setCurrentLanguage] = useState<Language>(user?.profile?.language || 'en');
    
    useEffect(() => {
        if(user?.profile?.language) {
            setCurrentLanguage(user.profile.language);
        }
    }, [user]);

    const setLanguage = async (lang: Language) => {
        setCurrentLanguage(lang);
        if (user && user.profile) {
            await onProfileSave({ ...user.profile, language: lang });
        }
    };

    const t = (key: string, replacements?: { [key: string]: string | number | string[] }): string => {
        let text = translations[language][key] || translations['en'][key] || key;
        if (replacements) {
            Object.keys(replacements).forEach(rKey => {
                const value = replacements[rKey];
                text = text.replace(new RegExp(`{{${rKey}}}`, 'g'), Array.isArray(value) ? JSON.stringify(value) : String(value));
            });
        }
        return text;
    };

    return (
        <LanguageContext.Provider value={{ language, setLanguage, t }}>
            {children}
        </LanguageContext.Provider>
    );
};


// --- Mock Real-Time Cloud Database ---
const RealTimeDB = (() => {
  const state: { [key: string]: any } = {
    users: JSON.parse(localStorage.getItem("arogyaAI_users") || "[]"),
    reports: JSON.parse(localStorage.getItem("arogyaAI_reports") || "{}"),
    currentUserEmail: localStorage.getItem("arogyaAI_currentUser") || null,
  };
  const listeners: { [key: string]: Array<() => void> } = {};
  const _commit = (key: string, value: any) => { if (value) { localStorage.setItem(`arogyaAI_${key}`, JSON.stringify(value)); } else { localStorage.removeItem(`arogyaAI_${key}`); } };
  const _notify = (key: string) => { if (listeners[key]) { listeners[key].forEach(callback => callback()); } };
  return {
    subscribe: (key: string, callback: () => void): (() => void) => { if (!listeners[key]) listeners[key] = []; listeners[key].push(callback); return () => { listeners[key] = listeners[key].filter(l => l !== callback); }; },
    get: (key: string): any => state[key],
    set: (key: string, value: any) => { state[key] = value; if (key === 'users') _commit('users', value); if (key === 'reports') _commit('reports', value); if (key === 'currentUserEmail') _commit('currentUser', value); _notify(key); },
  };
})();


// --- API Layer ---
const api = {
  _delay: (ms: number) => new Promise(res => setTimeout(res, ms)),
  getUsers: async (): Promise<User[]> => { await api._delay(50); return RealTimeDB.get("users"); },
  saveUsers: async (users: User[]): Promise<void> => { await api._delay(50); RealTimeDB.set("users", users); },
  setCurrentUserEmail: async (email: string | null): Promise<void> => { await api._delay(20); RealTimeDB.set("currentUserEmail", email); },
  signup: async (email: string, phone: string, pass: string): Promise<{user: User | null, error: string | null}> => { const users = await api.getUsers(); if (users.some(u => u.email === email)) return { user: null, error: 'User with this email already exists.' }; const newUser: User = { email, phone, password: pass, profile: null }; await api.saveUsers([...users, newUser]); await api.setCurrentUserEmail(newUser.email); return { user: newUser, error: null }; },
  login: async (email: string, pass: string): Promise<{user: User | null, error: string | null}> => { const users = await api.getUsers(); const user = users.find(u => u.email === email && u.password === pass); if (user) { await api.setCurrentUserEmail(user.email); return { user, error: null }; } return { user: null, error: 'Invalid email or password.' }; },
  logout: async (): Promise<void> => { await api.setCurrentUserEmail(null); },
  saveProfile: async (email: string, profile: UserProfile): Promise<User | null> => { const users = await api.getUsers(); const userIndex = users.findIndex(u => u.email === email); if (userIndex > -1) { const updatedUser = { ...users[userIndex], profile }; users[userIndex] = updatedUser; await api.saveUsers(users); return updatedUser; } return null; },
  getReports: async (email: string): Promise<StoredReport[]> => {
    await api._delay(150);
    const allReports = RealTimeDB.get("reports");
    const userReports = allReports[email] || [];
    if (userReports && userReports.length > 0) {
      return userReports;
    }
    const dummyReports: StoredReport[] = [
      {
        id: 'dummy_report_1',
        timestamp: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
        data: {
          patientComplaint: "Persistent headache and sensitivity to light for the past 2 days.",
          symptomImages: [],
          diagnosticQuestions: [
            { question: "Have you experienced any nausea?", answer: "Yes, a little bit." },
            { question: "Is the headache on one side of your head?", answer: "Yes, primarily on the right side." }
          ],
          preliminaryAssessment: {
            potentialConditions: [
              { name: "Migraine", confidence: "High", keyIndicators: ["Unilateral headache", "Photophobia", "Nausea"] }
            ]
          }
        }
      },
      {
        id: 'dummy_report_2',
        timestamp: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
        data: {
          patientComplaint: "Itchy red rash on my arm that has been spreading over the last week.",
          symptomImages: [],
          diagnosticQuestions: [
            { question: "Have you come into contact with any new plants or substances?", answer: "I was gardening last weekend." },
            { question: "Is the rash blistering?", answer: "No, it's just red and bumpy." }
          ],
          preliminaryAssessment: {
            potentialConditions: [
              { name: "Contact Dermatitis", confidence: "Medium", keyIndicators: ["Localized rash", "Itching", "Recent contact with potential irritant"] },
              { name: "Eczema", confidence: "Low", keyIndicators: ["Redness", "Itching"] }
            ]
          }
        }
      },
      {
        id: 'dummy_report_3',
        timestamp: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        data: {
          patientComplaint: "Sore throat, cough, and a runny nose for three days.",
          symptomImages: [],
          diagnosticQuestions: [
            { question: "Do you have a fever?", answer: "Yes, a low-grade one." },
            { question: "Are you experiencing body aches?", answer: "Yes, mild aches all over." }
          ],
          preliminaryAssessment: {
            potentialConditions: [
              { name: "Viral Pharyngitis (Common Cold)", confidence: "High", keyIndicators: ["Sore throat", "Low-grade fever", "Cough", "Runny nose"] }
            ]
          }
        }
      }
    ];
    return dummyReports.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  },
  saveReport: async (email: string, reportData: ReportData): Promise<void> => { await api._delay(150); const allReports = RealTimeDB.get("reports"); const userReports = allReports[email] || []; const newReport: StoredReport = { id: `report_${Date.now()}`, timestamp: new Date().toISOString(), data: reportData, }; allReports[email] = [newReport, ...userReports]; RealTimeDB.set("reports", allReports); },
};


// --- Custom Hooks for Real-Time Data ---
const useAuth = () => {
  const [auth, setAuth] = useState<{ user: User | null; authChecked: boolean }>({ user: null, authChecked: false });
  useEffect(() => {
    const resolveUser = () => {
      const email = RealTimeDB.get('currentUserEmail');
      if (email) {
        // FIX: Explicitly cast the result of RealTimeDB.get to prevent 'any' type propagation,
        // which was causing downstream type inference failures.
        const users = RealTimeDB.get('users') as User[];
        const user = users.find((u: User) => u.email === email) || null;
        setAuth({ user, authChecked: true });
      } else { setAuth({ user: null, authChecked: true }); }
    };
    resolveUser();
    const unsubAuth = RealTimeDB.subscribe('currentUserEmail', resolveUser);
    const unsubUsers = RealTimeDB.subscribe('users', resolveUser);
    return () => { unsubAuth(); unsubUsers(); };
  }, []);
  return auth;
};

const useReports = (email: string) => {
    const [reports, setReports] = useState<StoredReport[]>([]); const [isLoading, setIsLoading] = useState(true);
    useEffect(() => {
        if (!email) return;
        const fetchAndSetReports = () => { setIsLoading(true); api.getReports(email).then(userReports => { setReports(userReports); setIsLoading(false); }); };
        fetchAndSetReports();
        const unsubscribe = RealTimeDB.subscribe('reports', fetchAndSetReports);
        return () => unsubscribe();
    }, [email]);
    return { reports, isLoading };
};

// --- Audio Helper Functions ---
function encode(bytes: Uint8Array): string { let binary = ''; const len = bytes.byteLength; for (let i = 0; i < len; i++) { binary += String.fromCharCode(bytes[i]); } return btoa(binary); }
function decode(base64: string): Uint8Array { const binaryString = atob(base64); const len = binaryString.length; const bytes = new Uint8Array(len); for (let i = 0; i < len; i++) { bytes[i] = binaryString.charCodeAt(i); } return bytes; }

// --- Main Symptom Analyzer Component ---
const SymptomAnalyzer = ({user}: {user: User}) => {
  const [appState, setAppState] = useState<AppState>("input");
  const [symptomText, setSymptomText] = useState("");
  const [uploadedImages, setUploadedImages] = useState<ImageData[]>([]);
  const [chat, setChat] = useState<Chat | null>(null);
  const [chatHistory, setChatHistory] = useState<Message[]>([]);
  const [currentUserMessage, setCurrentUserMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [conclusionData, setConclusionData] = useState<any>(null);
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [treatmentTips, setTreatmentTips] = useState<string>("");
  const [tipsState, setTipsState] = useState<TipsState>("idle");
  const chatHistoryRef = useRef<HTMLDivElement>(null);
  const [isAudioModalOpen, setIsAudioModalOpen] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const sessionRef = useRef<any>(null);
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const mediaStreamSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const inputTranscriptionRef = useRef("");
  const outputTranscriptionRef = useRef("");
  let nextStartTime = 0;
  const { t } = useTranslation();
  const ai = new GoogleGenAI({ apiKey: API_KEY });

  useEffect(() => { if (chatHistoryRef.current) { chatHistoryRef.current.scrollTop = chatHistoryRef.current.scrollHeight; } }, [chatHistory, isLoading]);
  const dataUrlToGenerativePart = (dataUrl: string, mimeType: string) => ({ inlineData: { data: dataUrl.split(",")[1], mimeType } });
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => { if (e.target.files) { Array.from(e.target.files).forEach((file: File) => { const reader = new FileReader(); reader.onloadend = () => setUploadedImages((prev) => [...prev, { dataUrl: reader.result as string, mimeType: file.type }]); reader.readAsDataURL(file); }); } };

  const startAnalysis = async () => {
    if (!symptomText.trim()) { alert("Please describe your symptoms."); return; }
    setIsLoading(true); setAppState("chat");
    const newChat = ai.chats.create({ model: "gemini-2.5-pro", config: { systemInstruction: t('symptomAnalyzerSystemInstruction') } });
    setChat(newChat);
    const initialParts: Part[] = [{ text: symptomText }, ...uploadedImages.map(img => dataUrlToGenerativePart(img.dataUrl, img.mimeType))];
    setChatHistory([{ role: "user", parts: initialParts }]);
    const response = await newChat.sendMessage({ message: initialParts });
    setChatHistory((prev) => [...prev, { role: "model", parts: response.candidates[0].content.parts }]);
    setIsLoading(false);
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUserMessage.trim() || !chat) return;
    const userMessage: Message = { role: "user", parts: [{ text: currentUserMessage }] };
    setChatHistory(prev => [...prev, userMessage]);
    setCurrentUserMessage(""); setIsLoading(true);
    const response = await chat.sendMessage({ message: currentUserMessage });
    const responseText = response.text;
    const conclusionIndex = responseText?.indexOf("CONCLUSION:");
    if (responseText && conclusionIndex !== -1) {
      const potentialJsonString = responseText.substring(conclusionIndex + "CONCLUSION:".length);
      const startIndex = potentialJsonString.indexOf('{');
      const endIndex = potentialJsonString.lastIndexOf('}');
      if (startIndex !== -1 && endIndex > startIndex) {
        const jsonString = potentialJsonString.substring(startIndex, endIndex + 1);
        try { const parsedConclusion = JSON.parse(jsonString); setConclusionData(parsedConclusion); setAppState("conclusion"); } 
        catch (error) { console.error("Failed to parse conclusion JSON:", error); setChatHistory(prev => [...prev, { role: "model", parts: response.candidates[0].content.parts }]); }
      } else { setChatHistory(prev => [...prev, { role: "model", parts: response.candidates[0].content.parts }]); }
    } else { setChatHistory(prev => [...prev, { role: "model", parts: response.candidates[0].content.parts }]); }
    setIsLoading(false);
  };

  const generateReport = async () => {
    if (!chat) return;
    setIsLoading(true);
    const image_data_urls = uploadedImages.map(img => img.dataUrl);
    const reportPrompt = t('generateReportPrompt', { image_data_urls });
    const response = await chat.sendMessage({ message: reportPrompt });
    try {
      const responseText = response.text.trim();
      const startIndex = responseText.indexOf('{');
      const endIndex = responseText.lastIndexOf('}');
      if (startIndex !== -1 && endIndex > startIndex) {
        const jsonString = responseText.substring(startIndex, endIndex + 1);
        const parsedReport: ReportData = JSON.parse(jsonString);
        await api.saveReport(user.email, parsedReport);
        setReportData(parsedReport); setAppState("report");
      } else { throw new Error("No valid JSON object found in the response."); }
    } catch (error) { console.error("Failed to parse report JSON:", error, "\nRaw response text:", response.text); alert("Sorry, there was an error generating the report."); }
    setIsLoading(false);
  };

  const getTreatmentTips = async () => {
    if (!chat || !conclusionData) return;
    setTipsState("loading");
    const conditionNames = conclusionData.potentialConditions.map((c: any) => c.name).join(', ');
    const tipsPrompt = t('treatmentTipsPrompt', { conditionNames });
    const response = await chat.sendMessage({ message: tipsPrompt });
    setTreatmentTips(response.text);
    setTipsState("visible");
  };

  const resetApp = () => { setAppState("input"); setSymptomText(""); setUploadedImages([]); setChat(null); setChatHistory([]); setCurrentUserMessage(""); setIsLoading(false); setConclusionData(null); setReportData(null); setTreatmentTips(""); setTipsState("idle"); };
  
    async function decodeAudioData(data: Uint8Array, ctx: AudioContext, sampleRate: number, numChannels: number): Promise<AudioBuffer> { const dataInt16 = new Int16Array(data.buffer); const frameCount = dataInt16.length / numChannels; const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate); for (let channel = 0; channel < numChannels; channel++) { const channelData = buffer.getChannelData(channel); for (let i = 0; i < frameCount; i++) { channelData[i] = dataInt16[i * numChannels + channel] / 32768.0; } } return buffer; }
    function createBlob(data: Float32Array): Blob { const l = data.length; const int16 = new Int16Array(l); for (let i = 0; i < l; i++) { int16[i] = data[i] * 32768; } return { data: encode(new Uint8Array(int16.buffer)), mimeType: 'audio/pcm;rate=16000' }; }
    const startAudioConversation = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true }); mediaStreamRef.current = stream; inputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 }); outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 }); setIsListening(true); setIsAudioModalOpen(true);
            const sessionPromise = ai.live.connect({
                model: 'gemini-2.5-flash-native-audio-preview-09-2025',
                callbacks: {
                    onopen: () => { const source = inputAudioContextRef.current!.createMediaStreamSource(stream); mediaStreamSourceRef.current = source; const scriptProcessor = inputAudioContextRef.current!.createScriptProcessor(4096, 1, 1); scriptProcessorRef.current = scriptProcessor; scriptProcessor.onaudioprocess = (audioProcessingEvent) => { const inputData = audioProcessingEvent.inputBuffer.getChannelData(0); let sum = 0; for (let i = 0; i < inputData.length; i++) { sum += inputData[i] * inputData[i]; } if (Math.sqrt(sum / inputData.length) > 0.01) { sessionPromise.then((session) => session.sendRealtimeInput({ media: createBlob(inputData) })); } }; source.connect(scriptProcessor); scriptProcessor.connect(inputAudioContextRef.current!.destination); },
                    onmessage: async (message: LiveServerMessage) => {
                        if (message.serverContent?.inputTranscription) inputTranscriptionRef.current += message.serverContent.inputTranscription.text;
                        if (message.serverContent?.outputTranscription) outputTranscriptionRef.current += message.serverContent.outputTranscription.text;
                        if (message.serverContent?.turnComplete) {
                            setIsListening(false); mediaStreamSourceRef.current?.disconnect(); const userTurn = inputTranscriptionRef.current.trim(); const modelTurn = outputTranscriptionRef.current.trim(); const conclusionIndex = modelTurn.indexOf("CONCLUSION:");
                            if (conclusionIndex !== -1) { const potentialJsonString = modelTurn.substring(conclusionIndex + "CONCLUSION:".length); const startIndex = potentialJsonString.indexOf('{'); const endIndex = potentialJsonString.lastIndexOf('}'); if (startIndex !== -1 && endIndex > startIndex) { const jsonString = potentialJsonString.substring(startIndex, endIndex + 1); try { const parsedConclusion = JSON.parse(jsonString); if (userTurn) setChatHistory(prev => [...prev, { role: 'user', parts: [{ text: userTurn }] }]); setConclusionData(parsedConclusion); setAppState("conclusion"); stopAudioConversation(); } catch (error) { if (userTurn) setChatHistory(prev => [...prev, { role: 'user', parts: [{ text: userTurn }] }]); if (modelTurn) setChatHistory(prev => [...prev, { role: 'model', parts: [{ text: modelTurn }] }]); } } else { if (userTurn) setChatHistory(prev => [...prev, { role: 'user', parts: [{ text: userTurn }] }]); if (modelTurn) setChatHistory(prev => [...prev, { role: 'model', parts: [{ text: modelTurn }] }]); } } else { if (userTurn) setChatHistory(prev => [...prev, { role: 'user', parts: [{ text: userTurn }] }]); if (modelTurn) setChatHistory(prev => [...prev, { role: 'model', parts: [{ text: modelTurn }] }]); }
                            inputTranscriptionRef.current = ""; outputTranscriptionRef.current = "";
                        }
                        const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
                        if (base64Audio && outputAudioContextRef.current) { const outputCtx = outputAudioContextRef.current; nextStartTime = Math.max(nextStartTime, outputCtx.currentTime); const audioBuffer = await decodeAudioData(decode(base64Audio), outputCtx, 24000, 1); const sourceNode = outputCtx.createBufferSource(); sourceNode.buffer = audioBuffer; sourceNode.connect(outputCtx.destination); if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current); sourceNode.start(nextStartTime); nextStartTime += audioBuffer.duration; reconnectTimerRef.current = window.setTimeout(() => { if (sessionRef.current) { mediaStreamSourceRef.current?.connect(scriptProcessorRef.current!); setIsListening(true); } }, (nextStartTime - outputCtx.currentTime) * 1000 + 200); }
                    },
                    onerror: (e: ErrorEvent) => { console.error('Session error:', e); stopAudioConversation(); },
                    onclose: (e: CloseEvent) => { console.log('Session closed'); stopAudioConversation(); },
                },
                config: { responseModalities: [Modality.AUDIO], inputAudioTranscription: {}, outputAudioTranscription: {}, systemInstruction: t('symptomAnalyzerSystemInstructionVoice') }
            });
            sessionPromise.then(session => { sessionRef.current = session; });
        } catch (error) { console.error("Failed to start audio conversation:", error); alert("Could not access the microphone."); setIsAudioModalOpen(false); }
    };

    const stopAudioConversation = () => { setIsAudioModalOpen(false); setIsListening(false); if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current); if (sessionRef.current) sessionRef.current.close(); if (mediaStreamRef.current) mediaStreamRef.current.getTracks().forEach(track => track.stop()); if (mediaStreamSourceRef.current) mediaStreamSourceRef.current.disconnect(); if (scriptProcessorRef.current) scriptProcessorRef.current.disconnect(); if (inputAudioContextRef.current) inputAudioContextRef.current.close(); if (outputAudioContextRef.current) outputAudioContextRef.current.close(); sessionRef.current = null; mediaStreamRef.current = null; mediaStreamSourceRef.current = null; scriptProcessorRef.current = null; inputAudioContextRef.current = null; outputAudioContextRef.current = null; nextStartTime = 0; };
    
  const renderContent = () => {
    switch (appState) {
      case "disclaimer": return (<div className="main-content disclaimer-screen"><h2>{t('medicalDisclaimer')}</h2><p>{t('disclaimerText')}</p><button onClick={() => setAppState("input")}>{t('iUnderstandAndAgree')}</button></div>);
      case "input": return (
          <div className="main-content input-screen">
            <div className="input-group"><label>{t('describeSymptoms')}</label><textarea value={symptomText} onChange={(e) => setSymptomText(e.target.value)} placeholder={t('describeSymptomsPlaceholder')} /></div>
            <div className="input-group"><label>{t('uploadPhotos')}</label><input type="file" accept="image/*" multiple onChange={handleImageUpload} id="file-upload" style={{display: 'none'}} /><label htmlFor="file-upload" className="image-uploader"><span>{t('clickToSelectImages')}</span></label><div className="image-previews">{uploadedImages.map((img, i) => <img key={i} src={img.dataUrl} className="preview-image" alt="symptom preview" />)}</div></div>
            <button onClick={startAnalysis} disabled={!symptomText.trim() || isLoading}>{isLoading ? t('analyzing') : t('startAnalysis')}</button>
          </div>);
      case "chat": return (
            <div className="main-content chat-interface">
                <div className="chat-history" ref={chatHistoryRef}>
                    {chatHistory.map((msg, i) => (<div key={i} className={`chat-message ${msg.role}`}><div>{msg.parts.map((part, j) => { if ('text' in part && part.text) return <p key={j}>{part.text}</p>; if ('inlineData' in part && part.inlineData) return <img key={j} src={`data:${part.inlineData.mimeType};base64,${part.inlineData.data}`} alt="symptom" />; return null; })}</div></div>))}
                    {isLoading && <div className="chat-message model"><div className="spinner" style={{width: '20px', height: '20px'}}></div></div>}
                </div>
                <form onSubmit={handleSendMessage} className="chat-input-form"><input type="text" value={currentUserMessage} onChange={e => setCurrentUserMessage(e.target.value)} placeholder={t('typeYourAnswer')} disabled={isLoading} /><button type="button" className="chat-mic-button" onClick={startAudioConversation} disabled={isLoading} aria-label={t('audioConversation')}><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z"/></svg></button><button type="submit" disabled={isLoading}>{t('send')}</button></form>
            </div>);
      case "conclusion": return (
            <div className="main-content">
                <div className="conclusion-card">
                    <h3>{t('preliminaryAnalysis')}</h3>
                    <ul>{conclusionData?.potentialConditions?.map((c: any, i: number) => <li key={i}><div className="condition-name">{c.name}</div><div className="confidence">{t('confidence')}: {c.confidence}</div><div className="indicators">{t('keyIndicators')}: {c.keyIndicators.join(', ')}</div></li>)}</ul>
                    <p className="final-disclaimer">{t('finalDisclaimer')}</p>
                    {tipsState === 'idle' && (<div className="tips-prompt"><p>{t('askForTips')}</p><div className="button-group"><button onClick={getTreatmentTips}>{t('yesPlease')}</button><button className="secondary" onClick={() => setTipsState('declined')}>{t('noThankYou')}</button></div></div>)}
                    {tipsState === 'loading' && <div className="loading-indicator"><div className="spinner"></div><p>{t('generatingTips')}</p></div>}
                    {tipsState === 'visible' && treatmentTips && <div className="tips-content"><h3>{t('primaryCareTips')}</h3><div className="tips-text" dangerouslySetInnerHTML={{ __html: treatmentTips.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\*/g, '<br/>• ').replace(/<br\/>•/,'•') }}></div></div>}
                    <div className="report-footer"><button onClick={generateReport} disabled={isLoading}>{isLoading ? t('generating') : t('generateReport')}</button><button className="secondary" onClick={resetApp}>{t('startNewAnalysis')}</button></div>
                </div>
            </div>);
      case "report": return reportData && (<div className="report-modal"><div className="report-content"><div className="report-header"><h2>{t('doctorsSummary')}</h2><button className="close-button" onClick={() => setAppState("conclusion")}>&times;</button></div><div className="report-body"><h4>{t('patientComplaint')}</h4><p>{reportData.patientComplaint}</p>{reportData.symptomImages?.length > 0 && (<><h4>{t('symptomImages')}</h4><div className="report-images">{reportData.symptomImages.map((imgSrc, i) => <img key={i} src={imgSrc} alt={`symptom ${i+1}`} />)}</div></>)}<h4>{t('diagnosticQA')}</h4><ul className="report-qa-list">{reportData.diagnosticQuestions.map((qa, i) => (<li key={i}><strong>Q:</strong> {qa.question}<br /><strong>A:</strong> {qa.answer}</li>))}</ul><h4>{t('preliminaryAssessment')}</h4><ul>{reportData.preliminaryAssessment.potentialConditions.map((c, i) => (<li key={i}><strong>{c.name}</strong> ({t('confidence')}: {c.confidence})<br /><em>Indicators: {c.keyIndicators.join(', ')}</em></li>))}</ul></div><div className="report-footer"><button className="secondary" onClick={resetApp}>{t('startNewAnalysis')}</button></div></div></div>);
    }
  };

  return (<>{renderContent()}{isAudioModalOpen && (<div className="audio-modal"><div className="audio-modal-content"><h3>{t('audioConversation')}</h3><p>{isListening ? t('aiIsListening') : t('aiIsThinking')}</p><div className={`listening-indicator ${isListening ? 'active' : ''}`}><div></div><div></div><div></div></div><button onClick={stopAudioConversation}>{t('endConversation')}</button></div></div>)}</>);
};


// --- App Structure Components ---
const AuthPage = ({ onLogin, onSignup }: { onLogin: (email: string, pass: string) => Promise<boolean>, onSignup: (email: string, phone: string, pass: string) => Promise<boolean> }) => {
    const [isLogin, setIsLogin] = useState(true); const [email, setEmail] = useState(''); const [phone, setPhone] = useState(''); const [password, setPassword] = useState(''); const [error, setError] = useState(''); const [isLoading, setIsLoading] = useState(false);
    const { t } = useTranslation();
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault(); setError(''); setIsLoading(true);
        if (isLogin) { if (!await onLogin(email, password)) { setError(t('invalidCredentialsError')); } } 
        else { if (!await onSignup(email, phone, password)) { setError(t('userExistsError')); } }
        setIsLoading(false);
    };
    return (
        <div className="auth-container">
            <div className="auth-card">
                <h2>{isLogin ? t('welcomeBack') : t('createAccount')}</h2>
                <form onSubmit={handleSubmit}>
                    <div className="input-group"><label>{t('emailAddress')}</label><input type="email" value={email} onChange={e => setEmail(e.target.value)} required disabled={isLoading} /></div>
                    {!isLogin && (<div className="input-group"><label>{t('phoneNumber')}</label><input type="tel" value={phone} onChange={e => setPhone(e.target.value)} required disabled={isLoading} /></div>)}
                    <div className="input-group"><label>{t('password')}</label><input type="password" value={password} onChange={e => setPassword(e.target.value)} required disabled={isLoading} /></div>
                    {error && <p className="auth-error">{error}</p>}
                    <button type="submit" disabled={isLoading}>{isLoading ? t('processing') : (isLogin ? t('login') : t('signUp'))}</button>
                </form>
                <p className="auth-toggle">{isLogin ? t('dontHaveAccount') : t('alreadyHaveAccount')}<button onClick={() => setIsLogin(!isLogin)} disabled={isLoading}>{isLogin ? t('signUp') : t('login')}</button></p>
            </div>
        </div>
    );
};

const ProfileSetupPage = ({ user, onSave }: { user: User, onSave: (profile: UserProfile) => Promise<void> }) => {
    const [height, setHeight] = useState(''); const [weight, setWeight] = useState(''); const [age, setAge] = useState(''); const [conditions, setConditions] = useState(''); const [isLoading, setIsLoading] = useState(false);
    const { t, language } = useTranslation();
    const handleSave = async () => { setIsLoading(true); await onSave({ height, weight, age, conditions, language }); setIsLoading(false); };
    return (
        <div className="profile-setup-container">
            <div className="profile-setup-card">
                <h2>{t('completeYourProfile')}</h2><p>{t('profileSetupSubheading')}</p>
                <div className="input-group"><label>{t('height')}</label><input type="text" value={height} onChange={e => setHeight(e.target.value)} disabled={isLoading} /></div>
                <div className="input-group"><label>{t('weight')}</label><input type="text" value={weight} onChange={e => setWeight(e.target.value)} disabled={isLoading} /></div>
                <div className="input-group"><label>{t('age')}</label><input type="number" value={age} onChange={e => setAge(e.target.value)} disabled={isLoading} /></div>
                <div className="input-group"><label>{t('existingConditions')}</label><input type="text" value={conditions} onChange={e => setConditions(e.target.value)} placeholder={t('existingConditionsPlaceholder')} disabled={isLoading} /></div>
                <button onClick={handleSave} disabled={isLoading}>{isLoading ? t('saving') : t('saveAndContinue')}</button>
            </div>
        </div>
    );
};

const Header = ({ onLogout, onNavigate }: { onLogout: () => void, onNavigate: (page: ActivePage) => void }) => {
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const { t, language, setLanguage } = useTranslation();
    const handleNav = (e: React.MouseEvent<HTMLAnchorElement>, page: ActivePage) => { e.preventDefault(); onNavigate(page); setDropdownOpen(false); }
    const handleLogoutClick = (e: React.MouseEvent<HTMLAnchorElement>) => { e.preventDefault(); onLogout(); }
    return (
        <header className="app-header-main">
            <div className="logo">ArogyaAI</div>
            <div className="profile-menu">
                <button onClick={() => setDropdownOpen(!dropdownOpen)} className="profile-button"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="24" height="24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg></button>
                {dropdownOpen && (
                    <div className="dropdown-menu">
                        <a href="#" onClick={(e) => handleNav(e, 'profile')}>{t('profile')}</a>
                        <div className="language-selector">
                            <label htmlFor="lang-select">{t('language')}</label>
                            <select id="lang-select" value={language} onChange={(e) => setLanguage(e.target.value as Language)}>
                                <option value="en">English</option><option value="es">Español</option><option value="hi">हिन्दी</option>
                            </select>
                        </div>
                        <a href="#" onClick={handleLogoutClick}>{t('logout')}</a>
                    </div>
                )}
            </div>
        </header>
    );
};

const FooterNav = ({ activePage, onNavigate }: { activePage: ActivePage, onNavigate: (page: ActivePage) => void }) => {
    const { t } = useTranslation();
    return (
        <nav className="footer-nav">
            <button className={activePage === 'dashboard' ? 'active' : ''} onClick={() => onNavigate('dashboard')}><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg><span>{t('dashboard')}</span></button>
            <button className={activePage === 'consult' ? 'active' : ''} onClick={() => onNavigate('consult')}><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect><line x1="1" y1="10" x2="23" y2="10"></line></svg><span>{t('consult')}</span></button>
            <button className={activePage === 'diagnose' ? 'active' : ''} onClick={() => onNavigate('diagnose')}><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15.6 2.7a5.7 5.7 0 0 1 8.1 8.1l-7.5 7.5-6.6.6.6-6.6 7.5-7.5z"></path><path d="M18 6l-9 9"></path></svg><span>{t('diagnose')}</span></button>
            <button className={activePage === 'reports' ? 'active' : ''} onClick={() => onNavigate('reports')}><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg><span>{t('reports')}</span></button>
        </nav>
    );
};

// --- Page Components ---
const DashboardPage = ({ user, onNavigate }: { user: User, onNavigate: (page: ActivePage) => void }) => {
    const { t } = useTranslation();
    return (
    <div className="page-content dashboard-page">
        <h2>{t('dashboardWelcome')}</h2><p>{t('dashboardSubheading')}</p>
        <div className="dashboard-actions">
            <div className="action-card" onClick={() => onNavigate('diagnose')}><h3>{t('startNewDiagnosis')}</h3><p>{t('startNewDiagnosisSub')}</p></div>
            <div className="action-card" onClick={() => onNavigate('reports')}><h3>{t('viewPastReports')}</h3><p>{t('viewPastReportsSub')}</p></div>
        </div>
    </div>
)};

const ConsultPage = () => {
    const { t } = useTranslation();
    const [locationStatus, setLocationStatus] = useState<'idle' | 'requesting' | 'granted' | 'denied'>('idle');

    const nearbyClinics = [
        { name: "Shanti Clinic", distance: "2.4km", url: "https://maps.app.goo.gl/bZQRj2Mqnk48gutT9?g_st=aw" },
        { name: "Neuclear Healthcare", distance: "2.6km", url: "https://maps.app.goo.gl/XVcPpwQAWTybo2eL6?g_st=aw" },
        { name: "Ashirwad Clinic", distance: "2.9km", url: "https://maps.app.goo.gl/v8y1LBXP4BRYVBZf8?g_st=aw" }
    ];

    const doctors = [
        { name: "Dr. Priya Sharma" },
        { name: "Dr. Rohan Verma" },
        { name: "Dr. Anjali Gupta" }
    ];

    const handleRequestLocation = () => {
        setLocationStatus('requesting');
        navigator.geolocation.getCurrentPosition(
            () => {
                setLocationStatus('granted');
            },
            () => {
                setLocationStatus('denied');
            }
        );
    };
    
    const renderContent = () => {
        switch (locationStatus) {
            case 'granted':
                return (
                    <>
                    <div className="clinics-list">
                        <h3>{t('nearbyClinics')}</h3>
                        {nearbyClinics.map(clinic => (
                            <div key={clinic.name} className="clinic-card">
                                <div className="clinic-info">
                                    <strong>{clinic.name}</strong>
                                    <span>{t('kmAway', { distance: clinic.distance })}</span>
                                </div>
                                <a href={clinic.url} target="_blank" rel="noopener noreferrer" className="map-button">{t('viewOnMap')}</a>
                            </div>
                        ))}
                        </div>
                        <div className="ambulance-section">
                            <div className="ambulance-header">
                                <h3>{t('nearbyAmbulances')}</h3>
                                <a href="tel:102" className="sos-button">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
                                    <span>{t('sos')}</span>
                                </a>
                            </div>
                            <div className="ambulance-content">
                                <p>{t('noAmbulanceData')}</p>
                            </div>
                        </div>
                        <div className="doctor-contact-section">
                            <h3>{t('contactDoctor')}</h3>
                            {doctors.map(doctor => (
                                <div key={doctor.name} className="doctor-card">
                                    <div className="doctor-info">
                                        <strong>{doctor.name}</strong>
                                    </div>
                                    <div className="doctor-actions">
                                        <button title={t('chat')}><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg></button>
                                        <button title={t('voiceCall')}><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg></button>
                                        <button title={t('videoCall')}><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect></svg></button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </>
                );
            case 'requesting':
                return (
                    <div className="location-prompt">
                        <div className="spinner"></div>
                        <p>{t('gettingLocation')}</p>
                    </div>
                );
            case 'denied':
                 return (
                    <div className="location-prompt">
                         <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
                        <h3>{t('consultFindNearby')}</h3>
                        <p>{t('locationDenied')}</p>
                        <button onClick={handleRequestLocation}>{t('allowLocation')}</button>
                    </div>
                );
            case 'idle':
            default:
                return (
                    <div className="location-prompt">
                        <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
                        <h3>{t('consultFindNearby')}</h3>
                        <p>{t('consultLocationPrompt')}</p>
                        <button onClick={handleRequestLocation}>{t('allowLocation')}</button>
                    </div>
                );
        }
    };

    return (
        <div className="page-content consult-page">
            <h2>{t('consultTitle')}</h2>
            {renderContent()}
        </div>
    )
};

const ReportsPage = ({ user }: { user: User }) => {
    const { reports, isLoading } = useReports(user.email);
    const [selectedReport, setSelectedReport] = useState<ReportData | null>(null);
    const { t } = useTranslation();
    if (selectedReport) { return (
            <div className="page-content"><div className="report-detail-view">
                <button className="back-button" onClick={() => setSelectedReport(null)}>{t('backToList')}</button>
                <div className="report-body">
                    <h4>{t('patientComplaint')}</h4><p>{selectedReport.patientComplaint}</p>
                    {selectedReport.symptomImages?.length > 0 && (<><h4>{t('symptomImages')}</h4><div className="report-images">{selectedReport.symptomImages.map((imgSrc, i) => <img key={i} src={imgSrc} alt={`symptom ${i+1}`} />)}</div></>)}
                    <h4>{t('diagnosticQA')}</h4><ul className="report-qa-list">{selectedReport.diagnosticQuestions.map((qa, i) => (<li key={i}><strong>Q:</strong> {qa.question}<br /><strong>A:</strong> {qa.answer}</li>))}</ul>
                    <h4>{t('preliminaryAssessment')}</h4><ul>{selectedReport.preliminaryAssessment.potentialConditions.map((c, i) => (<li key={i}><strong>{c.name}</strong> ({t('confidence')}: {c.confidence})<br /><em>Indicators: {c.keyIndicators.join(', ')}</em></li>))}</ul>
                </div>
            </div></div>
    )}
    return (
        <div className="page-content"><h2>{t('yourReports')}</h2>{isLoading ? (<div className="loading-fullscreen" style={{height: '50vh'}}><div className="spinner"></div></div>) : reports.length === 0 ? (<p>{t('noReports')}</p>) : (
                <div className="reports-list">{reports.map(report => (<div key={report.id} className="report-item" onClick={() => setSelectedReport(report.data)}><div className="report-item-summary"><strong>{t('complaint')}:</strong> {report.data.patientComplaint.substring(0, 50)}...</div><div className="report-item-date">{new Date(report.timestamp).toLocaleDateString()}</div></div>))}</div>)}
        </div>
    );
};

const ProfilePage = ({ user, onSave, onLogout }: { user: User, onSave: (profile: UserProfile) => Promise<void>, onLogout: () => void }) => {
    const [isEditing, setIsEditing] = useState(false); const [profile, setProfile] = useState<UserProfile>(user.profile!); const [isLoading, setIsLoading] = useState(false);
    const { t } = useTranslation();
    useEffect(() => { setProfile(user.profile!); }, [user.profile]);
    const handleSave = async () => { setIsLoading(true); await onSave(profile); setIsLoading(false); setIsEditing(false); }
    return (
        <div className="page-content profile-page">
            <h2>{t('yourProfile')}</h2>
            <div className="profile-card">
                <div className="input-group"><label>{t('emailAddress')}</label><input type="email" value={user.email} disabled /></div>
                <div className="input-group"><label>{t('phoneNumber')}</label><input type="tel" value={user.phone} disabled /></div>
                <div className="input-group"><label>{t('height')}</label><input type="text" value={profile.height} onChange={e => setProfile({...profile, height: e.target.value})} disabled={!isEditing || isLoading} /></div>
                <div className="input-group"><label>{t('weight')}</label><input type="text" value={profile.weight} onChange={e => setProfile({...profile, weight: e.target.value})} disabled={!isEditing || isLoading} /></div>
                <div className="input-group"><label>{t('age')}</label><input type="number" value={profile.age} onChange={e => setProfile({...profile, age: e.target.value})} disabled={!isEditing || isLoading} /></div>
                <div className="input-group"><label>{t('existingConditions')}</label><input type="text" value={profile.conditions} onChange={e => setProfile({...profile, conditions: e.target.value})} disabled={!isEditing || isLoading} /></div>
                <div className="profile-actions">{isEditing ? (<><button onClick={handleSave} disabled={isLoading}>{isLoading ? t('saving') : t('saveChanges')}</button><button className="secondary" onClick={() => {setIsEditing(false); setProfile(user.profile!)} } disabled={isLoading}>{t('cancel')}</button></>) : (<button onClick={() => setIsEditing(true)} disabled={isLoading}>{t('editProfile')}</button>)}</div>
            </div>
            <button className="logout-button" onClick={onLogout}>{t('logout')}</button>
        </div>
    );
};


const MainLayout = ({ user, onLogout, onProfileSave }: { user: User, onLogout: () => void, onProfileSave: (profile: UserProfile) => Promise<void> }) => {
    const [activePage, setActivePage] = useState<ActivePage>('dashboard');
    const { t } = useTranslation();
    const renderActivePage = () => {
        switch(activePage) {
            case 'dashboard': return <DashboardPage user={user} onNavigate={setActivePage} />;
            case 'consult': return <ConsultPage />;
            case 'diagnose': return <div className="page-content diagnose-page"><SymptomAnalyzer user={user} /></div>;
            case 'reports': return <ReportsPage user={user} />;
            case 'profile': return <ProfilePage user={user} onSave={onProfileSave} onLogout={onLogout} />;
            default: return <DashboardPage user={user} onNavigate={setActivePage} />;
        }
    }
    return (
        <div className="app-container">
            <Header onLogout={onLogout} onNavigate={setActivePage} />
            <main className="app-main-content">{renderActivePage()}</main>
            <FooterNav activePage={activePage} onNavigate={setActivePage} />
        </div>
    );
};

// --- Root App Component ---
const App = () => {
  const { user: currentUser, authChecked } = useAuth();
  const handleLogin = async (email: string, pass: string): Promise<boolean> => { const { user } = await api.login(email, pass); return !!user; };
  const handleSignup = async (email: string, phone: string, pass: string): Promise<boolean> => { const { user } = await api.signup(email, phone, pass); return !!user; };
  const handleProfileSave = async (profile: UserProfile) => { if (!currentUser) return; await api.saveProfile(currentUser.email, profile); };
  const handleLogout = async () => { await api.logout(); };

  if (!authChecked) { return <div className="loading-fullscreen"><div className="spinner"></div></div>; }
  
  // Fix: Replaced the AppContent component defined inside App's render method with an IIFE.
  // This avoids the anti-pattern of defining components inside render, which was likely causing the obscure TypeScript error.
  return (
    <LanguageProvider user={currentUser} onProfileSave={handleProfileSave}>
      {(() => {
        if (!currentUser) {
          return <AuthPage onLogin={handleLogin} onSignup={handleSignup} />;
        }
        if (!currentUser.profile) {
          return (
            <ProfileSetupPage user={currentUser} onSave={handleProfileSave} />
          );
        }
        return (
          <MainLayout
            user={currentUser}
            onLogout={handleLogout}
            onProfileSave={handleProfileSave}
          />
        );
      })()}
    </LanguageProvider>
  );
};

const root = ReactDOM.createRoot(document.getElementById("root")!);
root.render(<App />);