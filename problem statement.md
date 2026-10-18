# **Unified Business Management Platform: Problem Statement** 

## **1. Background and Problem** 

Small and growing service businesses lose revenue because inbound leads are answered late or never. A lead arrives by web form, chat or phone; the employee it was meant for is absent, busy or missed the notification; nobody notices; the customer goes to a competitor. The company cannot even see how often this happens, because customer data, conversations, payments, appointments and employee activity are scattered across separate tools that do not share records. 

The problem to solve is to build **one connected web platform where a company manages its customers and sales pipeline, guarantees that every incoming lead is acted on, and talks to customers, collects payments and schedules appointments through real external services, with every action traceable.** 

#### **What goes wrong today** 

- Leads are assigned informally, so ownership is unclear and responsibility is easy to dodge. 

- Absence, leave and overload are not considered when leads are distributed. 

- No one is alerted when a lead has been waiting too long, and no one can later prove who was responsible. 

- The CRM forces every company into one fixed structure of fields and stages, so teams keep side spreadsheets. 

- Customer conversations, payments and appointments live in other apps, so staff switch between tools and the customer record is incomplete. 

- Managers cannot see the true state of the pipeline, the response times or the missed opportunities in one place. 

#### **What a successful solution achieves** 

- Every incoming lead has exactly one accountable owner at any moment, and escalates automatically if ignored. 

- Each company can shape its own pipeline, fields and rules without developer help. 

- Real messages, real payment events and real calendar events appear on the right customer record, with nothing silently lost when an external service fails. 

- Access to information depends on the person's role and permissions, enforced on the server. 

- Management sees current performance and the history of every important action. 

## **2. Target Users** 

The platform serves a sales-driven service company with 5 to 30 employees, such as a real estate agency, a solar installer or a clinic's patient-acquisition team. Several companies use the same platform, and each must be completely separate from the others. 

|User|Situation|What they need|
|---|---|---|
|Owner|Runs the company and pays for|Control over the workspace, roles and settings;|
|||confidence that no lead is wasted;a clear view of|



|User|Situation|What they need|
|---|---|---|
||the platform|revenue and performance|
|Admin|Delegated by the Owner to<br>configure the system|Ability to customize pipelines, fields, assignment<br>rules and integrations without code|
|Manager|Supervises a sales or support<br>team|Visibility of who is available, which leads are<br>overdue, and the power to reassign|
|Sales or<br>support<br>employee<br>(User)|Handles leads and customer<br>conversations daily|One place to see assigned leads, reply to customers,<br>record notes, and get paid or book appointments|
|Customer<br>(external)|Contacts the company and<br>expects a prompt reply|A fast response on the channel they used, a clear<br>payment link and a confirmed appointment|



Owner, Admin and User are the three base levels. A manager is a configurable role built from permissions, not a fourth hard-coded level. 

## **3. Scope** 

The full long-term vision covers about fifteen business modules. This problem statement defines the part that must be solved now: protecting leads, a customizable CRM, and real connections to external services. 

|Must be solved|Not part of this problem|
|---|---|
|Accounts, workspaces, roles and configurable<br>permissions|Full accounting: ledgers, reconciliation,<br>financial statements|
|Customizable CRM: contacts, companies,<br>opportunities, custom fields, one customizable<br>pipeline|Payroll, shift scheduling and legal leave or<br>break rules|
|Lead capture, assignment, acknowledgement,<br>escalation and recovery|Advertising-platform analytics and campaign<br>attribution|
|Audit history of important actions|Full report builder and business intelligence|
|Operational dashboard on live data|Training and onboarding modules, AI role-play|
|Real third-party integrations for messaging,<br>payments and calendar, plus one more of the<br>team's choice|Public marketing website, billing for the<br>platform itself|



## **4. Functional Requirements** 

Each requirement states what must be true in the running application, using real stored data. Timers and thresholds must be configurable so they can be observed in seconds during a demonstration. 

### **F1. Accounts, roles and permissions** 

