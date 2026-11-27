// Initial data taken from the SOMLITS Inception Report (Appendix A):
// the Work Plan (Milestones & Tasks) and the Risk Register.
// Used only the first time the server starts (when data/db.json does not exist).

const crypto = require('crypto');

const CONTRACT_DATE = '2026-11-05';

function addDays(iso, n) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const weekStart = (w) => addDays(CONTRACT_DATE, (w - 1) * 7);
const weekEnd = (w) => addDays(CONTRACT_DATE, (w - 1) * 7 + 6);
const rv = (d, r) =>
  `MoLFR returns one consolidated set of comments within ${d} working days; re-review within ${r} working days.`;
const CA = 'Consolidated comments; written approval';
const FP = 'MoLFR (Focal Point)';

const MILESTONES = [
  { id: 'PRE', name: 'Pre-contract — Kickoff & Inception' },
  { id: 'M1', name: 'Project Initiation, Assessment & Design' },
  { id: 'M2', name: 'Cloud Environment & Hardware Procurement' },
  { id: 'M3', name: 'Software Development & Hardware Installation' },
  { id: 'M4', name: 'Deployment, Integration Testing & UAT' },
  { id: 'M5', name: 'Training & Capacity Building' },
  { id: 'M6', name: 'Pilot Deployment & Operational Acceptance' },
  { id: 'M7', name: 'National Rollout & Go-Live' },
  { id: 'M8', name: 'Final Documentation & System Handover' },
  { id: 'M9', name: 'Support Period and Close-out' },
];

