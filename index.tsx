import React, { useState, useEffect, useRef } from "react";
import ReactDOM from "react-dom/client";
import { GoogleGenAI, Chat, Part, LiveServerMessage, Modality, Blob } from "@google/genai";

const API_KEY = process.env.API_KEY;

// --- Data Types ---
type AppState = "disclaimer" | "input" | "chat" | "conclusion" | "report";
type TipsState = "idle" | "loading" | "visible" | "declined";
type Message = { role: "user" | "model"; parts: Part[] };
type ImageData = { dataUrl: string; mimeType: string };
type ReportData = { patientComplaint: string; symptomImages: string[]; diagnosticQuestions: { question: string; answer: string }[]; preliminaryAssessment: { potentialConditions: { name: string; confidence: string; keyIndicators: string[] }[] } };
type UserProfile = { height: string; weight: string; age: string; conditions: string };
type User = { email: string; phone: string; password: string; profile: UserProfile | null };
type ActivePage = "dashboard" | "consult" | "diagnose" | "reports";

// --- Local Storage Utils ---
const getUsers = (): User[] => JSON.parse(localStorage.getItem("arogyaAI_users") || "[]");
const saveUsers = (users: User[]) => localStorage.setItem("arogyaAI_users", JSON.stringify(users));
const getCurrentUserEmail = (): string | null => localStorage.getItem("arogyaAI_currentUser");
const setCurrentUserEmail = (email: string) => localStorage.setItem("arogyaAI_currentUser", email);
const clearCurrentUser = () => localStorage.removeItem("arogyaAI_currentUser");