|ID|Requirement|Acceptance criteria|
|---|---|---|
|F1.1|Sign up, log in, log out and persistent<br>sessions|Signing up creates a new company workspace and<br>makes the first user its Owner; refreshing the page<br>keeps the user logged in|
|F1.2|Three base levels: Owner, Admin, User|The Owner can invite users and assign levels; an<br>Admin cannot modify the Owner; a User sees only<br>what their permissions allow|
|F1.3|Configurable permissions, not tied to<br>role names|The Owner can grant or remove at least: view,<br>create, edit, delete and export for CRM records,<br>manage assignment rules, manage integrations, and<br>view the audit log|
|F1.4|Field-level protection|Opportunity value is hidden or masked for users<br>without the matching permission in lists, detail<br>pages and exports|
|F1.5|Server-side enforcement|A direct API call by an unauthorized user is rejected;<br>hiding a button is not sufficient|
|F1.6|Workspace isolation|A user of one workspace can never read or change<br>data of another workspace, including through<br>guessed identifiers|



### **F2. Customizable CRM** 

|ID|Requirement|Acceptance criteria|
|---|---|---|
|F2.1|Contacts, companies and opportunities<br>with relationships|A contact belongs to a company and can have many<br>opportunities; the contact page shows all related<br>records|
|F2.2|Custom fields created from the<br>interface|An Admin adds a field with a name and a type (text,<br>number, date, dropdown, checkbox) without code;<br>it appears on forms and detail pages immediately|
|F2.3|Different fields for different pipelines|Two pipelines show different custom field sets while<br>sharing the same contact information|
|F2.4|Stage-specific required fields|Moving an opportunity into a configured stage is<br>blocked,with a clear message,until its required|



|ID|Requirement|Acceptance criteria|
|---|---|---|
|||fields are filled|
|F2.5|Customizable pipeline|An Admin can add, rename, reorder and delete<br>stages; deleting a stage that contains opportunities<br>is handled safely; opportunities can be moved<br>between stages on a board or list|
|F2.6|Filtering and saved lists|A user combines at least three criteria (field, tag,<br>stage, owner, date), saves the result as a list, and<br>the list updates automatically as records start or<br>stop matching|
|F2.7|Activity history|Each contact and opportunity shows a time-ordered<br>log of notes, stage changes, assignments, field edits,<br>messages, payments and appointments, with who<br>and when|
|F2.8|Complete customer view|One contact page shows conversations,<br>opportunities, payments, appointments, the<br>assigned employee and the activity history|



### **F3. Lead capture, assignment, acknowledgement and escalation** 

This is the central business problem. A lead must never be left without an accountable person. 

|ID|Requirement|Acceptance criteria|
|---|---|---|
|F3.1|Lead capture from multiple sources|Leads are created from a public web form, from an<br>incoming message on the messaging integration<br>(Section 5, I1) and from a manual entry, each with a<br>source label|
|F3.2|Employee availability|Each employee has a status (Available, Busy, On<br>leave, Offline) that they or an Admin can set|
|F3.3|Configurable assignment rules|An Admin configures at least round-robin<br>distribution among Available employees and a<br>maximum number of open leads per employee;<br>employees who are not Available never receive<br>leads|
|F3.4|Acknowledgement window|The assignee receives a notification and must<br>acknowledge or act within a configurable time; the<br>remaining time is visible|
|F3.5|Escalation chain|When the window expires, the lead moves to the<br>next eligible employee,then to a designated|



|ID|Requirement|Acceptance criteria|
|---|---|---|
|||backup, then to a manager; the number of levels<br>and the time allowed per level are configurable|
|F3.6|Reassignment on absence|Setting an employee to On leave or Offline<br>immediately reassigns their unacknowledged leads;<br>the treatment of already acknowledged leads is<br>defined and visible to users|
|F3.7|Recovery queue|One page lists leads that are unacknowledged<br>beyond their window, escalated more than once, or<br>untouched for a configurable period, with the<br>reason shown for each|
|F3.8|No duplicate action|A lead is never owned by two people at once, and<br>two timers expiring close together do not escalate<br>the same lead twice|
|F3.9|External notification of escalations|When a lead escalates, the new owner is also<br>alerted outside the application through the<br>integration chosen in Section 5, I4|



### **F4. Audit history** 