// [no, ms, type, task, description, deliverable, responsible, dependency, startWk, endWk, gate]
const TASKS = [
  // ---------------- M1 ----------------
  ['1', 'M1', 'Management', 'Formal project start and team mobilisation (Contract Effective Date)', 'Mobilise the project team', '-', 'Project Management Office (PMO)', 'Contract effective date', 1, 1],
  ['2', 'M1', 'Management', 'Submit Project Inception Meeting Report and Project Implementation Plan', 'Formally submit the final Inception Report and PIP to MoLFR within the contract deadline (30 days from the Effective Date).', 'Project Implementation Plan and Inception Meeting Report', 'AHDAA Project Manager', 'Task 1 (SS)', 1, 1],
  ['R1', 'M1', 'MoLFR Review', 'Review and approval of the Project Implementation Plan (PIP)', 'MoLFR returns one consolidated set of comments within 14 calendar days; re-review within 5 calendar days.', CA, FP, 'Task 2 (FS)', 2, 4],
  ['P1', 'M1', 'MoLFR Input', "Appoint the Purchaser's Project Manager; nominate the Focal Point, Steering Committee and Technical Working Group members", 'Written appointment within 14 days of the Effective Date (GCC 18.1, 10.2).', 'Appointment letter; nomination list', 'MoLFR', 'Needed for Task 3', 1, 2],
  ['3', 'M1', 'Management', 'Requirements elicitation workshops', 'Run requirements workshops to prepare the BRS.', 'Workshop outputs; requirements traceability register', 'Business Analyst', 'Task 1 (SS)', 1, 3],
  ['4', 'M1', 'Management', 'Collection and verification of existing templates and documents, data, legal framework and statistical data', 'Request and collect from MoLFR all forms, certificates and templates currently in use, statistical and spatial data, data protection laws and policies, and laws relevant to livestock identification and traceability; record gaps.', 'Document and data register; gap list', 'Business Analyst / PMO (with MoLFR Focal Point)', 'Task 2 (SS)', 1, 4],
  ['5', 'M1', 'Documentation', 'BRS and UI/UX Package, Issue project forms and templates', 'Prepare the Business Requirement Specification for all eight modules, and clickable UI/UX prototypes and a screens package for the Ministry Web Portal, Verification Portal, Hybrid Mobile App and Tablet App.', 'Approved PIP; approved BRS; signed-off UI/UX Screens Package', 'PMO / Business Analyst / UI/UX Designer', 'Task 1 (FS), Task 3 (SS+1)', 2, 7],
  ['P3', 'M1', 'MoLFR Input', 'Provide site access and the joint implementation office at MoLFR HQ', 'Joint implementation office at MoLFR HQ with furniture, printing and meeting facilities, and access to HQ, the server room and field sites, ready for on-site work from M2 (GCC 10.3).', 'Office and site access available', 'MoLFR', 'Needed for Task 14 onward (on-site work)', 7, 8],
  ['R2', 'M1', 'MoLFR Review', 'Review and approval of the BRS and UI/UX screens package', rv(10, 5), CA, FP, 'Task 5 (FS)', 8, 10],
  ['6', 'M1', 'Documentation', 'Device Specification Document', 'Finalise specifications for RFID tags, ear tag readers, tablets, tag applicators, desktop PCs, servers and UPS units for procurement.', 'Device Specification Document', 'System Architect / Procurement Lead', 'Task 2 (FS), Task 3 (SS+1)', 2, 4],
  ['R3', 'M1', 'MoLFR Review', 'Review and approval of the Device Specification', rv(5, 3), CA, FP, 'Task 6 (FS)', 5, 6],
  ['7', 'M1', 'Software', 'Solution architecture & technical design', 'End-to-end solution architecture: modules, registers, integrations, data flows and Azure infrastructure (ISO/IEC/IEEE 42010, 15288, 12207; ISO 22005). Submit with BRS.', 'Solution architecture & technical design package', 'System Architect', 'Task 5 (SS)', 2, 7],
  ['8', 'M1', 'Documentation', 'Azure Cloud Architecture Documentation', 'Document the Azure landing zone, environments, networking, identity, storage, backup/DR and security architecture.', 'Azure Cloud Architecture document set', 'Cloud Architect', 'Task 7 (SS+2)', 4, 6],
  ['R4', 'M1', 'MoLFR Review', 'Review and approval of the Solution and Azure Architecture', rv(7, 4), CA, FP, 'Task 7 (FS), Task 8 (FS+1)', 8, 9],
  ['9', 'M1', 'Documentation', 'Tag Installation Plan', 'Prepare the full tag installation plan for the pilot and national rollout: sites and premises by region, estimated animals by species, tag allocation, tagging teams and equipment, schedule, community notice, read-test and reporting arrangements.', 'Tag Installation Plan', 'Field Operations / PMO', 'Task 3 (FS), Task 6 (SS+2)', 4, 7],
  ['10', 'M1', 'Documentation', 'Risk Register & Mitigation Plan', 'Identify project, technical, field and security risks with owners and mitigations.', 'Risk Register', 'PMO', 'Task 2 (FS+1)', 3, 6],
  ['R5', 'M1', 'MoLFR Review', 'Review and approval of the Risk Register, UAT Framework and QA Strategy', rv(5, 3), CA, FP, 'Task 10 (FS)', 7, 8],
  ['11', 'M1', 'Documentation', 'Material Approval Request (MAR)', 'Submit the proposed make and model of each hardware item (RFID tags, ear tag readers, tablets, tag applicators, desktop PCs, servers and UPS units) to MoLFR for approval before procurement, with datasheets, certificates (ISO 11784/11785, ICAR), warranty terms and samples where needed.', 'Approved MAR forms', 'Procurement Lead / System Architect', 'Task 6 (FS)', 5, 6],
  ['R6', 'M1', 'MoLFR Review', 'Review and approval of the Material Approval Request (MAR)', rv(5, 3), CA, FP, 'Task 11 (FS)', 7, 8],
  ['P4', 'M1', 'MoLFR Input', 'Confirm the items for confirmation and approve data protection and hosting arrangements', 'Confirm pilot regions, database baseline and number of OAT cases; approve where data is stored under the Somalia Data Protection Act 2023.', 'Written confirmation', 'MoLFR', 'Needed for Task 12', 5, 7],
  ['P5', 'M1', 'MoLFR Input', 'Name the field office nodes for rollout', 'Identify the field office nodes that will receive desktops and tablets.', 'List of field office nodes', 'MoLFR', 'Needed for Task 12', 5, 7],
  ['12', 'M1', 'Management', 'Record All Approvals, Preparation for Development', 'Record approval of PIP, BRS, UI/UX package and architecture documents, and prepare for development.', 'M1 approval record', 'PMO', 'Task 5 (FS+2), Task 8 (FS+3) (after MoLFR reviews R2, R4)', 10, 10, true],

  // ---------------- M2 ----------------
  ['P6', 'M2', 'MoLFR Input', 'Prepare the server room, building power and internet service', 'Secure server room for racks R01 and R02 with access control, air conditioning and fire protection; mains, generator and ATS supply; ISP line for the Azure link and HQ network connectivity (GCC 10.3, 10.5, 10.6).', 'Server room ready for installation', 'MoLFR', 'Needed for Task 25 (servers) and Task 45 (installation)', 6, 18],
  ['13', 'M2', 'Hardware Supply', 'Procurement packages & RFQs', 'Prepare procurement packages and issue RFQs for all field and HQ hardware based on the approved Device Specification.', 'Issued RFQs; supplier selection record', 'Procurement Lead', 'Task 11 (SS+1)', 6, 9],
  ['14', 'M2', 'Installation', 'Provision Azure environments', 'Provision Development, Testing, Staging and Production environments on Azure.', 'Operational Dev/Test/Staging/Production environments', 'Cloud Team / DevOps', 'Task 8 (SS+2)', 6, 9],
  ['15', 'M2', 'Software', 'CI/CD pipelines & infrastructure-as-code', 'Set up Azure Repos & Pipelines and infrastructure-as-code templates for repeatable deployments.', 'CI/CD pipelines; IaC repository', 'DevOps', 'Task 14 (SS+2)', 8, 10],
  ['16', 'M2', 'Installation', 'Monitoring, backup & disaster recovery', 'Configure platform monitoring, backup policies and DR replication; run a DR test.', 'Configured monitoring, backup & DR (tested)', 'Cloud Team / DevOps', 'Task 14 (SS+3)', 9, 12],
  ['17', 'M2', 'Software', 'ISO/IEC 27001 security baseline', 'Apply IAM with MFA, Key Vault-managed encryption in transit/at rest and cloud hardening.', 'Applied security baseline', 'Security Engineer', 'Task 14 (SS+3)', 9, 12],
  ['18', 'M2', 'Documentation', 'Environment & CI/CD Configuration Records', 'Record environment settings, pipeline configuration and release procedure.', 'Environment & CI/CD Configuration Records', 'DevOps', 'Task 15 (FS), Task 16 (FF)', 11, 12],
  ['19', 'M2', 'Documentation', 'Security Baseline & Hardening Document', 'Document the applied controls and hardening settings.', 'Security Baseline & Hardening Document', 'Security Engineer', 'Task 17 (FF)', 11, 12],
  ['R7', 'M2', 'MoLFR Review', 'Review and approval of the Security Baseline and Environment Records', rv(7, 4), CA, FP, 'Task 18 (FS), Task 19 (FS)', 13, 14],
  ['P7', 'M2', 'MoLFR Input', 'Support customs clearance, import duties and permits for hardware', 'Customs clearance and import duties for hardware; help with permits and any tax exemptions (GCC 14.1, 14.3, 22.6, 10.4).', 'Cleared consignments', 'MoLFR', 'Needed for Task 20', 9, 18],
  ['20', 'M2', 'Hardware Supply', 'Supply RFID animal tags (500,000)', 'Deliver RFID animal tags batch-wise to the Main Warehouse.', '500,000 RFID tags at Main Warehouse', 'Logistics Team', 'Task 13 (SS+3); import clearance', 9, 18],
  ['21', 'M2', 'Hardware Supply', 'Supply ear tag readers (300)', 'Deliver ear tag readers to Main Client HQ.', '300 ear tag readers', 'Logistics Team', 'Task 13 (SS+3)', 9, 18],
  ['22', 'M2', 'Hardware Supply', 'Supply tablets for field agents (100)', 'Deliver tablets for field data capture.', '100 tablets', 'Logistics Team', 'Task 13 (SS+3)', 9, 18],
  ['23', 'M2', 'Hardware Supply', 'Supply tag applicators (300)', 'Deliver tag applicators for field deployment sites.', '300 tag applicators', 'Logistics Team', 'Task 13 (SS+3)', 9, 18],
  ['24', 'M2', 'Hardware Supply', 'Supply desktop PCs (4) + UPS + monitors', 'Deliver desktop computers with UPS and monitors for MoLFR HQ / sub-offices.', '4 desktop PC sets', 'Logistics Team', 'Task 13 (SS+3)', 9, 18],
  ['25', 'M2', 'Hardware Supply', 'Supply servers (5) + UPS (5)', 'Deliver 5 servers and 5 UPS units for the MoLFR HQ data centre.', '5 servers; 5 UPS units', 'Logistics Team', 'Task 13 (SS+3)', 9, 18],
  ['26', 'M2', 'Testing', 'Hardware quality check & verification', 'Inspect delivered hardware against specification; record serials and quantities.', 'Inspection results', 'Procurement Lead / QA', 'Task 20 to Task 25 (FF)', 18, 18],
  ['27', 'M2', 'Documentation', 'Material Verification Report (MVR) & Inventory Records', 'Issue the MVR and inventory tracking records for all delivered hardware.', 'MVR; inventory register', 'Logistics Coordinator', 'Task 26 (SS)', 18, 18],
  ['R8', 'M2', 'MoLFR Review', 'Review and approval of the Material Verification Report (hardware)', rv(3, 2), CA, FP, 'Task 27 (FS)', 19, 19],

  // ---------------- M3 ----------------
  ['P8', 'M3', 'MoLFR Input', 'Provide master data for the registers', 'Regions, districts and settlements; premises lists; species and breeds; officers and signatories for permits and certificates (GCC 10.2).', 'Master data files', 'MoLFR', 'Needed for Task 28', 9, 12],
  ['P9', 'M3', 'MoLFR Input', 'Arrange the SMS/USSD short code with mobile network operators', 'Short code and operator agreement for the Farmers App SMS/USSD service (GCC 10.4, 10.5).', 'Short code allocated', 'MoLFR', 'Needed for Task 33', 13, 24],
  ['P10', 'M3', 'MoLFR Input', 'Secure agreements and technical contacts with integration partners', 'Agreement and technical contacts from customs, Federal Member State ministries, laboratories and export authorities (GCC 10.2, 10.4).', 'Signed agreements; contact list', 'MoLFR', 'Needed for Task 35', 9, 12],
  ['28', 'M3', 'Software', 'Core traceability engine & registers', 'Build premises registration, animal identification & registration, ownership and movement/permit registers.', 'SOMLITS Core Traceability Engine', 'Software Development Team', 'Task 7 (FS+1), Task 14 (SS+3)', 9, 20],
  ['29', 'M3', 'Software', 'Secure backend APIs', 'Build secure APIs for data flows between apps, devices and databases, including offline sync endpoints.', 'Secure backend APIs', 'Software Development Team', 'Task 28 (SS+1)', 10, 22],
  ['30', 'M3', 'Software', 'Veterinary, quarantine, export & slaughter modules', 'Build disease surveillance & vet records, trade & quarantine, and export & slaughter documentation modules with certificate generation.', 'Functional sector modules', 'Software Development Team', 'Task 28 (SS+5)', 14, 26],
  ['31', 'M3', 'Software', 'Ministry Web Portal', 'Role-based access, analytics dashboards, alerts and administration for MoLFR.', 'Ministry Web Portal', 'Software Development Team', 'Task 5 (FS+4), Task 29 (SS+2)', 12, 24],
  ['32', 'M3', 'Software', 'External Stakeholder Verification Portal', 'Web portal for importers, exporters and authorities to verify animals and certificates.', 'Verification Portal', 'Software Development Team', 'Task 5 (FS+6), Task 29 (SS+4)', 14, 24],
  ['33', 'M3', 'Software', 'Hybrid Mobile Application', 'Field data entry, registration and requests on all devices with offline capture and automatic sync.', 'Hybrid Mobile App', 'Mobile Development Team', 'Task 5 (FS+4), Task 29 (SS+2)', 12, 25],
  ['34', 'M3', 'Software', 'Tablet Application', 'Tablet app for field inspectors, veterinary clinics and slaughterhouses with RFID reader integration.', 'Tablet App', 'Mobile Development Team', 'Task 5 (FS+6), Task 6 (FS+9), Task 29 (SS+4)', 14, 25],
  ['35', 'M3', 'Software', 'Azure backend integration of all applications', 'Integrate all portals and apps with the Azure backend and verify end-to-end data flows.', 'Integrated backend with verified data flows', 'Software Development Team / DevOps', 'Task 30 (SS+8), Task 31 (SS+10), Task 32 (SS+8)', 22, 27],
  ['36', 'M3', 'Software', 'Secure SDLC, audit logging & SOC/SIEM design', 'Apply secure development gates, immutable audit logging and design the SOC/SIEM setup.', 'SDLC gate evidence; audit logging; SOC/SIEM design', 'Security Engineer', 'Task 17 (SS)', 9, 29],
  ['37', 'M3', 'Testing', 'Sprint-based QA & regression', 'Unit, integration, performance and security testing each sprint; defect management and regression (ISO/IEC 25010).', 'Test results; defect log; regression pack', 'QA Team', 'Task 7 (FS+2)', 10, 29],
  ['38', 'M3', 'Software', 'Device software configuration images', 'Prepare and validate standard configuration images for tablets and readers.', 'Validated device images', 'IoT Engineer / ICT Support', 'Task 6 (FS+17), Task 34 (SS+8)', 22, 27],
  ['39', 'M3', 'Documentation', 'Module Specifications, Coding Documentation & Sprint Logs', 'Maintain module specifications, code documentation and sprint records throughout development.', 'Module specs; coding docs; sprint logs', 'Software Development Team', 'Task 28 (SS)', 9, 29],
  ['40', 'M3', 'Documentation', 'API Specifications & Integration Report', 'Publish API specifications and report integration test results.', 'API specifications; integration report', 'Software Development Team', 'Task 29 (FS+1), Task 35 (SS+2)', 24, 28],
  ['41', 'M3', 'Documentation', 'UAT Framework, QA Test Plans, Logs & Reports', 'Define the test strategy (ISO/IEC/IEEE 29119), quality gates, UAT approach and acceptance criteria. Test plans, execution logs and monthly QA reports (bug closure ≥ 95%).', 'UAT framework; QA test plans, logs & reports', 'QA Lead', 'Task 37 (FF)', 12, 29],
  ['42', 'M3', 'Documentation', 'Device Configuration Guides', 'Step-by-step guides to configure tablets, readers and applicators.', 'Device Configuration Guides', 'IoT Engineer', 'Task 38 (SS+4)', 26, 28],
  ['R9', 'M3', 'MoLFR Review', 'Review and approval of the API Specifications, QA and Integration Reports and Device Configuration Guides', rv(7, 4), CA, FP, 'Task 40 (FS+1), Task 41 (FS), Task 42 (FS+1)', 30, 31],
  ['43', 'M3', 'Documentation', 'Draft User & Setup Manuals', 'Draft user and setup manuals for all four applications.', 'Draft user & setup manuals', 'Technical Writer', 'Task 28 (SS)', 9, 28],
  ['44', 'M3', 'Documentation', 'Draft Training Manuals (local languages)', 'Draft training manuals in local languages for field and Ministry users.', 'Draft training manuals', 'Training Team', 'Task 43 (SS+11)', 20, 29],
  ['R10', 'M3', 'MoLFR Review', 'Review and approval of the Draft User, Setup and Training Manuals', rv(7, 4), CA, FP, 'Task 43 (FS+1), Task 44 (FS)', 30, 31],
  ['P11', 'M3', 'MoLFR Input', 'Provide qualified technical staff for installation, commissioning and acceptance', 'MoLFR operating and technical staff available to support installation, commissioning and acceptance (GCC 10.7).', 'Named MoLFR staff', 'MoLFR', 'Needed for Task 45', 27, 29],
  ['45', 'M3', 'Installation', 'Install & commission servers (5) + UPS (5)', 'Install and commission the 5 servers and 5 UPS units at the MoLFR HQ data centre.', 'Commissioned servers and UPS units', 'IT Infrastructure Team', 'Task 27 (FS+8)', 27, 29],
  ['46', 'M3', 'Installation', 'Install desktop PCs (4) + UPS + monitors', 'Install PCs at MoLFR HQ and sub-offices.', 'Installed workstations', 'IT Team', 'Task 27 (FS+9)', 28, 29],
  ['47', 'M3', 'Installation', 'Configure & issue tablets (100)', 'Load device images and app builds; issue tablets to field agents.', 'Configured tablets', 'ICT Support Team', 'Task 27 (FS+9), Task 38 (FS)', 28, 29],
  ['48', 'M3', 'Installation', 'Configure ear tag readers (300)', 'Configure and pair readers with tablets.', 'Configured readers', 'Field Operations', 'Task 27 (FS+9), Task 38 (FS)', 28, 29],
  ['49', 'M3', 'Installation', 'Distribute tag applicators (300)', 'Distribute applicators to field deployment sites (district-wise).', 'Distributed applicators', 'Equipment Support Unit', 'Task 27 (FS+9)', 28, 29],

  // ---------------- M4 ----------------
  ['50', 'M4', 'Installation', 'Deploy to staging & production', 'Release to staging, then production, via CI/CD; verify with simulated tag-ID data.', 'Production deployment', 'DevOps', 'Task 35 (FS+1), Task 37 (SS+19), Task 45 (SS+2)', 29, 30],
  ['51', 'M4', 'Testing', 'System integration & performance validation', 'End-to-end, load and failover testing in the target environment.', 'SIT & performance results', 'QA Team', 'Task 50 (SS)', 29, 30],
  ['52', 'M4', 'Documentation', 'Deployment & Release Notes', 'Release contents, versions, known issues and rollback steps.', 'Deployment & Release Notes', 'DevOps', 'Task 50 (FF)', 30, 30],
  ['53', 'M4', 'Testing', 'UAT execution with MoLFR', 'Execute Purchaser-defined UAT cases with MoLFR representatives; fix and re-test failures.', 'UAT execution results', 'QA Lead / MoLFR', 'Task 41 (FS), Task 50 (SS+1)', 30, 31],
  ['54', 'M4', 'Documentation', 'UAT Completion Report', 'Formal record of UAT results, defects and resolutions.', 'UAT Completion Report', 'QA Lead', 'Task 53 (FF)', 31, 31],
  ['R11', 'M4', 'MoLFR Review', 'Review and approval of the UAT Completion Report and Release Notes; Installation certificate UAT sign-off', rv(5, 3), CA, FP, 'Task 52 (FS+1), Task 54 (FS)', 32, 33],
  ['55', 'M4', 'Management', 'UAT sign-off with Ministry', 'Obtain formal UAT sign-off from the Ministry.', 'Signed UAT certificate', 'PMO / MoLFR', 'Task 54 (FS+1) (after MoLFR review R11)', 33, 33, true],

  // ---------------- M5 ----------------
  ['56', 'M5', 'Training', 'Pilot user training', 'Train pilot field agents, vets and MoLFR staff on the apps and devices (local languages).', 'Trained pilot users; attendance logs', 'Training & Capacity Building Team', 'Task 44 (FS+1), Task 47 (FS+1)', 31, 31],
  ['57', 'M5', 'Training', 'Training & knowledge transfer (MoLFR, vets, exporters)', 'Train-the-trainer sessions and role-based training for national rollout.', 'Trained MoLFR staff, vets and exporters', 'Training & Capacity Building Team', 'Task 56 (FS+1)', 33, 35],
  ['58', 'M5', 'Documentation', 'Final Training Materials & Attendance Logs', 'Finalise training materials and record attendance.', 'Final training materials; attendance logs', 'Training Team', 'Task 57 (FF)', 35, 35],
  ['R12', 'M5', 'MoLFR Review', 'Review and approval of the Final Training Materials and Attendance Logs', rv(5, 3), CA, FP, 'Task 58 (FS)', 36, 37],

  // ---------------- M6 ----------------
  ['59', 'M6', 'Testing', 'VAPT & phishing-resilience testing', 'Formal penetration test of apps, APIs and cloud; remediate and re-test all Critical/High findings before operational acceptance.', 'VAPT executed; findings remediated', 'Security Engineer', 'Task 50 (SS+1)', 30, 32],
  ['60', 'M6', 'Documentation', 'VAPT & Remediation Report', 'Report of findings, fixes and re-test evidence.', 'VAPT & Remediation Report', 'Security Engineer', 'Task 59 (SS+2)', 32, 33],
  ['R13', 'M6', 'MoLFR Review', 'Review and approval of the VAPT and Remediation Report', rv(5, 3), CA, FP, 'Task 60 (FS)', 34, 35],
  ['61', 'M6', 'Installation', 'Pilot deployment to field sites (District A & B)', 'Deploy system, devices and users at pilot field deployment sites.', 'Pilot sites operational', 'Field Operations / Project Deploy Team', 'Task 54 (SS), Task 56 (SS)', 31, 32],
  ['62', 'M6', 'Installation', 'Pilot animal tagging & registration (10,000+ animals)', 'Tag and register animals in pilot sites using applicators, readers and tablets.', 'Tagged and registered pilot animals', 'Field Operations', 'Task 61 (SS)', 31, 34],
  ['63', 'M6', 'Testing', 'RFID read-accuracy measurement', '100% within three attempts (Inception Report acceptance criteria).', 'Read-accuracy evidence (≥99.5% first scan; 100% within three attempts)', 'Quality Assurance Team', 'Task 62 (FF)', 32, 34],
  ['64', 'M6', 'Documentation', 'Pilot Region Reports', 'Tagging records, usage logs and read-accuracy results.', 'Pilot Region Reports', 'Field Operations / QA', 'Task 63 (FF)', 34, 34],
  ['65', 'M6', 'Software', 'Pilot feedback & system refinements', 'Collect user feedback, triage and apply refinements before national rollout.', 'Refined system release', 'Software Development Team', 'Task 61 (SS+1)', 32, 35],
  ['66', 'M6', 'Documentation', 'Operational Acceptance Feedback Summary', 'Summary of pilot feedback and actions taken.', 'Feedback summary document', 'PMO', 'Task 65 (FF)', 34, 35],
  ['67', 'M6', 'Documentation', 'Updated System Specifications (post-feedback)', 'Update specifications to reflect pilot changes.', 'Updated system specifications', 'System Architect', 'Task 65 (FF)', 35, 35],
  ['R14', 'M6', 'MoLFR Review', 'Review and approval of the Pilot Reports, Feedback Summary and Updated Specifications; Operational Acceptance', rv(7, 4), CA, FP, 'Task 64 (FS+1), Task 66 (FS), Task 67 (FS)', 36, 37],
  ['68', 'M6', 'Management', 'Operational Acceptance (Pilot) sign-off', 'Ministry acceptance of the pilot against agreed criteria.', 'Operational Acceptance certificate', 'PMO / MoLFR', 'Task 60 (FS+3), Task 64 (FS+2), Task 66 (FS+1)', 37, 37, true],
  ['R15', 'M6', 'MoLFR Review', 'Issue of the Operational Acceptance Certificate', "MoLFR issues the certificate, or lists any defects, within 14 calendar days of AHDAA's notice (GCC 27.3.3).", 'Operational Acceptance Certificate', 'MoLFR Project Manager', 'Task 68 (FS)', 38, 39],

  // ---------------- M7 ----------------
  ['69', 'M7', 'Installation', 'National system deployment (all regions)', 'Roll out the system, users and devices across all regions.', 'System operational nationwide', 'Project Deploy Team', 'Task 64 (FS+1), Task 66 (FS)', 36, 38],
  ['70', 'M7', 'Installation', 'Nationwide RFID ear tag installation (500,000)', 'Batch-wise tag application across regions per the regional rollout plan. Start preparation earlier than planned.', 'Tagged animals; tag installation records', 'Logistics Team / Field Operations', 'Task 20 (FS+16), Task 64 (FS)', 35, 44],
  ['71', 'M7', 'Training', 'Mass training & device rollout', 'Training for national users alongside device issue in each region.', 'Trained national users', 'Training & Capacity Building Team', 'Task 57 (FS), Task 69 (SS)', 36, 38],
  ['72', 'M7', 'Software', 'Activate SOC / SIEM', 'SIEM configuration, central log collection, correlation, alerting, dashboards and incident-response workflows.', 'Operational SOC', 'Security Engineer', 'Task 36 (FS+6), Task 69 (SS)', 36, 38],
  ['73', 'M7', 'Support', 'Activate helpdesk & launch national dashboard', 'Open the live helpdesk and publish the national dashboard.', 'Live helpdesk; national dashboard', 'Support Team', 'Task 69 (FF)', 37, 38],
  ['74', 'M7', 'Documentation', 'Helpdesk SOPs & Dashboard Operation Guides', 'Procedures for ticket handling, escalation and dashboard use.', 'Helpdesk SOPs; dashboard guides', 'Support Team', 'Task 73 (SS)', 37, 38],
  ['75', 'M7', 'Documentation', 'Nationwide Deployment Report & Training Attendance Logs', 'Rollout status per region and training attendance.', 'Nationwide Deployment Report', 'PMO', 'Task 69 (SS+2), Task 71 (SS+2)', 38, 39],
  ['76', 'M7', 'Documentation', 'Adoption Metrics Report', 'Baseline adoption metrics: active users, registrations, movements, certificates.', 'Adoption Metrics Report', 'PMO', 'Task 69 (FS)', 39, 39],
  ['R16', 'M7', 'MoLFR Review', 'Review and approval of the Nationwide Deployment and Adoption Reports and Helpdesk SOPs', rv(7, 4), CA, FP, 'Task 74 (FS+1), Task 75 (FS), Task 76 (FS)', 40, 41],
  ['77', 'M7', 'Management', 'Go-live acceptance', 'Ministry acceptance of national go-live.', 'Go-live acceptance certificate', 'PMO / MoLFR', 'Task 75 (FS+1), Task 76 (FS+1) (after MoLFR review R16)', 41, 41, true],

  // ---------------- M8 ----------------
  ['78', 'M8', 'Documentation', 'Final User & Admin Manuals', 'Final manuals for all applications and administration.', 'Final user & admin manuals', 'Technical Writer', 'Task 69 (SS)', 36, 38],
  ['79', 'M8', 'Documentation', 'Standard Operating Procedures (SOPs)', 'Operational SOPs for registration, movement, certification and support.', 'SOPs', 'PMO / Business Analyst', 'Task 69 (SS)', 36, 38],
  ['80', 'M8', 'Documentation', 'Incident-Response Runbooks', 'Runbooks for security and operational incidents, handed over to the Ministry.', 'Incident-response runbooks', 'Security Engineer', 'Task 72 (SS)', 36, 38],
  ['81', 'M8', 'Documentation', 'Training Videos', 'Recorded training videos for each user role.', 'Training videos', 'Training Team', 'Task 58 (FS)', 36, 38],
  ['82', 'M8', 'Documentation', 'Source Code Archive & Asset Register', 'Versioned source code, build scripts and hardware/software asset register.', 'Source code archive; asset register', 'Software Development Team', 'Task 69 (SS)', 36, 38],
  ['R17', 'M8', 'MoLFR Review', 'Review and approval of the Final Manuals, SOPs, Runbooks, Training Videos and Source Code Archive', rv(10, 5), CA, FP, 'Task 78 (FS), Task 79 (FS), Task 80 (FS), Task 81 (FS), Task 82 (FS)', 39, 41],
  ['83', 'M8', 'Testing', 'Final acceptance tests', 'Final acceptance testing of the complete system with the Ministry.', 'Final acceptance test results', 'QA Lead / MoLFR', 'Task 75 (FS), Task 76 (FS)', 40, 41],
  ['84', 'M8', 'Documentation', 'Final Acceptance Certificate', 'Update the final manuals (Task 78), SOPs (Task 79) and source code archive (Task 82) with all changes from national go-live and the final acceptance tests (Task 83), then compile the handover pack.', 'Final Acceptance Certificate; handover pack with updated final manuals, SOPs and source code archive', 'PMO', 'Task 78 (FS+3), Task 79 (FS+3), Task 80 (FS+3)', 42, 42, true],
  ['R18', 'M8', 'MoLFR Review', 'Review and approval of the Final Acceptance Certificate', rv(5, 3), CA, FP, 'Task 84 (FS)', 43, 44],
  ['85', 'M8', 'Management', 'Formal system handover', 'Formal handover meeting and transfer of system ownership to MoLFR.', 'Handover record', 'PMO / MoLFR', 'Task 84 (FS+1) (after MoLFR review R18)', 44, 44, true],

  // ---------------- M9 ----------------
  ['86', 'M9', 'Support', 'Technical support & maintenance per SLA', 'Incident logging, troubleshooting, bug fixes, corrective/preventive maintenance, patches, escalation and root-cause analysis.', 'Resolved tickets; patches & updates', 'Support & Maintenance Team', 'Task 85 (FS)', 45, 305],
  ['87', 'M9', 'Support', 'SOC monitoring', 'SIEM event monitoring, alert triage, threat detection, vulnerability monitoring and incident response.', 'Continuous SOC monitoring', 'Security Operations', 'Task 72 (FS+6), Task 85 (FS)', 45, 305],
  ['88', 'M9', 'Support', 'SLA monitoring & knowledge base maintenance', 'Track SLA performance and maintain the knowledge base.', 'SLA monitoring records; maintained knowledge base', 'Support Manager', 'Task 85 (FS)', 45, 305],
  ['89', 'M9', 'Documentation', 'Monthly Operational Reporting Pack', 'Monthly incident, service desk, SLA, availability, ticket trend, problem, change, security and user-support reports with executive dashboard.', 'Monthly reporting pack', 'Support Manager', 'Task 86 (SS)', 45, 305],
  ['R19', 'M9', 'MoLFR Review', 'Review and approval of the Monthly Operational Reporting Pack (each month)', 'MoLFR reviews each monthly pack within 5 working days; re-review within 3 working days.', CA, FP, 'Task 89 (SS)', 45, 305],
  ['90', 'M9', 'Management', 'Support and project close-out', 'End of the five-year support period: final service review with MoLFR, open-ticket handover, knowledge and asset transfer, and formal contract close-out.', 'Close-out report; contract completion certificate', 'PMO / MoLFR', 'Task 86 to Task 89 (FF)', 305, 305, true],
];