// --- Audio Helper Functions ---
function encode(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function decode(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

// --- Main Symptom Analyzer Component ---
const SymptomAnalyzer = () => {
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

  const ai = new GoogleGenAI({ apiKey: API_KEY });

  useEffect(() => {
    if (chatHistoryRef.current) {
      chatHistoryRef.current.scrollTop = chatHistoryRef.current.scrollHeight;
    }
  }, [chatHistory, isLoading]);

  const dataUrlToGenerativePart = (dataUrl: string, mimeType: string) => ({ inlineData: { data: dataUrl.split(",")[1], mimeType } });

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      Array.from(e.target.files).forEach((file: File) => {
        const reader = new FileReader();
        reader.onloadend = () => setUploadedImages((prev) => [...prev, { dataUrl: reader.result as string, mimeType: file.type }]);
        // FIX: Corrected typo in FileReader method name.
        reader.readAsDataURL(file);
      });
    }
  };

  const startAnalysis = async () => {
    if (!symptomText.trim()) {
      alert("Please describe your symptoms.");
      return;
    }
    setIsLoading(true);
    setAppState("chat");

    const systemInstruction = `You are an expert medical diagnostic assistant named 'SymptomAI'. Your purpose is to help users understand potential causes for their symptoms. Follow these rules strictly:
1. You are NOT a doctor. Never provide a definitive diagnosis or treatment advice.
2. Your primary goal is to gather information. Analyze the user's initial input (text and images) and identify what crucial information is missing.
3. Ask clear, simple, and targeted questions one at a time to fill in the gaps. Prefer multiple-choice or yes/no questions when possible.
4. After gathering sufficient information, begin your final message with the token \`CONCLUSION:\`. Then, present a list of potential conditions as a JSON object string. For each condition, provide a 'name', a 'confidence' (Low, Medium, or High), and a list of 'keyIndicators'.
5. ALWAYS conclude your analysis summary with a strong recommendation to consult a healthcare professional.
6. If the user later asks for a doctor's summary or report, reformat the entire conversation into a structured report. Respond ONLY with a single JSON object for the report. The JSON should have keys: 'patientComplaint', 'symptomImages' (as an array of data URLs), 'diagnosticQuestions' (array of {question, answer}), and 'preliminaryAssessment'. Do not include any other text or markdown formatting.`;

    const newChat = ai.chats.create({ model: "gemini-2.5-pro", config: { systemInstruction } });
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
    setCurrentUserMessage("");
    setIsLoading(true);

    const response = await chat.sendMessage({ message: currentUserMessage });
    const responseText = response.text;
    const conclusionIndex = responseText?.indexOf("CONCLUSION:");

    if (responseText && conclusionIndex !== -1) {
      const potentialJsonString = responseText.substring(conclusionIndex + "CONCLUSION:".length);
      const startIndex = potentialJsonString.indexOf('{');
      const endIndex = potentialJsonString.lastIndexOf('}');
      if (startIndex !== -1 && endIndex > startIndex) {
        const jsonString = potentialJsonString.substring(startIndex, endIndex + 1);
        try {
          const parsedConclusion = JSON.parse(jsonString);
          setConclusionData(parsedConclusion);
          setAppState("conclusion");
        } catch (error) {
          console.error("Failed to parse conclusion JSON:", error);
          setChatHistory(prev => [...prev, { role: "model", parts: response.candidates[0].content.parts }]);
        }
      } else {
        setChatHistory(prev => [...prev, { role: "model", parts: response.candidates[0].content.parts }]);
      }
    } else {
      setChatHistory(prev => [...prev, { role: "model", parts: response.candidates[0].content.parts }]);
    }
    setIsLoading(false);
  };

  const generateReport = async () => {
    if (!chat) return;
    setIsLoading(true);
    const image_data_urls = uploadedImages.map(img => img.dataUrl);
    const reportPrompt = `Based on our entire conversation, please generate a structured doctor's summary. Respond ONLY with a single JSON object. The JSON should have these keys: 'patientComplaint', 'symptomImages' (an array containing these data URLs: ${JSON.stringify(image_data_urls)}), 'diagnosticQuestions', and 'preliminaryAssessment'. Do not include any other text or markdown formatting.`;
    const response = await chat.sendMessage({ message: reportPrompt });
    try {
      const parsedReport = JSON.parse(response.text.trim());
      setReportData(parsedReport);
      setAppState("report");
    } catch (error) {
      console.error("Failed to parse report JSON:", error);
      alert("Sorry, there was an error generating the report.");
    }
    setIsLoading(false);
  };

  const getTreatmentTips = async () => {
    if (!chat || !conclusionData) return;
    setTipsState("loading");
    const conditionNames = conclusionData.potentialConditions.map((c: any) => c.name).join(', ');
    const tipsPrompt = `Based on the potential conditions of "${conditionNames}", provide safe, primary first-aid and care tips. This advice is for someone in a rural or underdeveloped area with limited immediate access to a doctor. 
    IMPORTANT RULES:
    1. Start with a very strong, clear disclaimer in bold: **"This is not a substitute for professional medical advice. Please see a doctor as soon as possible."**
    2. Do NOT suggest any specific prescription medications. You can suggest over-the-counter relief if appropriate and safe (e.g., staying hydrated, rest, warm salt water gargle).
    3. The advice must be cautious, focusing on symptom relief and preventing the condition from worsening.
    4. Structure the tips with clear headings or bullet points.`;
    const response = await chat.sendMessage({ message: tipsPrompt });
    setTreatmentTips(response.text);
    setTipsState("visible");
  };

  const resetApp = () => {
    setAppState("input");
    setSymptomText("");
    setUploadedImages([]);
    setChat(null);
    setChatHistory([]);
    setCurrentUserMessage("");
    setIsLoading(false);
    setConclusionData(null);
    setReportData(null);
    setTreatmentTips("");
    setTipsState("idle");
  };
  
    async function decodeAudioData(data: Uint8Array, ctx: AudioContext, sampleRate: number, numChannels: number): Promise<AudioBuffer> {
        const dataInt16 = new Int16Array(data.buffer);
        const frameCount = dataInt16.length / numChannels;
        const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);
        for (let channel = 0; channel < numChannels; channel++) {
            const channelData = buffer.getChannelData(channel);
            for (let i = 0; i < frameCount; i++) {
                channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
            }
        }
        return buffer;
    }

    function createBlob(data: Float32Array): Blob {
        const l = data.length;
        const int16 = new Int16Array(l);
        for (let i = 0; i < l; i++) { int16[i] = data[i] * 32768; }
        return { data: encode(new Uint8Array(int16.buffer)), mimeType: 'audio/pcm;rate=16000' };
    }

    const startAudioConversation = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaStreamRef.current = stream;
            inputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
            outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
            setIsListening(true);
            setIsAudioModalOpen(true);
            const sessionPromise = ai.live.connect({
                model: 'gemini-2.5-flash-native-audio-preview-09-2025',
                callbacks: {
                    onopen: () => {
                        const source = inputAudioContextRef.current!.createMediaStreamSource(stream);
                        mediaStreamSourceRef.current = source;
                        const scriptProcessor = inputAudioContextRef.current!.createScriptProcessor(4096, 1, 1);
                        scriptProcessorRef.current = scriptProcessor;
                        scriptProcessor.onaudioprocess = (audioProcessingEvent) => {
                            const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
                            let sum = 0;
                            for (let i = 0; i < inputData.length; i++) { sum += inputData[i] * inputData[i]; }
                            if (Math.sqrt(sum / inputData.length) > 0.01) {
                                sessionPromise.then((session) => session.sendRealtimeInput({ media: createBlob(inputData) }));
                            }
                        };
                        source.connect(scriptProcessor);
                        scriptProcessor.connect(inputAudioContextRef.current!.destination);
                    },
                    onmessage: async (message: LiveServerMessage) => {
                        if (message.serverContent?.inputTranscription) inputTranscriptionRef.current += message.serverContent.inputTranscription.text;
                        if (message.serverContent?.outputTranscription) outputTranscriptionRef.current += message.serverContent.outputTranscription.text;
                        if (message.serverContent?.turnComplete) {
                            setIsListening(false);
                            mediaStreamSourceRef.current?.disconnect();
                            const userTurn = inputTranscriptionRef.current.trim();
                            const modelTurn = outputTranscriptionRef.current.trim();
                            const conclusionIndex = modelTurn.indexOf("CONCLUSION:");
                            if (conclusionIndex !== -1) {
                                const potentialJsonString = modelTurn.substring(conclusionIndex + "CONCLUSION:".length);
                                const startIndex = potentialJsonString.indexOf('{');
                                const endIndex = potentialJsonString.lastIndexOf('}');
                                if (startIndex !== -1 && endIndex > startIndex) {
                                    const jsonString = potentialJsonString.substring(startIndex, endIndex + 1);
                                    try {
                                        const parsedConclusion = JSON.parse(jsonString);
                                        if (userTurn) setChatHistory(prev => [...prev, { role: 'user', parts: [{ text: userTurn }] }]);
                                        setConclusionData(parsedConclusion);
                                        setAppState("conclusion");
                                        stopAudioConversation();
                                    } catch (error) {
                                        if (userTurn) setChatHistory(prev => [...prev, { role: 'user', parts: [{ text: userTurn }] }]);
                                        if (modelTurn) setChatHistory(prev => [...prev, { role: 'model', parts: [{ text: modelTurn }] }]);
                                    }
                                } else {
                                    if (userTurn) setChatHistory(prev => [...prev, { role: 'user', parts: [{ text: userTurn }] }]);
                                    if (modelTurn) setChatHistory(prev => [...prev, { role: 'model', parts: [{ text: modelTurn }] }]);
                                }
                            } else {
                                if (userTurn) setChatHistory(prev => [...prev, { role: 'user', parts: [{ text: userTurn }] }]);
                                if (modelTurn) setChatHistory(prev => [...prev, { role: 'model', parts: [{ text: modelTurn }] }]);
                            }
                            inputTranscriptionRef.current = "";
                            outputTranscriptionRef.current = "";
                        }
                        const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
                        if (base64Audio && outputAudioContextRef.current) {
                            const outputCtx = outputAudioContextRef.current;
                            nextStartTime = Math.max(nextStartTime, outputCtx.currentTime);
                            const audioBuffer = await decodeAudioData(decode(base64Audio), outputCtx, 24000, 1);
                            const sourceNode = outputCtx.createBufferSource();
                            sourceNode.buffer = audioBuffer;
                            sourceNode.connect(outputCtx.destination);
                            if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
                            sourceNode.start(nextStartTime);
                            nextStartTime += audioBuffer.duration;
                            reconnectTimerRef.current = window.setTimeout(() => {
                                if (sessionRef.current) {
                                    mediaStreamSourceRef.current?.connect(scriptProcessorRef.current!);
                                    setIsListening(true);
                                }
                            }, (nextStartTime - outputCtx.currentTime) * 1000 + 200);
                        }
                    },
                    onerror: (e: ErrorEvent) => { console.error('Session error:', e); stopAudioConversation(); },
                    onclose: (e: CloseEvent) => { console.log('Session closed'); stopAudioConversation(); },
                },
                config: {
                    responseModalities: [Modality.AUDIO],
                    inputAudioTranscription: {},
                    outputAudioTranscription: {},
                    systemInstruction: `You are an expert medical diagnostic assistant named 'SymptomAI'. Your purpose is to help users understand potential causes for their symptoms. Follow these rules strictly:
1. You are NOT a doctor.
2. Ask clear, simple, and targeted questions one at a time.
3. After gathering sufficient information, begin your final message with the token \`CONCLUSION:\`. Then, present a list of potential conditions as a JSON object string.
4. This is a voice conversation. Keep your responses concise and clear.`
                }
            });
            sessionPromise.then(session => { sessionRef.current = session; });
        } catch (error) {
            console.error("Failed to start audio conversation:", error);
            alert("Could not access the microphone. Please check your permissions.");
            setIsAudioModalOpen(false);
        }
    };

    const stopAudioConversation = () => {
        setIsAudioModalOpen(false);
        setIsListening(false);
        if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
        if (sessionRef.current) sessionRef.current.close();
        if (mediaStreamRef.current) mediaStreamRef.current.getTracks().forEach(track => track.stop());
        if (mediaStreamSourceRef.current) mediaStreamSourceRef.current.disconnect();
        if (scriptProcessorRef.current) scriptProcessorRef.current.disconnect();
        if (inputAudioContextRef.current) inputAudioContextRef.current.close();
        if (outputAudioContextRef.current) outputAudioContextRef.current.close();
        sessionRef.current = null;
        mediaStreamRef.current = null;
        mediaStreamSourceRef.current = null;
        scriptProcessorRef.current = null;
        inputAudioContextRef.current = null;
        outputAudioContextRef.current = null;
        nextStartTime = 0;
    };
    
  const renderContent = () => {
    switch (appState) {
      case "disclaimer":
        return (
          <div className="main-content disclaimer-screen">
            <h2>Medical Disclaimer</h2>
            <p>SymptomAI is an AI-powered informational tool and is not a substitute for professional medical advice, diagnosis, or treatment. Always seek the advice of your physician or other qualified health provider with any questions you may have regarding a medical condition.</p>
            <button onClick={() => setAppState("input")}>I Understand and Agree</button>
          </div>
        );
      case "input":
        return (
          <div className="main-content input-screen">
            <div className="input-group">
                <label>Describe your symptoms in detail:</label>
                <textarea value={symptomText} onChange={(e) => setSymptomText(e.target.value)} placeholder="e.g., I have a sore throat, a headache, and a rash on my arm..." />
            </div>
            <div className="input-group">
                <label>Upload photos of visible symptoms (optional):</label>
                <input type="file" accept="image/*" multiple onChange={handleImageUpload} id="file-upload" style={{display: 'none'}} />
                <label htmlFor="file-upload" className="image-uploader"><span>Click to select images</span></label>
                <div className="image-previews">{uploadedImages.map((img, i) => <img key={i} src={img.dataUrl} className="preview-image" alt="symptom preview" />)}</div>
            </div>
            <button onClick={startAnalysis} disabled={!symptomText.trim() || isLoading}>{isLoading ? 'Analyzing...' : 'Start Analysis'}</button>
          </div>
        );
      case "chat":
        return (
            <div className="main-content chat-interface">
                <div className="chat-history" ref={chatHistoryRef}>
                    {chatHistory.map((msg, i) => (
                        <div key={i} className={`chat-message ${msg.role}`}>
                            <div>
                                {msg.parts.map((part, j) => {
                                    if ('text' in part && part.text) return <p key={j}>{part.text}</p>;
                                    if ('inlineData' in part && part.inlineData) return <img key={j} src={`data:${part.inlineData.mimeType};base64,${part.inlineData.data}`} alt="symptom" />;
                                    return null;
                                })}
                            </div>
                        </div>
                    ))}
                    {isLoading && <div className="chat-message model"><div className="spinner" style={{width: '20px', height: '20px'}}></div></div>}
                </div>
                <form onSubmit={handleSendMessage} className="chat-input-form">
                    <input type="text" value={currentUserMessage} onChange={e => setCurrentUserMessage(e.target.value)} placeholder="Type your answer..." disabled={isLoading} />
                    <button type="button" className="chat-mic-button" onClick={startAudioConversation} disabled={isLoading} aria-label="Start audio conversation"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z"/></svg></button>
                    <button type="submit" disabled={isLoading}>Send</button>
                </form>
            </div>
        );
      case "conclusion":
        return (
            <div className="main-content">
                <div className="conclusion-card">
                    <h3>Preliminary Analysis</h3>
                    <ul>{conclusionData?.potentialConditions?.map((c: any, i: number) => <li key={i}><div className="condition-name">{c.name}</div><div className="confidence">Confidence: {c.confidence}</div><div className="indicators">Key Indicators: {c.keyIndicators.join(', ')}</div></li>)}</ul>
                    <p className="final-disclaimer">This analysis is for informational purposes only. Please consult a qualified healthcare professional.</p>
                    {tipsState === 'idle' && (<div className="tips-prompt"><p>Would you like to receive some primary care and first-aid tips?</p><div className="button-group"><button onClick={getTreatmentTips}>Yes, please</button><button className="secondary" onClick={() => setTipsState('declined')}>No, thank you</button></div></div>)}
                    {tipsState === 'loading' && <div className="loading-indicator"><div className="spinner"></div><p>Generating tips...</p></div>}
                    {tipsState === 'visible' && treatmentTips && <div className="tips-content"><h3>Primary Care Tips</h3><div className="tips-text" dangerouslySetInnerHTML={{ __html: treatmentTips.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\*/g, '<br/>• ').replace(/<br\/>•/,'•') }}></div></div>}
                    <div className="report-footer"><button onClick={generateReport} disabled={isLoading}>{isLoading ? 'Generating...' : "Generate Doctor's Summary"}</button><button className="secondary" onClick={resetApp}>Start New Analysis</button></div>
                </div>
            </div>
        );
      case "report":
        return reportData && (<div className="report-modal"><div className="report-content"><div className="report-header"><h2>Doctor's Summary</h2><button className="close-button" onClick={() => setAppState("conclusion")}>&times;</button></div><div className="report-body"><h4>Patient's Initial Complaint</h4><p>{reportData.patientComplaint}</p>{reportData.symptomImages?.length > 0 && (<><h4>Symptom Images</h4><div className="report-images">{reportData.symptomImages.map((imgSrc, i) => <img key={i} src={imgSrc} alt={`symptom ${i+1}`} />)}</div></>)}<h4>Diagnostic Q&A</h4><ul className="report-qa-list">{reportData.diagnosticQuestions.map((qa, i) => (<li key={i}><strong>Q:</strong> {qa.question}<br /><strong>A:</strong> {qa.answer}</li>))}</ul><h4>Preliminary Assessment</h4><ul>{reportData.preliminaryAssessment.potentialConditions.map((c, i) => (<li key={i}><strong>{c.name}</strong> (Confidence: {c.confidence})<br /><em>Indicators: {c.keyIndicators.join(', ')}</em></li>))}</ul></div><div className="report-footer"><button className="secondary" onClick={resetApp}>Start New Analysis</button></div></div></div>);
    }
  };

  return (
    <>
      {renderContent()}
      {isAudioModalOpen && (
        <div className="audio-modal">
            <div className="audio-modal-content">
                <h3>Audio Conversation</h3>
                <p>{isListening ? "ArogyaAI is listening..." : "ArogyaAI is thinking..."}</p>
                <div className={`listening-indicator ${isListening ? 'active' : ''}`}><div></div><div></div><div></div></div>
                <button onClick={stopAudioConversation}>End Conversation</button>
            </div>
        </div>
      )}
    </>
  );
};


