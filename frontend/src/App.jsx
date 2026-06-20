
import { useState, useEffect } from "react";

const API_URL = import.meta.env.VITE_API_URL;

function App() {
  const [code, setCode] = useState('print("Hello from frontend")');
  const [language, setLanguage] = useState("python");
  const [timeout, setTimeoutValue] = useState(5);
  const [jobId, setJobId] = useState("");
  const [jobResult, setJobResult] = useState(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("idle");

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

  const badgeColors = {
    idle: "bg-slate-700 text-slate-300",
    submitting: "bg-blue-500/20 text-blue-300",
    queued: "bg-indigo-500/20 text-indigo-300",
    running: "bg-yellow-500/20 text-yellow-300",
    completed: "bg-green-500/20 text-green-300",
    error: "bg-red-500/20 text-red-300",
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-black px-4 py-6 text-slate-100">
      <div className="mx-auto max-w-7xl space-y-6">
        {/* HEADER */}
        <header className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6 md:p-8 backdrop-blur-xl shadow-2xl">
          <div className="flex flex-col gap-4">
            <span className="w-fit rounded-full bg-slate-800 px-4 py-2 text-sm text-sky-300 ring-1 ring-sky-500/20">
              Secure Code Execution Platform
            </span>

            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h1 className="text-3xl md:text-5xl font-bold">
                  Run Python Securely
                </h1>

                <p className="mt-3 max-w-2xl text-slate-400">
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
        <main className="grid grid-cols-1 gap-6 xl:grid-cols-[1.4fr_0.9fr]">
          {/* LEFT PANEL */}
          <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6 shadow-2xl backdrop-blur-xl">
            <div className="mb-6">
              <h2 className="text-2xl font-semibold">Submit Code</h2>
              <p className="mt-1 text-sm text-slate-400">
                Write code and execute it securely.
              </p>
            </div>

            <div className="space-y-5">
              {/* Language */}
              <div>
                <label className="mb-2 block text-sm text-slate-300">
                  Language
                </label>

                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 focus:border-sky-400 outline-none"
                >
                  <option value="python">Python</option>
                </select>
              </div>

              {/* Timeout */}
              <div>
                <label className="mb-2 block text-sm text-slate-300">
                  Timeout (seconds)
                </label>

                <input
                  type="number"
                  min="1"
                  max="10"
                  value={timeout}
                  onChange={(e) => setTimeoutValue(e.target.value)}
                  className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 focus:border-sky-400 outline-none"
                />
              </div>

              {/* Editor */}
              <div>
                <label className="mb-2 block text-sm text-slate-300">
                  Code
                </label>

                <textarea
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className="min-h-[350px] md:min-h-[500px] w-full rounded-3xl border border-slate-700 bg-[#0f172a] p-5 font-mono text-green-200 outline-none focus:border-sky-400"
                />
              </div>

              {/* Button */}
              <button
                onClick={submitCode}
                disabled={
                  status === "submitting" ||
                  status === "queued" ||
                  status === "running"
                }
                className="w-full rounded-2xl bg-sky-500 py-3 font-semibold text-slate-950 transition hover:bg-sky-400 disabled:opacity-50"
              >
                {status === "submitting"
                  ? "Submitting..."
                  : status === "running"
                  ? "Running..."
                  : "Submit Code"}
              </button>

              {error && (
                <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-red-300">
                  {error}
                </div>
              )}
            </div>
          </section>

          {/* RIGHT PANEL */}
          <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6 shadow-2xl backdrop-blur-xl">
            <h2 className="text-2xl font-semibold">Execution Result</h2>

            {!jobResult ? (
              <div className="mt-6 rounded-3xl border border-dashed border-slate-700 bg-slate-950/80 p-8 text-center text-slate-500">
                Submit a job to see results
              </div>
            ) : (
              <div className="mt-6 space-y-5">
                {/* Job ID */}
                <div className="rounded-3xl bg-slate-950 p-5 border border-slate-800">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Job ID</span>

                    <span className="rounded-full bg-slate-800 px-3 py-1 text-xs">
                      {jobResult.job_id}
                    </span>
                  </div>
                </div>

                {/* Output */}
                <div>
                  <h3 className="mb-2 text-slate-300">Output</h3>

                  <pre className="max-h-[220px] overflow-auto rounded-3xl border border-slate-800 bg-black/50 p-4 text-green-300 text-sm">
                    {jobResult.output || "No output"}
                  </pre>
                </div>

                {/* Debug */}
                <div>
                  <h3 className="mb-2 text-slate-300">Debug Output</h3>

                  <pre className="max-h-[220px] overflow-auto rounded-3xl border border-slate-800 bg-black/50 p-4 text-blue-300 text-sm">
                    {jobResult.debug_output || "No debug output"}
                  </pre>
                </div>

                {/* Error */}
                <div>
                  <h3 className="mb-2 text-slate-300">Error</h3>

                  <pre className="max-h-[220px] overflow-auto rounded-3xl border border-slate-800 bg-black/50 p-4 text-red-300 text-sm">
                    {jobResult.error || "No error"}
                  </pre>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="rounded-3xl border border-slate-800 bg-slate-950 p-5">
                    <p className="text-slate-400">Execution Time</p>

                    <p className="mt-2 text-xl font-semibold">
                      {jobResult.execution_time}s
                    </p>
                  </div>

                  <div className="rounded-3xl border border-slate-800 bg-slate-950 p-5">
                    <p className="text-slate-400">Container</p>

                    <p className="mt-2 text-sm font-semibold break-all">
                      {jobResult.container_name}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}

export default App;