|ID|Requirement|Acceptance criteria|
|---|---|---|
|F4.1|Record of important actions|Assignment, acknowledgement, escalation,<br>reassignment, role or permission changes, field or<br>pipeline configuration changes, integration connection<br>changes and deletions are recorded with actor (or<br>system), time, target and before and after values where<br>relevant|
|F4.2|Restricted visibility|Only users with the audit permission can open the<br>history, and it can be filtered by event type, user and<br>date|
|F4.3|Tamper resistance|No screen or endpoint allows editing or deleting history<br>entries|



### **F5. Operational dashboard** 

|ID|Requirement|Acceptance criteria|
|---|---|---|
|F5.1|Live overview|The dashboard shows at least: new leads today, open<br>pipeline value by stage, average time to first response, items<br>i|
|||in the recovery queue,escalations in the last 24 hours,|



|ID|Requirement|Acceptance criteria|
|---|---|---|
|||employee availability, upcoming appointments and<br>payments received this month|
|F5.2|Consistent definitions|Every figure follows the definitions in Section 7 and matches<br>the underlying records when opened|
|F5.3|Drill-down|Clicking at least three figures opens the filtered list of<br>records the user is allowed to see|
|F5.4|Role-aware view|A User sees personal figures (own leads, own response<br>time); Owner and Admin see company-wide figures|
|F5.5|Basic customization|A user can show or hide figures and the choice is<br>remembered|



## **5. Mandatory Third-Party Integrations** 

A business platform is only useful if it works with the services a company already uses. The solution must connect to **real external services in their sandbox or test modes** , not to fake or hard-coded stand-ins. Three integrations are mandatory (I1 to I3), and a team must choose one more (I4). Each external service has its own authentication scheme, event format, failure behavior and limits, and the solution must handle them correctly. 

|ID|Integration|Provider (sandbox or test mode)|Business purpose|
|---|---|---|---|
|I1|Messaging|Twilio WhatsApp Sandbox (Twilio<br>SMS is an accepted alternative)|Talk to customers and capture leads<br>from incoming messages|
|I2|Payments|Stripe in test mode|Collect payments for opportunities and<br>see their status on the customer record|
|I3|Calendar|Google Calendar through OAuth<br>2.0|Book appointments with customers on<br>employees' real calendars|
|I4|Notifications<br>(choose one)|Slack, Telegram bot, or<br>transactional email (for example<br>Resend, SendGrid or Mailgun)|Alert employees outside the application<br>when a lead escalates|



### **I1. Messaging** 

|ID|Requirement|Acceptance criteria|
|---|---|---|
|I1.1|Receive messages|A message sent from a real phone to the sandbox number<br>reaches the platform through the provider's webhook and<br>appears in a conversation view|
|I1.2|Request authenticity|Webhook requests are verified with the provider's signature|



|ID|Requirement|Acceptance criteria|
|---|---|---|
|||mechanism; a forged or altered request is rejected and<br>recorded|
|I1.3|Send messages|An employee replies from the platform and the customer<br>receives it on their phone|
|I1.4|Delivery status|Sent, delivered and failed states from the provider's status<br>callbacks are stored and shown on each message|
|I1.5|Contact matching|An incoming message from a known number attaches to the<br>existing contact; from an unknown number it creates a<br>contact and a lead (F3.1)|
|I1.6|Ownership|Each conversation shows its assigned employee and is visible<br>only to users permitted to see it|
|I1.7|Failure handling|If the provider rejects a send or is unreachable, the message<br>stays visible as failed with the reason, and the employee can<br>retry; nothing is silently dropped|
|I1.8|Duplicates|A webhook delivered twice by the provider does not create<br>two messages or two leads|
|I1.9|Opt-out|A contact marked as opted out cannot be messaged, and the<br>interface explains why|



### **I2. Payments** 

|ID|Requirement|Acceptance criteria|
|---|---|---|
|I2.1|Create a payment request|From an opportunity, an employee creates a<br>payment link or checkout session for a stated<br>amount and currency, and can send it to the<br>customer|
|I2.2|Payment confirmation by webhook|Completing a test payment updates the<br>opportunity's payment status in the platform<br>without any manual refresh or action, driven by the<br>provider's webhook|
|I2.3|Request authenticity|Payment webhooks are verified with the provider's<br>signature mechanism before any record changes|
|I2.4|Idempotent processing|The same event received more than once records<br>the payment once|
|I2.5|Other outcomes|Expired, abandoned and failed payments are shown<br>with the correct status;a refund made in the|