// [code, category, risk, severity, probability, mitigation, trigger, contingency, owner, linkedTasks, milestone]
const RISKS = [
  ['R01', 'Infrastructure', 'Internet outages', 4, 3, 'Offline-first mobile apps', 'Sync backlog growing at field sites', 'Queue records on device; sync via HQ Wi-Fi or satellite link', 'System Architect', '33, 34, 69', 'M3'],
  ['R02', 'Security', 'RFID tag tampering', 5, 2, 'Tamper-evident tags', 'Tag ID mismatches or duplicate IDs at markets/ports', 'Quarantine affected animals; re-tag and flag records for audit', 'Field Operations', '20, 62, 70', 'M2'],
  ['R03', 'Security', 'Data breaches', 5, 3, 'Encryption + train IT team to do quarterly penetration testing', 'SIEM alerts; unusual access patterns', 'Invoke incident-response runbook (T80); notify MoLFR; rotate keys', 'Security Engineer', '17, 36, 59, 87', 'M2'],
  ['R04', 'Technical', 'Scaling challenges', 4, 3, 'Microservices and cloud-native architecture', 'Response times degrade as registrations grow', 'Scale Azure resources; prioritise critical services', 'System Architect', '7, 51', 'M1'],
  ['R05', 'Hardware', 'Device hardware failure', 3, 3, 'Regular maintenance schedules + rapid replacement process', 'Rising device fault tickets', 'Issue spare devices from HQ buffer stock', 'ICT Support Team', '47, 48, 86', 'M3'],
  ['R06', 'Hardware', 'Battery life limitations', 3, 3, 'Hot-swappable batteries + optimized power management', 'Field reports of devices dying mid-shift', 'Power banks and vehicle chargers for field teams', 'IoT Engineer', '6, 38', 'M1'],
  ['R07', 'Technical', 'Software bugs', 4, 4, 'Continuous integration & automated testing', 'Defect closure rate below 95%', 'Hotfix release via CI/CD; rollback to last stable build', 'QA Lead', '15, 37, 41', 'M3'],
  ['R08', 'Adoption', 'User errors', 3, 4, 'Intuitive UI design + user training & support', 'High data-correction rate; repeated helpdesk tickets', 'Targeted refresher training; in-app validation rules', 'Training Team', '5, 56, 57, 71', 'M5'],
  ['R09', 'Data', 'Data synchronization lag', 4, 3, 'Real-time sync algorithms + conflict resolution mechanisms', 'Records visible late at HQ / ports', 'Manual sync trigger; supervisor reconciliation report', 'Software Development Team', '29, 35', 'M3'],
  ['R10', 'Compliance', 'Regulatory compliance', 5, 2, 'Regular audits + compliance team oversight', 'Audit findings; new MoLFR or importer rules', 'Change request through change control; update SOPs', 'PMO', '5, 83', 'M1'],
  ['R11', 'Supply chain', 'Supply chain delays', 3, 3, 'Multiple supplier agreements + inventory buffer', 'Supplier misses confirmed ship date', 'Activate alternate supplier; re-sequence rollout regions', 'Procurement Lead', '13, 20–25', 'M2'],
  ['R12', 'Hardware', 'Environmental factors', 4, 2, 'Ruggedized devices (IP65) + weather-resistant accessories', 'Device failures from heat, dust or rain', 'Replace from buffer; protective cases for all field kit', 'Procurement Lead', '6, 21, 22', 'M1'],
  ['R13', 'Security', 'Network security threats', 5, 3, 'Firewalls + intrusion detection systems + MFA', 'IDS / SOC alerts', 'Isolate affected systems; follow incident-response runbook', 'Security Engineer', '17, 72, 87', 'M2'],
  ['R14', 'Data', 'Data loss', 5, 2, 'Automated backups + disaster recovery plan', 'Failed backup jobs', 'Restore from backup / DR site; verify data integrity', 'Cloud Team / DevOps', '16', 'M2'],
  ['R15', 'Security', 'Unauthorized access', 5, 3, 'Role-based access control + biometric authentication', 'Failed-login spikes; access outside role', 'Disable accounts; force credential reset; review audit logs', 'Security Engineer', '17, 31', 'M2'],
  ['R16', 'Technical', 'Software updates', 3, 3, 'Staged rollouts + rollback mechanisms', 'Post-release error spike', 'Roll back release; patch and redeploy', 'DevOps', '15, 50, 86', 'M4'],
  ['R17', 'Supply chain', 'Vendor dependency', 3, 3, 'Multi-vendor sourcing + knowledge transfer; other tablets with RFID scanner and tags are supported', 'Single vendor delays or end-of-life notice', 'Switch to qualified alternate device / tag model', 'Procurement Lead', '6, 13', 'M1'],
  ['R18', 'Schedule', 'Project timeline slips', 4, 3, 'Agile management + buffer time + frequent progress reviews', 'Milestone dates slipping; tasks marked Late', 'Re-baseline with MoLFR; add resources to critical path', 'PMO', '1, 12, 55, 77', 'All'],
  ['R19', 'Operational', 'Tag loss or damage', 4, 3, 'Use durable, tamper-resistant tags; train handlers on proper tag application', 'Rising re-tag requests', 'Re-tag from buffer stock; link new tag to existing record', 'Field Operations', '20, 62, 70', 'M7'],
  ['R20', 'Hardware', 'Battery failure during field use', 4, 2, 'Use hot-swappable batteries; monitor battery health via app', 'Battery health alerts in app', 'Spare batteries per field team', 'ICT Support Team', '38, 47', 'M3'],
  ['R21', 'Data', 'Data synchronization errors', 4, 3, 'Implement offline data storage with automated sync once connected', 'Sync conflicts or failed records in logs', 'Conflict-resolution queue reviewed by supervisor', 'Software Development Team', '29, 35', 'M3'],
  ['R22', 'Security', 'Theft or loss of handheld devices', 5, 2, 'Enforce device tracking; enable remote wipe; use device lock policies', 'Device not checked in / location lost', 'Remote wipe; revoke credentials; issue replacement', 'ICT Support Team', '47, 48', 'M3'],
  ['R23', 'Compliance', 'Regulatory compliance failure', 5, 2, 'Engage compliance experts; document all processes; regular internal audits', 'Audit non-conformities', 'Corrective action plan agreed with MoLFR', 'PMO', '79, 83', 'M8'],
  ['R24', 'Infrastructure', 'Network coverage blackspots', 4, 3, 'Deploy local edge servers; use mesh networks or signal repeaters', 'Site survey identifies no-coverage zones', 'Offline capture with scheduled sync at nearest coverage point', 'System Architect', '4, 61, 69', 'M1'],
  ['R25', 'Security', 'Data privacy concerns', 5, 3, 'Apply strong encryption; comply with GDPR/local laws; conduct privacy impact assessments', 'Stakeholder complaints; privacy assessment findings', 'Restrict data sharing; remediate and re-assess', 'Security Engineer', '17, 19', 'M2'],
  ['R26', 'Adoption', 'Resistance to technology adoption', 3, 4, 'Run stakeholder engagement programs; show value with pilot projects', 'Low adoption metrics (T76)', 'Community champions; extra field support in low-uptake regions', 'Training Team', '3, 61, 71, 76', 'M6'],
  ['R27', 'Hardware', 'RFID reader hardware malfunction', 4, 3, 'Keep backup devices; schedule preventive maintenance', 'Reader fault tickets', 'Swap from backup pool; vendor warranty replacement', 'ICT Support Team', '21, 48', 'M3'],
  ['R28', 'Data', 'Data corruption during transfer', 4, 2, 'Use checksums, data validation, and retransmission protocols', 'Checksum failures in logs', 'Retransmit; restore from last good record', 'Software Development Team', '29, 40', 'M3'],
  ['R29', 'Supply chain', 'Import clearance delays for RFID tags and devices', 5, 3, 'Early RFQs (T13); pre-clear with customs; staggered shipments', 'Shipments held at customs', 'Expedite with MoLFR support letter; re-sequence installation', 'Logistics Team', '13, 20–25', 'M2'],
  ['R30', 'Operational', 'Insecurity limits field access for pilot and national tagging', 4, 4, 'Sequence regions by security clearance; work through local field teams', 'Security advisories for target regions', 'Defer affected regions; reallocate teams to accessible regions', 'Field Operations', '61, 62, 69, 70', 'M6'],
  ['R31', 'Schedule', 'Late MoLFR approvals stall milestone gates', 5, 3, 'Agreed review timelines; draft reviews before formal submission', 'Submissions pending review beyond agreed time', 'Escalate via Steering Committee', 'PMO', '12, 55, 68, 77, 85', 'All'],
  ['R32', 'Infrastructure', 'Server room power / cooling not ready for installation', 3, 3, 'Site Survey (T4) confirms readiness; UPS supplied with servers', 'Site readiness gaps at survey', 'Temporary hosting on Azure until room is ready', 'ICT Support Team', '4, 25, 45', 'M3'],
  ['R33', 'Scope', 'Scope creep from additional stakeholder requests', 3, 4, 'Baseline BRS at M1; formal change control', 'Change requests outside BRS', 'Defer to change control; agree cost/time impact', 'PMO', '5, 65', 'M1'],
  ['R34', 'Resourcing', 'Key staff turnover over the 5-year support period', 3, 3, 'Knowledge base (T88); documented runbooks (T80); handover procedures', 'Resignations in key roles', 'Backfill from bench; knowledge-transfer sessions', 'Support Manager', '80, 86–89', 'M9'],
  ['R35', 'Operational', 'Drought or seasonal migration shifts herd locations', 3, 3, 'Align tagging with water points and markets; flexible wave scheduling', 'Seasonal forecasts; herd movement reports', 'Re-plan tagging waves around migration routes', 'Field Operations', '2, 62, 70', 'M7'],
  ['R36', 'Financial', 'Funding or payment delays', 4, 2, 'Milestone-based billing tied to clear acceptance criteria (PY-2, PY-3)', 'Invoices outstanding past due date', 'Escalate to client; adjust resourcing pace', 'PMO', '55, 84', 'M4'],
  ['R37', 'Adoption', 'Low herder and trader adoption after go-live', 4, 3, 'Mass training (T71); adoption metrics (T76); local-language manuals', 'Adoption metrics below plan', 'Awareness campaigns; incentives via market access', 'Training Team', '44, 71, 76', 'M7'],
];

