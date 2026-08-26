type PrivacyNoticeProps = {
  onChangeAnalyticsChoice: () => void;
};

export default function PrivacyNotice({ onChangeAnalyticsChoice }: PrivacyNoticeProps) {
  return (
    <div className="tool-page active">
      <div className="tool-header">
        <div>
          <h1>CAT Privacy Notice</h1>
          <p className="tool-desc">How CAT processes research data, API keys, optional analytics, and contact messages.</p>
        </div>
      </div>

      <div className="tool-body privacy-notice-body">
        <article className="ana-section privacy-notice-card">
          <p className="privacy-notice-updated"><strong>Last updated:</strong> August 20, 2026</p>

          <h2>Who operates CAT</h2>
          <p>
            CAT is operated by the Social Science Experimental Laboratory at NYU Abu Dhabi.
            Privacy, access, correction, and deletion requests may be sent to{" "}
            <a href="mailto:jkl499@nyu.edu">jkl499@nyu.edu</a>.
          </p>

          <h2>Optional usage analytics</h2>
          <p>
            CAT asks before collecting optional analytics. If you accept, CAT records a persistent
            browser session identifier, public IP address, best-effort country, region and city,
            browser user agent, referring page, event time, selected provider and model names, and
            counts describing the configured task. CAT obtains the public IP through ipify and sends
            it to ip-api.com to obtain an approximate location. These services receive the IP address
            needed to answer those requests.
          </p>
          <p>
            If you reject optional analytics, CAT sends only an anonymous visit event. The application
            does not look up or store your location, browser identifier, user agent, referrer, or task
            configuration for that event. As with any website, university infrastructure and reverse-
            proxy access logs may process connection information for security and operations.
          </p>
          <p>
            Your choice is stored in this browser as <code>cat_analytics_consent</code>. Use the button
            below to make a new choice for future events.
          </p>
          <p>
            <button type="button" className="btn btn-outline" onClick={onChangeAnalyticsChoice}>
              Change Analytics Choice
            </button>
          </p>

          <h2>Demonstration video</h2>
          <p>
            The demonstration video is delivered on demand from CAT&apos;s public GitHub repository.
            Your browser does not request the video until you press play. GitHub receives the
            connection information needed to deliver the video, which may include your IP address
            and browser request metadata.
          </p>

          <h2>Research data and API keys</h2>
          <p>
            CAT does not store API keys in its database, browser storage, generated packages, or
            application logs. Keys are held in memory for the requested operation. During browser
            coding, the selected LLM provider receives the experimental instructions, coding manual,
            communication episodes, and selected context needed for the task.
          </p>
          <p>
            Uploaded datasets and generated results use temporary server-side working files. Project
            reset and successful dataset replacement request cleanup, and scheduled cleanup removes
            working directories after the 24-hour threshold. The browser also keeps the current project
            and dataset locally so work can be restored; resetting the project clears that browser copy.
          </p>

          <h2>Contact messages and retention</h2>
          <p>
            Contact-form submissions contain the name, email address, title, message, status, and time
            supplied for responding to the request. Operational analytics and contact messages are
            currently retained until administratively deleted. You may request access or deletion at
            the email address above. CAT does not sell personal information.
          </p>

          <h2>Your responsibilities</h2>
          <p>
            Researchers are responsible for confirming that data sent through CAT complies with
            participant consent, institutional review requirements, data-use agreements, and applicable
            law. Sensitive data should be de-identified or used only with an institutionally approved
            LLM provider.
          </p>
        </article>
      </div>
    </div>
  );
}
