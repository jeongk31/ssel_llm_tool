"use client";

export default function Home() {
  return (
    <>
      <nav className="topbar">
        <div className="topbar-left">
          <img src="/ssel_logo.png" alt="SSELab" className="topbar-logo" />
          <div className="topbar-sep" />
          <span className="topbar-title">LLM Measurement Toolkit</span>
          <span className="topbar-badge">beta</span>
        </div>
        <div className="topbar-right">
          <div className="status-chip">
            <span className="status-dot" />
            Ready
          </div>
        </div>
      </nav>

      <div className="layout">
        <main className="main">
          <div className="tool-page active">
            <div className="tool-header">
              <div>
                <h1>Build &amp; Run Pipeline</h1>
                <p className="tool-desc">
                  Configure your experiment end-to-end, run across multiple models, and aggregate results via voting.
                </p>
              </div>
            </div>

            <div className="pipeline-layout">
              <div className="config-col">
                <div className="config-scroll">
                  <div style={{ padding: 20, color: "var(--text-3)" }}>
                    Pipeline steps will be built here.
                  </div>
                </div>
                <div className="run-bar">
                  <button className="btn btn-outline">Dry Run</button>
                  <button className="btn btn-run">Run Pipeline</button>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </>
  );
}