|ID|Requirement|Acceptance criteria|
|---|---|---|
|||provider's dashboard is reflected in the platform|
|I2.6|Collected versus expected|The platform distinguishes collected revenue from<br>projected or unpaid amounts, and the dashboard<br>(F5.1) uses collected revenue only for payments<br>received|
|I2.7|Traceability|Each payment shows the opportunity, contact,<br>employee who requested it and the provider's<br>reference|
|I2.8|No card data stored|The platform never stores or logs card numbers;<br>payment details are entered only on the provider's<br>hosted page|



### **I3. Calendar** 

|ID|Requirement|Acceptance criteria|
|---|---|---|
|I3.1|Connect with consent|An employee connects their own Google account through<br>the OAuth 2.0 consent flow, and can disconnect it|
|I3.2|Token handling|Access tokens are refreshed automatically; tokens are<br>stored only on the server; a revoked or expired connection is<br>detected and shown as needing reconnection|
|I3.3|Create appointments|From an opportunity or contact, an employee books an<br>appointment that appears in the employee's real Google<br>Calendar and on the customer record|
|I3.4|Avoid conflicts|The booking screen reads the employee's busy times and<br>prevents or warns about overlaps|
|I3.5|Time zones|Appointment times display correctly for the employee and<br>are stored unambiguously, including across different time<br>zones|
|I3.6|Change and cancel|Rescheduling or cancelling in the platform updates the<br>Google event, and the change is recorded in the activity<br>history|
|I3.7|Availability link|Calendar connection status is visible to Admins; an<br>employee without a connected calendar cannot be booked<br>and sees why|



### **I4. Notifications (choose one provider)** 

|ID|Requirement|Acceptance criteria|
|---|---|---|
|I4.1|Real delivery|When a lead escalates (F3.5), the new owner receives a message<br>on the chosen channel within the same minute|
|I4.2|Useful content|The alert names the lead, the source, the reason for escalation<br>and a link that opens the lead|
|I4.3|Per-user routing|Each employee can configure their own destination (Slack user,<br>Telegram chat or email address)|
|I4.4|Failure handling|A failed alert is recorded, retried a limited number of times and<br>visible to Admins|



### **I5. Requirements shared by every integration** 

|ID|Requirement|Acceptance criteria|
|---|---|---|
|I5.1|Central integrations page|One page lists each integration with its status (not<br>connected, connected, error), when it last worked and<br>its recent errors|
|I5.2|Per-workspace configuration|Each workspace supplies its own credentials or<br>connection; one workspace's connection is never used<br>by another|
|I5.3|Secret handling|API keys, tokens and signing secrets are never sent to<br>the browser, never committed to the repository and<br>never shown in full in the interface|
|I5.4|Synchronization history|Every inbound event and outbound call is recorded<br>with time, result and a reference, and can be reviewed<br>by authorized users|
|I5.5|Resilience|Temporary provider errors are retried with a delay;<br>permanent errors are shown to a user with a plain<br>explanation|
|I5.6|Clearly stated limits|The interface states what each integration can and<br>cannot do (for example, that the messaging sandbox<br>only reaches phones that have joined it)|
|I5.7|Permission and audit|Only users with the integration permission can connect,<br>change or remove an integration, and each change is<br>recorded in the audit history (F4.1)|
|I5.8|Isolation of failures|If one provider is unavailable, the rest of the platform|



|ID|Requirement|Acceptance criteria|
|---|---|---|
|||keeps working|



### **Provider constraints to plan for** 

These are the practical conditions of the chosen providers. Confirm them against each provider's current documentation, since they can change. 

|Provider|What is needed|What to expect|
|---|---|---|
|Twilio<br>WhatsApp<br>Sandbox|A Twilio account and the<br>sandbox number|A phone must first join the sandbox by sending the<br>join phrase; sandbox messages are for testing only|
|Stripe test<br>mode|A Stripe account in test mode,<br>no business verification|Payments use published test card numbers;<br>webhook secrets are issued per endpoint|
|Google<br>Calendar|A Google Cloud project,<br>enabled Calendar API and an<br>OAuth consent screen|An app in testing status accepts only listed test<br>users and may issue short-lived refresh tokens|
|Slack,<br>Telegram or<br>email<br>provider|A free account or bot with its<br>own token|Each has its own message format, rate limits and<br>error codes|
|All webhooks|A publicly reachable HTTPS<br>address|A local development setup needs a tunnel or a<br>deployed address for providers to reach it|



