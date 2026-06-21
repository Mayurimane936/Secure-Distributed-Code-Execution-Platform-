import { useState, useEffect, useRef } from "react";

const API_URL = import.meta.env.VITE_API_URL;
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
        setCode(event.target.result);
      };
      reader.readAsText(file);
    }
  };



  const clearFile = () => {
    setUploadedFile(null);
    setCode('print("Hello World!")');
    setShowFileUpload(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };



  const triggerFileUpload = () => {
    setShowFileUpload(true);
    fileInputRef.current?.click();
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
              <div>
                <h1 className="text-3xl md:text-5xl font-bold text-white">
                  Run Python Securely
                </h1>



                <p className="mt-3 max-w-2xl text-gray-400">
                  Submit code, monitor execution status, and inspect output from
                  isolated pooled containers.
                </p>
              </div>



              <span
                className={`rounded-full px-4 py-2 text-sm font-semibold ${
                  badgeColors[status]
                }`}
              >
                {status.toUpperCase()}
              </span>
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
                      className="w-full rounded-xl border border-gray-600 bg-[#0d1117] px-4 py-2.5 text-sm text-gray-100 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition"
                    >
                      <option value="python" className="bg-[#0d1117] text-gray-100">Python 3</option>
                    </select>
                    <svg className="absolute right-3 top-3 h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
                      className="w-full rounded-xl border border-gray-600 bg-[#0d1117] px-4 py-2.5 text-sm text-gray-100 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition"
                    />
                    <svg className="absolute right-3 top-2.5 h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
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
                  onClick={() => setCode('print("Hello World!")')}
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
    </div>
  );
}



export default App;