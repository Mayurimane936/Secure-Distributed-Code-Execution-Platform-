import { useState, useEffect } from 'react'

function App() {
  const [code, setCode] = useState('print("Hello from frontend")')
  const [language, setLanguage] = useState('python')
  const [timeout, setTimeoutValue] = useState(5)
  const [jobId, setJobId] = useState('')
  const [jobResult, setJobResult] = useState(null)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('idle')

  useEffect(() => {
    let es
    let intervalId

    const startFallbackPolling = () => {
      intervalId = setInterval(async () => {
        try {
          const response = await fetch(`/api/job-status/${jobId}`)
          if (response.ok) {
            const data = await response.json()
            setJobResult(data)
            setStatus(data.status)
            if (data.status !== 'queued' && data.status !== 'running') {
              clearInterval(intervalId)
            }
          }
        } catch (err) {
          console.error('Polling failed', err)
        }
      }, 5000) // fallback interval 5s to reduce command usage
    }

    if (jobId) {
      try {
        es = new EventSource(`/api/events/${jobId}`)
        es.onmessage = (e) => {
          try {
            const data = JSON.parse(e.data)
            setJobResult(data)
            setStatus(data.status)
            if (data.status !== 'queued' && data.status !== 'running') {
              es.close()
              if (intervalId) clearInterval(intervalId)
            }
          } catch (err) {
            console.error('Invalid SSE payload', err)
          }
        }
        es.onerror = () => {
          // If SSE fails, start fallback polling with a longer interval
          if (es) es.close()
          startFallbackPolling()
        }
      } catch (err) {
        startFallbackPolling()
      }
    }

    return () => {
      if (es) es.close()
      if (intervalId) clearInterval(intervalId)
    }
  }, [jobId, status])

  const submitCode = async () => {
    setError('')
    setJobResult(null)
    setStatus('submitting')

    const response = await fetch('/api/submit-code', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        code,
        language,
        timeout_seconds: Number(timeout),
      }),
    })

    if (!response.ok) {
      const data = await response.json()
      setError(data.detail || 'Submission failed')
      setStatus('error')
      return
    }

    const data = await response.json()
    setJobId(data.job_id)
    setStatus('queued')
  }

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <header className="rounded-3xl border border-slate-800 bg-slate-900/80 p-8 shadow-2xl shadow-slate-950/40 backdrop-blur-xl">
          <div className="flex flex-col gap-3">
            <div className="inline-flex items-center gap-3 rounded-full bg-slate-800/90 px-4 py-2 text-sm text-sky-200 ring-1 ring-sky-500/20">
              Secure Code Execution UI
            </div>
            <div>
              <h1 className="text-4xl font-semibold text-white">Run Python safely in a shared container pool</h1>
              <p className="mt-3 max-w-2xl text-slate-300">
                Submit code, track execution status, and inspect output from the pooled runner containers.
              </p>
            </div>
          </div>
        </header>

        <main className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <section className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6 shadow-2xl shadow-slate-950/40 backdrop-blur-xl">
            <div className="mb-4 flex items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-semibold text-white">Submit Code</h2>
                <p className="mt-1 text-sm text-slate-400">Use the editor below to submit code for execution.</p>
              </div>
              <span className="rounded-full bg-sky-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-sky-300">
                {status}
              </span>
            </div>

            <div className="space-y-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-300">Language</label>
                <select
                  className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-slate-200 outline-none transition focus:border-sky-400"
                  value={language}
                  onChange={(event) => setLanguage(event.target.value)}
                >
                  <option value="python">Python</option>
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-300">Timeout (seconds)</label>
                <input
                  className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-slate-200 outline-none transition focus:border-sky-400"
                  type="number"
                  min="1"
                  max="10"
                  value={timeout}
                  onChange={(event) => setTimeoutValue(event.target.value)}
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-300">Code</label>
                <textarea
                  className="min-h-[260px] w-full rounded-3xl border border-slate-700 bg-slate-950 px-4 py-4 text-slate-100 outline-none transition focus:border-sky-400"
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                />
              </div>

              <button
                className="inline-flex items-center justify-center rounded-3xl bg-sky-500 px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-60"
                onClick={submitCode}
                disabled={status === 'submitting' || status === 'queued' || status === 'running'}
              >
                {status === 'submitting' ? 'Submitting...' : 'Submit Code'}
              </button>

              {error && (
                <div className="rounded-3xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                  <strong>Error:</strong> {error}
                </div>
              )}
            </div>
          </section>

          <section className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6 shadow-2xl shadow-slate-950/40 backdrop-blur-xl">
            <div className="mb-4">
              <h2 className="text-2xl font-semibold text-white">Execution Result</h2>
              <p className="mt-1 text-sm text-slate-400">Results appear once the job completes.</p>
            </div>

            {!jobResult ? (
              <div className="rounded-3xl border border-dashed border-slate-700 bg-slate-950/80 p-6 text-slate-400">
                Submit a job to see results here.
              </div>
            ) : (
              <div className="space-y-5">
                <div className="rounded-3xl bg-slate-950/90 p-5 shadow-inner shadow-slate-950/20">
                  <div className="flex items-center justify-between gap-4">
                    <p className="text-sm text-slate-400">Job ID</p>
                    <span className="rounded-full bg-slate-800 px-3 py-1 text-xs text-slate-300">{jobResult.job_id}</span>
                  </div>
                </div>

                <div className="space-y-4 rounded-3xl bg-slate-950/90 p-5">
                  <div>
                    <p className="text-sm font-medium text-slate-300">Output</p>
                    <pre className="mt-2 rounded-2xl bg-slate-900 px-4 py-4 text-sm text-slate-100">{jobResult.output || 'No output'}</pre>
                  </div>

                  <div>
                    <p className="text-sm font-medium text-slate-300">Debug Output</p>
                    <pre className="mt-2 rounded-2xl bg-slate-900 px-4 py-4 text-sm text-slate-100">{jobResult.debug_output || 'No debug output'}</pre>
                  </div>

                  <div>
                    <p className="text-sm font-medium text-slate-300">Error</p>
                    <pre className="mt-2 rounded-2xl bg-slate-900 px-4 py-4 text-sm text-slate-100">{jobResult.error || 'No error'}</pre>
                  </div>

                  <div className="grid grid-cols-2 gap-4 text-sm text-slate-400">
                    <div className="rounded-3xl bg-slate-950/90 p-4">
                      <p className="font-medium text-slate-200">Execution Time</p>
                      <p className="mt-1">{jobResult.execution_time}s</p>
                    </div>
                    <div className="rounded-3xl bg-slate-950/90 p-4">
                      <p className="font-medium text-slate-200">Container</p>
                      <p className="mt-1">{jobResult.container_name}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </section>
        </main>
      </div>
    </div>
  )
}

export default App
