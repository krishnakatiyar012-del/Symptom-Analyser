import React, { useState, useEffect, useRef } from "react";
import ReactDOM from "react-dom/client";
import { GoogleGenAI, Chat, Part } from "@google/genai";

const API_KEY = process.env.API_KEY;

type AppState = "disclaimer" | "input" | "chat" | "conclusion" | "report";
type TipsState = "idle" | "loading" | "visible" | "declined";
type Message = {
  role: "user" | "model";
  parts: Part[];
};
type ImageData = {
  dataUrl: string;
  mimeType: string;
};
type ReportData = {
  patientComplaint: string;
  symptomImages: string[];
  diagnosticQuestions: { question: string; answer: string }[];
  preliminaryAssessment: {
    potentialConditions: { name: string; confidence: string; keyIndicators: string[] }[];
  };
};

const App = () => {
  const [appState, setAppState] = useState<AppState>("disclaimer");
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

  const ai = new GoogleGenAI({ apiKey: API_KEY });

  useEffect(() => {
    if (chatHistoryRef.current) {
      chatHistoryRef.current.scrollTop = chatHistoryRef.current.scrollHeight;
    }
  }, [chatHistory, isLoading]);

  const dataUrlToGenerativePart = (dataUrl: string, mimeType: string) => {
      return {
          inlineData: { data: dataUrl.split(",")[1], mimeType }
      }
  }

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      files.forEach((file: File) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          setUploadedImages((prev) => [
            ...prev,
            { dataUrl: reader.result as string, mimeType: file.type },
          ]);
        };
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

    const newChat = ai.chats.create({
      model: "gemini-2.5-pro",
      config: { systemInstruction },
    });
    setChat(newChat);

    const initialParts: Part[] = [{ text: symptomText }];
    const imageParts = uploadedImages.map(img => dataUrlToGenerativePart(img.dataUrl, img.mimeType));
    initialParts.push(...imageParts);

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
      
      if (response.text?.startsWith("CONCLUSION:")) {
          const conclusionJsonString = response.text.replace("CONCLUSION:", "").trim();
          try {
              const parsedConclusion = JSON.parse(conclusionJsonString);
              setConclusionData(parsedConclusion);
              setAppState("conclusion");
          } catch (error) {
              console.error("Failed to parse conclusion JSON:", error);
              setChatHistory(prev => [...prev, { role: "model", parts: [{text: "I'm sorry, I encountered an error in finalizing my analysis. Please try starting a new analysis."}]}]);
          }
      } else {
          setChatHistory(prev => [...prev, { role: "model", parts: response.candidates[0].content.parts }]);
      }
      setIsLoading(false);
  }

  const generateReport = async () => {
      if (!chat) return;
      setIsLoading(true);
      const image_data_urls = uploadedImages.map(img => img.dataUrl);
      const reportPrompt = `Based on our entire conversation, please generate a structured doctor's summary. Respond ONLY with a single JSON object. The JSON should have these keys: 'patientComplaint', 'symptomImages' (an array containing these data URLs: ${JSON.stringify(image_data_urls)}), 'diagnosticQuestions', and 'preliminaryAssessment'. Do not include any other text or markdown formatting.`;
      
      const response = await chat.sendMessage({ message: reportPrompt });
      const reportJsonString = response.text.trim();
      
      try {
          const parsedReport = JSON.parse(reportJsonString);
          setReportData(parsedReport);
          setAppState("report");
      } catch(error) {
          console.error("Failed to parse report JSON:", error);
          alert("Sorry, there was an error generating the report.");
      }
      setIsLoading(false);
  }

  const getTreatmentTips = async () => {
    if (!chat || !conclusionData) return;
    
    setTipsState("loading");
    const conditionNames = conclusionData.potentialConditions.map(c => c.name).join(', ');

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

  const renderContent = () => {
    switch (appState) {
      case "disclaimer":
        return (
          <div className="main-content disclaimer-screen">
            <h2>Medical Disclaimer</h2>
            <p>
              SymptomAI is an AI-powered informational tool and is not a
              substitute for professional medical advice, diagnosis, or
              treatment. Always seek the advice of your physician or other
              qualified health provider with any questions you may have regarding a
              medical condition.
            </p>
            <button onClick={() => setAppState("input")}>I Understand and Agree</button>
          </div>
        );
      case "input":
        return (
          <div className="main-content input-screen">
            <div className="input-group">
                <label>Describe your symptoms in detail:</label>
                <textarea 
                    value={symptomText}
                    onChange={(e) => setSymptomText(e.target.value)}
                    placeholder="e.g., I have a sore throat, a headache, and a rash on my arm that started two days ago."
                />
            </div>
            <div className="input-group">
                <label>Upload photos of visible symptoms (optional):</label>
                <input type="file" accept="image/*" multiple onChange={handleImageUpload} id="file-upload" style={{display: 'none'}} />
                <label htmlFor="file-upload" className="image-uploader">
                    <span>Click to select images</span>
                </label>
                <div className="image-previews">
                    {uploadedImages.map((img, i) => <img key={i} src={img.dataUrl} className="preview-image" alt="symptom preview" />)}
                </div>
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
                                    if ('text' in part && part.text) {
                                        return <p key={j}>{part.text}</p>;
                                    }
                                    if ('inlineData' in part && part.inlineData) {
                                        const src = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
                                        return <img key={j} src={src} alt="symptom" style={{maxWidth: '150px', borderRadius: '8px'}}/>;
                                    }
                                    return null;
                                })}
                            </div>
                        </div>
                    ))}
                    {isLoading && (
                        <div className="chat-message model">
                            <div className="spinner" style={{width: '20px', height: '20px'}}></div>
                        </div>
                    )}
                </div>
                <form onSubmit={handleSendMessage} className="chat-input-form">
                    <input 
                        type="text" 
                        value={currentUserMessage}
                        onChange={e => setCurrentUserMessage(e.target.value)}
                        placeholder="Type your answer..."
                        disabled={isLoading}
                    />
                    <button type="submit" disabled={isLoading}>Send</button>
                </form>
            </div>
        )
      case "conclusion":
        return (
            <div className="main-content">
                <div className="conclusion-card">
                    <h3>Preliminary Analysis</h3>
                    <ul>
                    {conclusionData?.potentialConditions?.map((c, i) => (
                        <li key={i}>
                            <div className="condition-name">{c.name}</div>
                            <div className="confidence">Confidence: {c.confidence}</div>
                            <div className="indicators">Key Indicators: {c.keyIndicators.join(', ')}</div>
                        </li>
                    ))}
                    </ul>
                    <p className="final-disclaimer">This analysis is for informational purposes only. Please consult a qualified healthcare professional.</p>
                    
                    {tipsState === 'idle' && (
                        <div className="tips-prompt">
                            <p>Would you like to receive some primary care and first-aid tips for these symptoms?</p>
                            <div className="button-group">
                                <button onClick={getTreatmentTips}>Yes, please</button>
                                <button className="secondary" onClick={() => setTipsState('declined')}>No, thank you</button>
                            </div>
                        </div>
                    )}
                    
                    {tipsState === 'loading' && (
                        <div className="loading-indicator">
                            <div className="spinner"></div>
                            <p>Generating tips...</p>
                        </div>
                    )}

                    {tipsState === 'visible' && treatmentTips && (
                        <div className="tips-content">
                            <h3>Primary Care Tips</h3>
                            <div className="tips-text" dangerouslySetInnerHTML={{ __html: treatmentTips.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\*/g, '<br/>• ').replace(/<br\/>•/,'•') }}></div>
                        </div>
                    )}

                    <div className="report-footer">
                        <button onClick={generateReport} disabled={isLoading}>
                            {isLoading ? 'Generating...' : "Generate Doctor's Summary"}
                        </button>
                        <button className="secondary" onClick={resetApp}>Start New Analysis</button>
                    </div>
                </div>
            </div>
        )
      case "report":
        return (
            reportData && (
                <div className="report-modal">
                    <div className="report-content">
                        <div className="report-header">
                          <h2>Doctor's Summary</h2>
                          <button className="close-button" onClick={() => setAppState("conclusion")}>&times;</button>
                        </div>
                        <div className="report-body">
                            <h4>Patient's Initial Complaint</h4>
                            <p>{reportData.patientComplaint}</p>
                            
                            {reportData.symptomImages && reportData.symptomImages.length > 0 && (
                                <>
                                    <h4>Symptom Images</h4>
                                    <div className="report-images">
                                        {reportData.symptomImages.map((imgSrc, i) => <img key={i} src={imgSrc} alt={`symptom ${i+1}`} />)}
                                    </div>
                                </>
                            )}
                            
                            <h4>Diagnostic Q&A</h4>
                            <ul className="report-qa-list">
                                {reportData.diagnosticQuestions.map((qa, i) => (
                                    <li key={i}>
                                        <strong>Q:</strong> {qa.question}
                                        <br />
                                        <strong>A:</strong> {qa.answer}
                                    </li>
                                ))}
                            </ul>
                            
                            <h4>Preliminary Assessment</h4>
                            <ul>
                                {reportData.preliminaryAssessment.potentialConditions.map((c, i) => (
                                    <li key={i}>
                                        <strong>{c.name}</strong> (Confidence: {c.confidence})
                                        <br />
                                        <em>Indicators: {c.keyIndicators.join(', ')}</em>
                                    </li>
                                ))}
                            </ul>
                        </div>
                         <div className="report-footer">
                            <button className="secondary" onClick={resetApp}>Start New Analysis</button>
                        </div>
                    </div>
                </div>
            )
        )
    }
  };

  return (
    <>
      <div className="app-header">
        <h1>SymptomAI Analyst</h1>
        <p>Your AI-Powered Health Symptom Assistant</p>
      </div>
      {renderContent()}
    </>
  );
};

const root = ReactDOM.createRoot(document.getElementById("root")!);
root.render(<App />);