function emptyTask() {
  return {
    status: 'Not Started', actualStart: '', actualCompletion: '', submittedBy: '', approval: 'Pending',
    approvedBy: '', approvalDate: '', comments: '', delayDays: 0, delayBy: '', delayReason: '',
    gate: false, delays: [], submissions: [], attachments: [], feedback: [], reviews: [], waits: [], log: [],
  };
}

function buildSeed() {
  const tasks = [];
  let order = 0;
  const push = (t) => tasks.push({ ...emptyTask(), ...t, id: crypto.randomUUID(), order: order++ });

  push({
    no: 'K1', ms: 'PRE', type: 'Management', task: 'Project kickoff and inception meeting',
    description: 'Kickoff and inception meeting held with MoLFR before the Contract Effective Date to agree governance, scope and the reporting approach.',
    deliverable: 'Meeting minutes; attendance list', responsible: 'AHDAA Project Manager', dependency: '',
    plannedStart: '2026-10-12', plannedEnd: '2026-10-12', status: 'Completed', actualCompletion: '2026-10-12',
  });
  push({
    no: 'K2', ms: 'PRE', type: 'Documentation', task: 'Prepare Project Inception Meeting Report and Project Implementation Plan',
    description: 'Prepare the Inception Report and draft PIP following the inception meeting, ready for submission at the start of the contract.',
    deliverable: 'Inception Report; draft PIP', responsible: 'AHDAA Project Manager', dependency: 'K1',
    plannedStart: '2026-10-13', plannedEnd: '2026-10-25', status: 'Completed', actualCompletion: '2026-10-25',
  });

  for (const [no, ms, type, task, description, deliverable, responsible, dependency, sw, ew, gate] of TASKS) {
    const molfr = type.startsWith('MoLFR');
    push({
      no, ms, type, task, description, deliverable, responsible, dependency,
      plannedStart: weekStart(sw), plannedEnd: weekEnd(ew), gate: !!gate,
      approval: molfr ? '' : 'Pending',
    });
  }

  const risks = RISKS.map(([code, category, risk, severity, probability, mitigation, trigger, contingency, owner, linkedTasks, milestone], i) => ({
    id: crypto.randomUUID(), order: i, code, category, risk, severity, probability, mitigation, trigger,
    contingency, owner, linkedTasks, milestone, status: 'Open', lastReviewed: '', source: 'SOMLITS work plan',
  }));

  return {
    settings: {
      project: 'Somali Livestock Identification and Traceability System (SOMLITS)',
      contractNo: 'SO-MOF-492016-NC-RFP',
      contractDate: CONTRACT_DATE,
    },
    milestones: MILESTONES,
    tasks,
    risks,
    users: [],
  };
}