## **6. Quality Requirements** 

These requirements apply to everything in Sections 4 and 5. They describe how well the platform must behave, and they are where core web development skill shows. 

|ID|Area|Requirement|
|---|---|---|
|Q1|Authentication security|Passwords are stored only as salted hashes from a<br>recognized algorithm; sessions or tokens expire and can<br>be ended; login is protected against repeated guessing|
|Q2|Authorization|Every endpoint checks the caller's workspace and<br>permission on the server; identifiers in URLs cannot be<br>used to reach other users' or other workspaces' data|
|Q3|Input safety|All input is validated on the server; the application is<br>protected against injection, cross-site scripting and cross-<br>site request forgery;uploaded or imported content is|



|ID|Area|Requirement|
|---|---|---|
|||never trusted|
|Q4|Data integrity|Related records stay consistent: deleting or changing a<br>stage, field, user or contact never leaves orphaned or<br>contradictory data; concurrent edits do not silently<br>overwrite each other|
|Q5|Concurrency and timing|Assignment, escalation and webhook handling stay<br>correct when events arrive at the same time or more<br>than once, and when the server restarts while timers are<br>running|
|Q6|Persistence|All data lives in a real database and survives restart;<br>configuration made through the interface is stored per<br>workspace|
|Q7|Responsive interface|Every screen is usable on a phone, a tablet and a laptop<br>without horizontal scrolling or hidden controls|
|Q8|Accessibility|Interactive elements can be used with a keyboard, forms<br>have labels, color is not the only carrier of meaning, and<br>contrast is readable|
|Q9|Performance|Lists with several hundred records load with pagination<br>or equivalent, search and filters respond without freezing<br>the interface, and slow operations show progress while<br>the user keeps working|
|Q10|Feedback and errors|Every action shows loading, success and failure states;<br>error messages say what went wrong and what the user<br>can do|
|Q11|Real-time awareness|New leads, escalations and incoming messages appear<br>without a manual page refresh|
|Q12|Consistent data|The same figure shows the same value on every screen,<br>because all screens read the same records and definitions|
|Q13|Configuration and secrets|Settings and secrets are kept outside the source code; a<br>new person can start the application from written<br>instructions and sample data|
|Q14|Maintainable structure|The code separates business rules, data access,<br>integrations and presentation so that a provider or rule<br>can change without rewriting the application|



## **7. Glossary and Metric Definitions** 

Each term below has one meaning everywhere in the platform: on the dashboard, in lists, in exports and in the audit history. 

|Term|Definition|
|---|---|
|Workspace|One company's isolated environment, with its own users, data,<br>configuration and integrations|
|Lead|A record created by intake (web form, incoming message or<br>manual entry) with a source label|
|Assigned time|The moment the system last assigned the lead to a person|
|Acknowledged|The assignee clicked Acknowledge, or performed a recorded<br>action on the lead (note, message, call log, stage change,<br>appointment)|
|Time to first response|Time from the lead's first assignment to its first acknowledgement|
|Escalation|An automatic reassignment caused by an expired<br>acknowledgement window; manual reassignments are counted<br>separately|
|Recovery queue item|A lead that is unacknowledged beyond its window, has escalated<br>two or more times, or has no recorded action for the configured<br>idle period|
|Available employee|A user whose status is Available and whose open-lead count is<br>below the configured limit|
|Open pipeline value|The sum of values of opportunities not in a won or lost stage,<br>grouped by stage; shown only to users permitted to see values|
|Projected revenue|The value of open opportunities and of payment requests not yet<br>paid|
|Collected revenue|The sum of payments confirmed by the payment provider's<br>webhook, minus confirmed refunds|
|Conversation|All messages with one contact on one channel, linked to the<br>contact, its assigned employee and, when applicable, an<br>opportunity|
|Appointment|A calendar event created from the platform and linked to a<br>contact or opportunity|
|Integration event|Any inbound webhook or outbound call to an external provider,<br>recorded in the synchronization history|