// --- App Structure Components ---

const AuthPage = ({ onLogin, onSignup }: { onLogin: (email: string, pass: string) => boolean, onSignup: (email: string, phone: string, pass: string) => boolean }) => {
    const [isLogin, setIsLogin] = useState(true);
    const [email, setEmail] = useState('');
    const [phone, setPhone] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        if (isLogin) {
            if (!onLogin(email, password)) {
                setError('Invalid email or password.');
            }
        } else {
            if (!onSignup(email, phone, password)) {
                setError('User with this email already exists.');
            }
        }
    };

    return (
        <div className="auth-container">
            <div className="auth-card">
                <h2>{isLogin ? 'Welcome Back' : 'Create Account'}</h2>
                <form onSubmit={handleSubmit}>
                    <div className="input-group">
                        <label>Email Address</label>
                        <input type="email" value={email} onChange={e => setEmail(e.target.value)} required />
                    </div>
                    {!isLogin && (
                        <div className="input-group">
                            <label>Phone Number</label>
                            <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} required />
                        </div>
                    )}
                    <div className="input-group">
                        <label>Password</label>
                        <input type="password" value={password} onChange={e => setPassword(e.target.value)} required />
                    </div>
                    {error && <p className="auth-error">{error}</p>}
                    <button type="submit">{isLogin ? 'Login' : 'Sign Up'}</button>
                </form>
                <p className="auth-toggle">
                    {isLogin ? "Don't have an account?" : "Already have an account?"}
                    <button onClick={() => setIsLogin(!isLogin)}>{isLogin ? 'Sign Up' : 'Login'}</button>
                </p>
            </div>
        </div>
    );
};