module.exports = { buildSeed, emptyTask };

// ---------------------------------------------------------------- business rules (draft, from the Inception Report)
const RULE_MODULES = [
  'Livestock Identification & Registration', 'Premises / Location Registration', 'Movement Tracking & Permits',
  'Disease Surveillance & Veterinary Records', 'Trade & Quarantine Management', 'Export & Slaughter Documentation',
  'External Verification Portal', 'Administrative, Security & Analytics', 'Help Desk',
  ...require('./rfp_reqs').RFP_MODULES, ...require('./br_register').BR_REGISTER_MODULES, 'General',
];
// [module, rule name, rule statement, rationale / source, priority]
const RULES = [
  ['Livestock Identification & Registration', 'Unique electronic ID per animal', 'Every animal must carry one ISO 11784/11785-compliant RFID ear tag whose number is unique in SOMLITS and includes Somalia\'s country code. A tag number can never be reused.', 'Inception Report §1, §13 (ISO 11784 / 11785)', 'Must'],
  ['Livestock Identification & Registration', 'Only certified tags and readers', 'Only ICAR-tested and certified ear tags and readers may be registered and used in the system.', 'Inception Report §13 (ICAR certification)', 'Must'],
  ['Livestock Identification & Registration', 'Animal linked to an owner', 'An animal cannot be registered without a registered owner and a registered premises (PNR).', 'Inception Report §5 objective f (ownership coverage)', 'Must'],
  ['Livestock Identification & Registration', 'Lost or damaged tag replacement', 'A replacement tag must be linked to the existing animal record so the animal\'s full history is kept; the old tag is marked lost/damaged.', 'Risk Register R19', 'Must'],
  ['Livestock Identification & Registration', 'Stolen tag alert', 'Any scan of a tag reported stolen must raise an immediate alert to the scanning officer and MoLFR.', 'Inception Report §5 objective f', 'Must'],
  ['Premises / Location Registration', 'Premises Number Register (PNR)', 'Each livestock location (farm, market, checkpoint, quarantine station, port) receives one unique PNR with GPS coordinates (WGS 84).', 'Inception Report §3, §13', 'Must'],
  ['Movement Tracking & Permits', 'Permit required for every movement', 'Animals may only be moved with a valid movement permit issued in SOMLITS.', 'Inception Report §5 objective d', 'Must'],
  ['Movement Tracking & Permits', 'Health check before permit approval', 'A movement permit can only be approved if the animal\'s health status is valid and the origin is not under quarantine or zone restriction.', 'Inception Report §5 objective b', 'Must'],
  ['Movement Tracking & Permits', 'Alert on unpermitted movement', 'A tag scanned at a control point without a valid permit raises an alert and is recorded as a non-compliant movement.', 'Inception Report §5 objective d (PCR)', 'Must'],
  ['Trade & Quarantine Management', 'Verify ownership at sale', 'Ownership must be verified against the register before a sale is recorded; ownership transfer requires both seller and buyer to be registered.', 'Inception Report §5 objective f', 'Must'],
  ['Disease Surveillance & Veterinary Records', 'Vaccinations linked to the tag', 'Every vaccination, test and treatment must be recorded against the animal\'s tag with date, officer and GPS location.', 'Inception Report §5 objectives a, e', 'Must'],
  ['Disease Surveillance & Veterinary Records', 'Quarantine enforcement', 'Animals in a declared quarantine zone cannot receive movement permits or export certificates until the zone is lifted.', 'Inception Report §5 objective e', 'Must'],
  ['Export & Slaughter Documentation', 'Export certificate linked to animals', 'Every export certificate must list the tagged animals it covers, show country of origin and carry a signed QR code.', 'Inception Report §5 objectives a, c', 'Must'],
  ['Export & Slaughter Documentation', 'Slaughter / export closes the record', 'When an animal is slaughtered or exported the record is closed against its tag and the tag cannot be scanned as live again.', 'Inception Report §5 objective a', 'Must'],
  ['External Verification Portal', 'Importer verification by QR', 'Importing authorities can verify an animal\'s identity, origin, health status and certificate validity by QR code without logging in; personal owner data is not shown.', 'Inception Report §4; Somalia Data Protection Act 2023', 'Must'],
  ['Administrative, Security & Analytics', 'Role-based access', 'Users can only see and change the functions and data allowed by their role (RBAC); administrators must use multi-factor authentication.', 'Inception Report §15 acceptance criterion 5', 'Must'],
  ['Administrative, Security & Analytics', 'Tamper-proof audit trail', 'Every create, change and cancellation of a record, permit or certificate is logged with user and time, and logs cannot be altered.', 'Inception Report §5 objective b, §15 criterion 8', 'Must'],
  ['Administrative, Security & Analytics', 'Offline capture and sync', 'Field devices must capture data offline and sync it to the central database without loss or duplication once connected.', 'Inception Report §15 criterion 3', 'Must'],
  ['Administrative, Security & Analytics', 'Data residency', 'Where government data is stored must follow MoLFR\'s decision under the Somalia Data Protection Act 2023.', 'Inception Report §10 item 3, §18 decision 3', 'Must'],
  ['General', 'National ID for owner registration', 'Owners are registered with their national ID number and supporting documents; live National ID verification is added once integration is approved.', 'Inception Report §14', 'Should'],
  ['Help Desk', 'Ticket closed only after user confirms', 'Every support request becomes a ticket, is answered through the user\'s original channel and is closed only when the user confirms the issue is resolved.', 'Inception Report §16', 'Should'],
];
function buildRules() {
  return RULES.map(([module, name, statement, source, priority], i) => ({
    id: crypto.randomUUID(), order: i, code: 'BR-' + String(i + 1).padStart(3, '0'), module, name, statement,
    source, priority, owner: 'MoLFR / Business Analyst', linked: '', status: 'Draft', version: '1.0',
    approvedBy: '', approvalDate: '', comments: '', updated: '',
  }));
}

