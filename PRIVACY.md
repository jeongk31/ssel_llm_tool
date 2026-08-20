# CAT Privacy Notice

Last updated: August 20, 2026.

CAT is operated by the Social Science Experimental Laboratory at NYU Abu Dhabi.
Privacy, access, correction, and deletion requests may be sent to
[jkl499@nyu.edu](mailto:jkl499@nyu.edu).

## Optional usage analytics

CAT asks before collecting optional analytics. If a visitor accepts, CAT records a
persistent browser session identifier, public IP address, best-effort country, region
and city, browser user agent, referring page, event time, selected provider and model
names, and counts describing the configured task. CAT obtains the public IP through
ipify and sends it to ip-api.com to obtain an approximate location. These services
receive the IP address needed to answer those requests.

If a visitor rejects optional analytics, CAT sends only an anonymous visit event. The
application does not look up or store the visitor's location, browser identifier, user
agent, referrer, or task configuration for that event. As with any website, university
infrastructure and reverse-proxy access logs may process connection information for
security and operations.

The choice is stored in the browser as `cat_analytics_consent`. Visitors can select
**Privacy** in CAT's navigation to change their choice for future events.

## Research data and API keys

CAT does not store API keys in its database, browser storage, generated packages, or
application logs. Keys are held in memory for the requested operation. During browser
coding, the selected LLM provider receives the experimental instructions, coding
manual, communication episodes, and selected context needed for the task.

Uploaded datasets and generated results use temporary server-side working files.
Project reset and successful dataset replacement request cleanup, and scheduled cleanup
removes working directories after the 24-hour threshold. The browser also keeps the
current project and dataset locally so work can be restored; resetting the project
clears that browser copy.

## Contact messages and retention

Contact-form submissions contain the name, email address, title, message, status, and
time supplied for responding to the request. Operational analytics and contact messages
are currently retained until administratively deleted. Users may request access or
deletion using the contact address above. CAT does not sell personal information.

## Researcher responsibilities

Researchers are responsible for confirming that data sent through CAT complies with
participant consent, institutional review requirements, data-use agreements, and
applicable law. Sensitive data should be de-identified or used only with an
institutionally approved LLM provider.