const ProfileSetupPage = ({ user, onSave }: { user: User, onSave: (profile: UserProfile) => void }) => {
    const [height, setHeight] = useState('');
    const [weight, setWeight] = useState('');
    const [age, setAge] = useState('');
    const [conditions, setConditions] = useState('');

    const handleSave = () => {
        onSave({ height, weight, age, conditions });
    };

    return (
        <div className="profile-setup-container">
            <div className="profile-setup-card">
                <h2>Complete Your Profile</h2>
                <p>This information helps us provide a more personalized experience.</p>
                <div className="input-group">
                    <label>Height (e.g., 5ft 10in or 178cm)</label>
                    <input type="text" value={height} onChange={e => setHeight(e.target.value)} />
                </div>
                <div className="input-group">
                    <label>Weight (e.g., 160lbs or 72kg)</label>
                    <input type="text" value={weight} onChange={e => setWeight(e.target.value)} />
                </div>
                <div className="input-group">
                    <label>Age</label>
                    <input type="number" value={age} onChange={e => setAge(e.target.value)} />
                </div>
                 <div className="input-group">
                    <label>Existing Conditions (e.g., Diabetes, High BP)</label>
                    <input type="text" value={conditions} onChange={e => setConditions(e.target.value)} placeholder="Separate with commas" />
                </div>
                <button onClick={handleSave}>Save and Continue</button>
            </div>
        </div>
    );
};

