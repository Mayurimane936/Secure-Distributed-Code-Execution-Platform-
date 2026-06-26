import { useState, useEffect, useRef, useCallback } from "react";
const API_URL = import.meta.env.VITE_API_URL;
const socialLinks = {
    name: import.meta.env.VITE_AUTHOR_NAME ,
    github: import.meta.env.VITE_GITHUB_URL ,
    linkedin: import.meta.env.VITE_LINKEDIN_URL,
    leetcode: import.meta.env.VITE_LEETCODE_URL,
};
function App() {
  const [code, setCode] = useState('print("Hello World!")');
  const [language, setLanguage] = useState("python");
  const [timeout, setTimeoutValue] = useState(5);
  const [jobId, setJobId] = useState("");
  const [jobResult, setJobResult] = useState(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("idle");
  const [uploadedFile, setUploadedFile] = useState(null);
  const [showFileUpload, setShowFileUpload] = useState(false);
  const fileInputRef = useRef(null);
  const editorRef = useRef(null);
  
  // Undo/redo history
  const [history, setHistory] = useState([code]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const isUndoing = useRef(false);



  const updateCode = useCallback((newCode, addToHistory = true) => {
    setCode(newCode);
    
    if (addToHistory) {
      const newHistory = history.slice(0, historyIndex + 1);
      newHistory.push(newCode);
      setHistory(newHistory);
      setHistoryIndex(newHistory.length - 1);
    }
  }, [history, historyIndex]);



  useEffect(() => {
    let es;
    let intervalId;
    const startFallbackPolling = () => {
      intervalId = setInterval(async () => {
        try {
          const response = await fetch(`${API_URL}/job-status/${jobId}`);



          if (response.ok) {
            const data = await response.json();
            setJobResult(data);
            setStatus(data.status);



            if (data.status !== "queued" && data.status !== "running") {
              clearInterval(intervalId);
            }
          }
        } catch (err) {
          console.error("Polling failed", err);
        }
      }, 5000);
    };



    if (jobId) {
      try {
        es = new EventSource(`${API_URL}/events/${jobId}`);



        es.onmessage = (e) => {
          try {
            const data = JSON.parse(e.data);



            setJobResult(data);
            setStatus(data.status);



            if (
              data.status !== "queued" &&
              data.status !== "running" &&
              data.status !== "pending"
            ) {
              es.close();
              if (intervalId) clearInterval(intervalId);
            }
          } catch (err) {
            console.error("Invalid SSE payload", err);
          }
        };



        es.onerror = () => {
          if (es) es.close();
          startFallbackPolling();
        };
      } catch {
        startFallbackPolling();
      }
    }



    return () => {
      if (es) es.close();
      if (intervalId) clearInterval(intervalId);
    };
  }, [jobId]);



  const submitCode = async () => {
    setError("");
    setJobResult(null);
    setStatus("submitting");



    if (!code.trim()) {
      setError("Please enter some code");
      setStatus("error");
      return;
    }



    try {
      const response = await fetch(`${API_URL}/submit-code`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          code,
          language,
          timeout_seconds: Number(timeout),
        }),
      });



      if (!response.ok) {
        const data = await response.json();
        setError(data.detail || "Submission failed");
        setStatus("error");
        return;
      }



      const data = await response.json();
      setJobId(data.job_id);
      setStatus("queued");
    } catch {
      setError("Failed to submit");
      setStatus("error");
    }
  };



  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.type !== "text/plain" && !file.name.endsWith(".py")) {
        setError("Please upload a Python file (.py)");
        setStatus("error");
        return;
      }
      setUploadedFile(file);
      setShowFileUpload(false);
      setError("");
      setStatus("idle");



      // Read file content
      const reader = new FileReader();
      reader.onload = (event) => {
        updateCode(event.target.result, true);
      };
      reader.readAsText(file);
    }
  };



  const clearFile = () => {
    setUploadedFile(null);
    updateCode('print("Hello World!")', true);
    setShowFileUpload(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };



  const triggerFileUpload = () => {
    setShowFileUpload(true);
    fileInputRef.current?.click();
  };



  const handleEditorKeyDown = (e) => {
    // Handle Cmd+Z / Ctrl+Z (Undo)
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
      e.preventDefault();
      
      if (historyIndex > 0) {
        isUndoing.current = true;
        const newIndex = historyIndex - 1;
        setHistoryIndex(newIndex);
        setCode(history[newIndex]);
        
        setTimeout(() => {
          const textarea = editorRef.current;
          if (textarea) {
            textarea.focus();
          }
        }, 0);
      }
      return;
    }
    
    // Handle Cmd+Y / Ctrl+Y or Ctrl+CY (Redo)
    if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
      e.preventDefault();
      
      if (historyIndex < history.length - 1) {
        const newIndex = historyIndex + 1;
        setHistoryIndex(newIndex);
        setCode(history[newIndex]);
        
        setTimeout(() => {
          const textarea = editorRef.current;
          if (textarea) {
            textarea.focus();
          }
        }, 0);
      }
      return;
    }
    
    // Handle Tab key to insert 4 spaces
    if (e.key === "Tab" && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      
      const textarea = editorRef.current;
      if (!textarea) return;
      
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      
      // Insert 4 spaces at cursor position
      const newCode = code.substring(0, start) + "    " + code.substring(end);
      updateCode(newCode, true);
      
      // Restore cursor position after update
      setTimeout(() => {
        textarea.focus();
        textarea.selectionStart = start + 4;
        textarea.selectionEnd = start + 4;
      }, 0);
      return;
    }
    
    // Handle Shift+Tab for undo indentation
    if (e.key === "Tab" && e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      const textarea = editorRef.current;
      if (!textarea) return;
      
      const start = textarea.selectionStart;
      
      // Remove 4 spaces if they exist before cursor
      if (start >= 4 && code.substring(start - 4, start) === "    ") {
        const newCode = code.substring(0, start - 4) + code.substring(start);
        updateCode(newCode, true);
        
        setTimeout(() => {
          textarea.focus();
          textarea.selectionStart = textarea.selectionEnd = start - 4;
        }, 0);
      }
      return;
    }
  };



  const handleEditorChange = (e) => {
    const newCode = e.target.value;
    updateCode(newCode, true);
  };



  const badgeColors = {
    idle: "bg-gray-700 text-gray-300",
    submitting: "bg-blue-500/20 text-blue-400",
    queued: "bg-blue-500/20 text-blue-400",
    running: "bg-yellow-500/20 text-yellow-400",
    completed: "bg-emerald-500/20 text-emerald-400",
    timeout: "bg-orange-500/20 text-orange-400",
    error: "bg-red-500/20 text-red-400",
    failed: "bg-red-500/20 text-red-400",
  };


  // Count lines for line numbers
  const lineNumbers = code.split('\n').map((_, i) => i + 1);
  // Check if we're waiting for results (not yet completed)
  const isWaiting = status !== "completed" && status !== "error" && status !== "failed" && status !== "timeout" && status !== "idle" && jobId;



  return (
    <div className="min-h-screen bg-[#0d1117] px-4 py-6 text-gray-100">
      <div className="mx-auto max-w-7xl space-y-6">
        {/* HEADER */}
        <header className="rounded-2xl border border-gray-700 bg-[#161b22] p-6 md:p-8 shadow-xl">
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <svg className="h-8 w-8 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
              </svg>
              <span className="rounded-full bg-blue-500/10 px-4 py-2 text-sm text-blue-400 ring-1 ring-blue-500/30">
                Secure Code Execution Platform
              </span>
            </div>



            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="flex flex-col gap-2">
                <h1 className="text-3xl md:text-5xl font-bold text-white">
                  Run Python Securely
                </h1>



                <p className="mt-1 max-w-2xl text-gray-400">
                  Submit code, monitor execution status, and inspect output from
                  isolated pooled containers.
                </p>
              </div>



              <div className="flex flex-col items-end gap-2">
                <span
                  className={`rounded-full px-4 py-2 text-sm font-semibold ${
                    badgeColors[status]
                  }`}
                >
                  {status.toUpperCase()}
                </span>
                
                {/* Developer Profile Links */}
                <div className="flex items-center gap-3">
                  <a
                    href={socialLinks.github}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-blue-400 transition"
                  >
                    <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.039-1.462-4.039-1.462-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.195.694.801.575 4.767-1.589 8.201-6.088 8.201-11.386 0-6.627-5.373-12-12-12z"/>
                    </svg>
                    GitHub
                  </a>
                  
                  <a
                    href={socialLinks.linkedin}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-blue-400 transition"
                  >
                    <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M20.447 20.452h-3.555v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 22.227.792 23 1.771 23h20.454C23.21 23 24 22.227 24 22.271V1.729C24 .774 23.21 0 22.225 0z"/>
                    </svg>
                    LinkedIn
                  </a>
                  
                  <a
                    href={socialLinks.leetcode}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-blue-400 transition"
                  >
                    <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L8.5 15v1.5c0 .83.67 1.5 1.5 1.5v1.93zm6.93-1.5c-.49 3.95-3.85 7-7.93 7V19.5c.83 0 1.5-.67 1.5-1.5V15l2.29-2.29c.62.21 1.28.29 1.93.29 1.38 0 2.64-.56 3.54-1.46.9.9 1.46 2.16 1.46 3.54 0 .49-.08.96-.21 1.41zM12 4.07c3.95.49 7 3.85 7 7.93 0 .62-.08 1.21-.21 1.79L15.5 13v-1.5c0-.83-.67-1.5-1.5-1.5V4.07zm4.54 3.54c-.9-.9-2.16-1.46-3.54-1.46-.49 0-.96.08-1.41.21V8.5c0 .83.67 1.5 1.5 1.5h1.5c.62-.21 1.28-.29 1.93-.29 1.38 0 2.64.56 3.54 1.46V7.61z"/>
                    </svg>
                    LeetCode
                  </a>
                </div>
              </div>
            </div>
          </div>
        </header>



        {/* MAIN */}
        <main className="grid grid-cols-1 gap-6 xl:grid-cols-[1.5fr_1fr]">
          {/* LEFT PANEL - Editor */}
          <section className="rounded-2xl border border-gray-700 bg-[#161b22] p-6 shadow-xl">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-semibold text-white">Code Editor</h2>
                <p className="mt-1 text-sm text-gray-400">
                  Write or upload code to execute securely
                </p>
              </div>
            </div>



            <div className="space-y-5">
              {/* Settings Row */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* Language */}
                <div>
                  <label className="mb-2 block text-xs font-medium text-gray-300">
                    Language
                  </label>



                  <div className="relative">
                    <select
                      value={language}
                      onChange={(e) => setLanguage(e.target.value)}
                      className="w-full rounded-xl border border-gray-600 bg-[#0d1117] px-4 py-2.5 text-sm text-gray-100 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition appearance-none"
                    >
                      <option value="python" className="bg-[#0d1117] text-gray-100">Python 3</option>
                    </select>
                    <svg className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>



                {/* Timeout */}
                <div>
                  <label className="mb-2 block text-xs font-medium text-gray-300">
                    Timeout (seconds)
                  </label>



                  <div className="relative">
                    <input
                      type="number"
                      min="1"
                      max="10"
                      value={timeout}
                      onChange={(e) => setTimeoutValue(e.target.value)}
                      className="w-full rounded-xl border border-gray-600 bg-[#0d1117] px-4 py-2.5 text-sm text-gray-100 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition pr-10"
                    />
                    <svg className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                </div>



                {/* File Upload */}
                <div>
                  <label className="mb-2 block text-xs font-medium text-gray-300">
                    Upload File
                  </label>



                  <div className="flex gap-2">
                    <button
                      onClick={triggerFileUpload}
                      disabled={status === "submitting" || status === "queued" || status === "running"}
                      className="flex-1 rounded-xl border border-gray-600 bg-[#0d1117] px-4 py-2.5 text-sm text-gray-300 transition hover:bg-gray-800 hover:text-white disabled:opacity-50 disabled:hover:bg-[#0d1117]"
                    >
                      <div className="flex items-center justify-center gap-2">
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                        </svg>
                        Upload
                      </div>
                    </button>



                    {uploadedFile && (
                      <button
                        onClick={clearFile}
                        className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-sm text-red-400 transition hover:bg-red-500/20"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>



                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".py,text/plain"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </div>
              </div>



              {/* File Info */}
              {uploadedFile && (
                <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 p-3">
                  <div className="flex items-center gap-3">
                    <svg className="h-5 w-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <div className="flex-1">
                      <p className="text-sm text-blue-300">{uploadedFile.name}</p>
                      <p className="text-xs text-blue-400">
                        {uploadedFile.size.toLocaleString()} bytes
                      </p>
                    </div>
                  </div>
                </div>
              )}



              {/* Code Editor - GitHub/LeetCode Style */}
              <div className="rounded-xl border border-gray-700 bg-[#0d1117] overflow-hidden shadow-lg">
                {/* Editor Toolbar */}
                <div className="flex items-center justify-between border-b border-gray-700 bg-[#161b22] px-4 py-2">
                  <div className="flex items-center gap-3">
                    {/* File Icon */}
                    <div className="flex items-center gap-2">
                      <svg className="h-5 w-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                      </svg>
                      <span className="text-sm font-medium text-gray-200">main.py</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-xs text-gray-400">{lineNumbers.length} lines</span>
                    <span className="text-xs text-gray-500">
                      Cmd+Z: Undo | Cmd+Y: Redo
                    </span>
                  </div>
                </div>



                {/* Editor with Line Numbers */}
                <div className="flex min-h-[400px] md:min-h-[500px]">
                  {/* Line Numbers */}
                  <div className="flex-none bg-[#161b22] px-3 py-4 text-right text-xs font-mono text-gray-500 leading-6 select-none border-r border-gray-700">
                    {lineNumbers.map((num) => (
                      <div key={num}>{num}</div>
                    ))}
                  </div>



                  {/* Code Input Area */}
                  <textarea
                    ref={editorRef}
                    value={code}
                    onChange={handleEditorChange}
                    onKeyDown={handleEditorKeyDown}
                    spellCheck="false"
                    autoCorrect="off"
                    autoComplete="off"
                    autoCapitalize="off"
                    className="flex-1 resize-none bg-[#0d1117] px-4 py-4 font-mono text-[14px] text-[#e6edf3] outline-none leading-6 scrollbar-thin scrollbar-track-gray-800 scrollbar-thumb-gray-600 placeholder:text-gray-500"
                    style={{
                      tabSize: 4,
                    }}
                    placeholder="# Write your Python code here...
print('Hello, World!')"
                  />
                </div>



                {/* Editor Footer */}
                <div className="border-t border-gray-700 bg-[#161b22] px-4 py-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-4">
                      <span className="text-blue-400">Python 3</span>
                      <span className="text-gray-500">UTF-8</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-gray-500">Tab: 4 spaces</span>
                      <span className="rounded bg-gray-700 px-2 py-0.5 text-gray-400">
                        {code.length} chars
                      </span>
                      <span className="rounded bg-gray-700 px-2 py-0.5 text-gray-400">
                        {historyIndex + 1}/{history.length}
                      </span>
                    </div>
                  </div>
                </div>
              </div>



              {/* Action Buttons */}
              <div className="flex gap-3">
                <button
                  onClick={submitCode}
                  disabled={
                    status === "submitting" ||
                    status === "queued" ||
                    status === "running" ||
                    !code.trim()
                  }
                  className="flex-1 rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 py-3.5 font-semibold text-white transition hover:from-blue-700 hover:to-blue-800 disabled:opacity-50 disabled:hover:from-blue-600 disabled:hover:to-blue-700 shadow-lg shadow-blue-500/20 disabled:shadow-none"
                >
                  <div className="flex items-center justify-center gap-2">
                    {status === "submitting" ? (
                      <>
                        <svg className="h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
                        </svg>
                        Submitting...
                      </>
                    ) : status === "running" ? (
                      <>
                        <svg className="h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
                        </svg>
                        Running...
                      </>
                    ) : (
                      <>
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Run Code
                      </>
                    )}
                  </div>
                </button>



                <button
                  onClick={() => updateCode('print("Hello World!")', true)}
                  disabled={status === "submitting" || status === "queued" || status === "running"}
                  className="rounded-xl border border-gray-600 bg-[#0d1117] px-6 py-3.5 text-sm font-semibold text-gray-300 transition hover:bg-gray-800 hover:text-white disabled:opacity-50"
                >
                  <div className="flex items-center gap-2">
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Reset
                  </div>
                </button>
              </div>



              {error && (
                <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-400">
                  <div className="flex items-start gap-3">
                    <svg className="h-5 w-5 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className="text-sm">{error}</p>
                  </div>
                </div>
              )}
            </div>
          </section>



          {/* RIGHT PANEL - Results */}
          <section className="rounded-2xl border border-gray-700 bg-[#161b22] p-6 shadow-xl">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-semibold text-white">Execution Result</h2>
              {jobResult && (
                <span className="rounded-full bg-gray-700 px-3 py-1 text-xs text-gray-400">
                  {jobResult.job_id}
                </span>
              )}
            </div>



            {/* Loading Icon */}
            {isWaiting && (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-700 bg-[#0d1117]/80 p-8">
                <div className="relative h-16 w-16">
                  <div className="absolute inset-0 rounded-full border-4 border-gray-700/50"></div>
                  <div className="absolute inset-0 rounded-full border-4 border-blue-500 border-t-transparent animate-spin"></div>
                  <div className="absolute inset-2 rounded-full border-4 border-gray-700/30"></div>
                  <div className="absolute inset-2 rounded-full border-4 border-blue-400 border-b-transparent animate-spin [animation-duration:1.5s]"></div>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="h-3 w-3 rounded-full bg-blue-400 animate-pulse"></div>
                  </div>
                </div>
                <p className="mt-4 text-sm text-gray-400">
                  {status === "submitting" ? "Submitting code..." : 
                   status === "queued" ? "Job queued..." : 
                   status === "running" ? "Executing code..." :
                   "Waiting for results..."}
                </p>
              </div>
            )}



            {/* Timeout Message */}
            {status === "timeout" && (
              <div className="rounded-2xl border border-orange-500/30 bg-orange-500/10 p-8 text-center">
                <div className="mb-4 flex items-center justify-center">
                  <svg className="h-12 w-12 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <h3 className="text-xl font-bold text-orange-400">Code Timed Out</h3>
                <p className="mt-2 text-sm text-orange-300">
                  Execution exceeded the {timeout} second limit.
                </p>
              </div>
            )}



            {/* Error/Failed Message */}
            {(status === "error" || status === "failed") && (
              <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-8 text-center">
                <div className="mb-4 flex items-center justify-center">
                  <svg className="h-12 w-12 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h3 className="text-xl font-bold text-red-400">
                  {status === "error" ? "Execution Error" : "Execution Failed"}
                </h3>
                <p className="mt-2 text-sm text-red-300">
                  {jobResult?.error || error || "An error occurred."}
                </p>
              </div>
            )}



            {/* Empty State */}
            {!jobResult && !isWaiting && status !== "timeout" && status !== "error" && status !== "failed" ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-700 bg-[#0d1117]/80 p-8">
                <svg className="h-12 w-12 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <p className="mt-4 text-gray-500">Submit a job to see results</p>
              </div>
            ) : jobResult && !isWaiting ? (
              <div className="space-y-4">
                {/* Output */}
                <div className="rounded-xl border border-gray-700 bg-[#0d1117]">
                  <div className="flex items-center gap-2 border-b border-gray-700 px-4 py-2">
                    <svg className="h-4 w-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6" />
                    </svg>
                    <span className="text-sm font-medium text-gray-300">Output</span>
                  </div>
                  <pre className="max-h-[200px] overflow-auto px-4 py-3 text-sm text-emerald-400">
                    {jobResult.output || "No output"}
                  </pre>
                </div>



                {/* Stats */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-gray-700 bg-[#0d1117] p-4">
                    <p className="text-xs text-gray-500">Execution Time</p>
                    <p className="mt-1 text-lg font-semibold text-white">
                      {jobResult.execution_time}s
                    </p>
                  </div>
                  <div className="rounded-xl border border-gray-700 bg-[#0d1117] p-4">
                    <p className="text-xs text-gray-500">Container</p>
                    <p className="mt-1 text-sm font-semibold text-white break-all">
                      {jobResult.container_name}
                    </p>
                  </div>
                </div>
              </div>
            ) : null}
          </section>
        </main>
      </div>
      
      {/* FOOTER */}
      <footer className="mt-8 border-t border-gray-700 bg-[#161b22] py-6">
        <div className="mx-auto max-w-7xl px-4">
          <div className="flex flex-col items-center justify-between gap-4 md:flex-row">
            <div className="flex items-center gap-2">
              <svg className="h-5 w-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
              </svg>
              <p className="text-sm text-gray-400">
                Built with ❤️ by <span className="text-blue-400 font-semibold">{socialLinks.name}</span>
              </p>
            </div>
            
            <div className="flex items-center gap-4">
              <a
                href={socialLinks.github}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-blue-400 transition"
              >
                <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.039-1.462-4.039-1.462-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.195.694.801.575 4.767-1.589 8.201-6.088 8.201-11.386 0-6.627-5.373-12-12-12z"/>
                </svg>
                GitHub
              </a>
              
              <a
                href={socialLinks.linkedin}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-blue-400 transition"
              >
                <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M20.447 20.452h-3.555v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 22.227.792 23 1.771 23h20.454C23.21 23 24 22.227 24 22.271V1.729C24 .774 23.21 0 22.225 0z"/>
                </svg>
                LinkedIn
              </a>
              
              <a
                href={socialLinks.leetcode}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-blue-400 transition"
              >
                <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L8.5 15v1.5c0 .83.67 1.5 1.5 1.5v1.93zm6.93-1.5c-.49 3.95-3.85 7-7.93 7V19.5c.83 0 1.5-.67 1.5-1.5V15l2.29-2.29c.62.21 1.28.29 1.93.29 1.38 0 2.64-.56 3.54-1.46.9.9 1.46 2.16 1.46 3.54 0 .49-.08.96-.21 1.41zM12 4.07c3.95.49 7 3.85 7 7.93 0 .62-.08 1.21-.21 1.79L15.5 13v-1.5c0-.83-.67-1.5-1.5-1.5V4.07zm4.54 3.54c-.9-.9-2.16-1.46-3.54-1.46-.49 0-.96.08-1.41.21V8.5c0 .83.67 1.5 1.5 1.5h1.5c.62-.21 1.28-.29 1.93-.29 1.38 0 2.64.56 3.54 1.46V7.61z"/>
                </svg>
                LeetCode
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}



export default App;