module.exports.buildRules = buildRules;
module.exports.RULE_MODULES = RULE_MODULES;

// ---------------------------------------------------------------- requirements traceability matrix (draft, from the Inception Report)
// [module, requirement, source, priority, business rules, work plan tasks, acceptance criterion]
const REQS = [
  ['Premises / Location Registration', 'Register every livestock premises (farm, market, checkpoint, quarantine station, port) with a unique PNR and GPS coordinates.', 'Inception Report §3, §4, §13', 'Must', 'BR-006', '28, 31', ''],
  ['Livestock Identification & Registration', 'Register each animal against one ISO 11784/11785 RFID ear tag, with species, breed, owner and premises.', 'Inception Report §1, §5(a), §13', 'Must', 'BR-001, BR-002, BR-003', '28, 34', 'Acceptance #4: registration ≤ 100 seconds'],
  ['Livestock Identification & Registration', 'Read RFID tags reliably in the field with ICAR-certified readers.', 'Inception Report §13, §15', 'Must', 'BR-002', '48, 63', 'Acceptance #2: 100% of tags read within three attempts'],
  ['Livestock Identification & Registration', 'Register livestock owners with national ID number and documents, and link every animal to its owner.', 'Inception Report §5(f), §14', 'Must', 'BR-003, BR-020', '28, 33', ''],
  ['Livestock Identification & Registration', 'Replace lost/damaged tags while keeping history, and alert when a stolen tag is scanned.', 'Inception Report §5(f); Risk R19', 'Must', 'BR-004, BR-005', '28, 34', ''],
  ['Movement Tracking & Permits', 'Request, check and approve movement permits digitally, with a health-status check before approval.', 'Inception Report §5(b), §5(d)', 'Must', 'BR-007, BR-008', '28, 30, 33', ''],
  ['Movement Tracking & Permits', 'Scan tags at control points and alert on any movement without a valid permit.', 'Inception Report §5(d)', 'Must', 'BR-009', '28, 34', ''],
  ['Trade & Quarantine Management', 'Verify ownership and record ownership transfer at every sale.', 'Inception Report §5(f)', 'Must', 'BR-010', '30', ''],
  ['Trade & Quarantine Management', 'Declare quarantine zones and block permits and certificates for animals inside them.', 'Inception Report §5(e)', 'Must', 'BR-012', '30', ''],
  ['Disease Surveillance & Veterinary Records', 'Record vaccinations, tests and treatments against the animal tag, with officer, date and GPS.', 'Inception Report §5(a), §5(e)', 'Must', 'BR-011', '30, 34', ''],
  ['Disease Surveillance & Veterinary Records', 'Report disease cases from the field with GPS, issue alerts and trace contacts through movement history.', 'Inception Report §5(e)', 'Must', '', '30, 34', 'KPI: average alert time'],
  ['Export & Slaughter Documentation', 'Issue export certificates linked to the tagged animals, showing country of origin and a signed QR code.', 'Inception Report §5(a), §5(c)', 'Must', 'BR-013', '30', ''],
  ['Export & Slaughter Documentation', 'Record slaughter and export against the tag and close the animal record.', 'Inception Report §5(a)', 'Must', 'BR-014', '30', ''],
  ['External Verification Portal', 'Let importing authorities verify identity, origin, health status and certificate validity by QR code.', 'Inception Report §4, §5(c)', 'Must', 'BR-015', '32', ''],
  ['Administrative, Security & Analytics', 'Ministry Portal with a real-time national dashboard: registrations, tagging coverage, permits, alerts and certificates.', 'Inception Report §4', 'Must', '', '31', 'Acceptance #4: standard reports ≤ 25 seconds'],
  ['General', 'Farmers Portal mobile app (Android and iOS) in Somali and English.', 'Inception Report §4', 'Must', '', '33', ''],
  ['Administrative, Security & Analytics', 'Officer tablet app works offline and syncs to the central database without loss or duplication.', 'Inception Report §4, §15', 'Must', 'BR-018', '29, 34', 'Acceptance #3: 100% offline records synchronised'],
  ['Administrative, Security & Analytics', 'Role-based access control for every user group, with MFA for administrators.', 'Inception Report §12, §15', 'Must', 'BR-016', '17, 31', 'Acceptance #5: roles restricted to authorised functions'],
  ['Administrative, Security & Analytics', 'Tamper-proof audit log of every create, change, deletion and user-management action.', 'Inception Report §5(b), §15', 'Must', 'BR-017', '36', 'Acceptance #8: 100% of critical actions logged'],
  ['Administrative, Security & Analytics', 'Encrypt all data in transit (TLS 1.2+) and at rest (AES-256), including on field devices.', 'Inception Report §15', 'Must', '', '17', 'Acceptance #7: encryption verified'],
  ['Administrative, Security & Analytics', 'Backup and disaster recovery with RTO 2 hours and RPO 15 minutes; daily backups kept 30 days.', 'Inception Report §15', 'Must', 'BR-019', '16', 'Acceptance #9: witnessed DR restore'],
  ['Administrative, Security & Analytics', 'Independent penetration test with no open critical or high findings before go-live.', 'Inception Report §15', 'Must', '', '59, 60', 'Acceptance #6: VAPT report and re-test certificate'],
  ['General', 'Open, documented REST APIs (OpenAPI 3.0) through one API gateway for partner integration.', 'Inception Report §12, §14', 'Must', '', '29, 35, 40', ''],
  ['General', 'SMS / USSD and push notifications to farmers and officers.', 'Inception Report §10 item 15, §12', 'Should', '', '33', ''],
  ['Help Desk', 'Unified help desk: every channel becomes a ticket, answered on the original channel, with MoLFR dashboard.', 'Inception Report §16', 'Should', 'BR-021', '73, 74', ''],
];
function buildRtm() {
  return REQS.map(([module, requirement, source, priority, rules, tasks, acceptance], i) => ({
    id: crypto.randomUUID(), order: i, code: 'REQ-' + String(i + 1).padStart(3, '0'), module, requirement, source, priority,
    rules, tasks, design: '', testCases: '', testResult: 'Not tested', acceptance, status: 'Draft',
    approval: 'Pending', approvedBy: '', approvalDate: '', comments: '', updated: '',
  }));
}
module.exports.buildRtm = buildRtm;