const Header = ({ onLogout }: { onLogout: () => void }) => {
    const [dropdownOpen, setDropdownOpen] = useState(false);
    return (
        <header className="app-header-main">
            <div className="logo">ArogyaAI</div>
            <div className="profile-menu">
                <button onClick={() => setDropdownOpen(!dropdownOpen)} className="profile-button">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="24" height="24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
                </button>
                {dropdownOpen && (
                    <div className="dropdown-menu">
                        <a href="#">Profile</a>
                        <a href="#">Settings</a>
                        <a href="#" onClick={onLogout}>Logout</a>
                    </div>
                )}
            </div>
        </header>
    );
};

const FooterNav = ({ activePage, onNavigate }: { activePage: ActivePage, onNavigate: (page: ActivePage) => void }) => {
    return (
        <nav className="footer-nav">
            <button className={activePage === 'dashboard' ? 'active' : ''} onClick={() => onNavigate('dashboard')}>Dashboard</button>
            <button className={activePage === 'consult' ? 'active' : ''} onClick={() => onNavigate('consult')}>Consult</button>
            <button className={activePage === 'diagnose' ? 'active' : ''} onClick={() => onNavigate('diagnose')}>Diagnose</button>
            <button className={activePage === 'reports' ? 'active' : ''} onClick={() => onNavigate('reports')}>Reports</button>
        </nav>
    );
};


const MainLayout = ({ user, onLogout }: { user: User, onLogout: () => void }) => {
    const [activePage, setActivePage] = useState<ActivePage>('diagnose');

    const renderActivePage = () => {
        switch(activePage) {
            case 'dashboard': return <div className="page-content"><h2>Dashboard</h2><p>Coming soon...</p></div>;
            case 'consult': return <div className="page-content"><h2>Consult</h2><p>Coming soon...</p></div>;
            case 'diagnose': return <div className="page-content diagnose-page"><SymptomAnalyzer /></div>;
            case 'reports': return <div className="page-content"><h2>Reports</h2><p>Coming soon...</p></div>;
            default: return <div className="page-content"><h2>Dashboard</h2><p>Coming soon...</p></div>;
        }
    }

    return (
        <div className="app-container">
            <Header onLogout={onLogout} />
            <main className="app-main-content">
                {renderActivePage()}
            </main>
            <FooterNav activePage={activePage} onNavigate={setActivePage} />
        </div>
    );
};

// --- Root App Component ---
const App = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  useEffect(() => {
    const userEmail = getCurrentUserEmail();
    if (userEmail) {
      const users = getUsers();
      const user = users.find(u => u.email === userEmail);
      setCurrentUser(user || null);
    }
  }, []);

  const handleLogin = (email: string, pass: string): boolean => {
    const users = getUsers();
    const user = users.find(u => u.email === email && u.password === pass);
    if (user) {
      setCurrentUser(user);
      setCurrentUserEmail(user.email);
      return true;
    }
    return false;
  };

  const handleSignup = (email: string, phone: string, pass: string): boolean => {
    const users = getUsers();
    if (users.some(u => u.email === email)) {
      return false; // User exists
    }
    const newUser: User = { email, phone, password: pass, profile: null };
    saveUsers([...users, newUser]);
    setCurrentUser(newUser);
    setCurrentUserEmail(newUser.email);
    return true;
  };

  const handleProfileSave = (profile: UserProfile) => {
    if (!currentUser) return;
    const updatedUser = { ...currentUser, profile };
    const users = getUsers();
    const userIndex = users.findIndex(u => u.email === currentUser.email);
    if (userIndex > -1) {
      users[userIndex] = updatedUser;
      saveUsers(users);
      setCurrentUser(updatedUser);
    }
  };

  const handleLogout = () => {
    clearCurrentUser();
    setCurrentUser(null);
  };

  if (!currentUser) {
    return <AuthPage onLogin={handleLogin} onSignup={handleSignup} />;
  }

  if (!currentUser.profile) {
    return <ProfileSetupPage user={currentUser} onSave={handleProfileSave} />;
  }

  return <MainLayout user={currentUser} onLogout={handleLogout} />;
};

const root = ReactDOM.createRoot(document.getElementById("root")!);
root.render(<App />);