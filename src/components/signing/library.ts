import type { SignRole, TemplateCategory } from "@/lib/signing";
import { fieldToken, mergeToken, newWrittenField } from "./written";
import type { AutoKey, FieldType } from "@/lib/signing";

// TossSign's starter library: written templates TOSS can add in one click and then edit.
// Plain-language starting points written for TOSS, not legal advice: review each one before use.

export interface Starter {
  key: string;
  name: string;
  description: string;
  category: TemplateCategory;
  doc_type: string | null;
  roles: SignRole[];
  body: () => string;
}

const m = (k: AutoKey) => mergeToken(k);
/** A field chip for the starter's signer. */
const f = (type: FieldType, label: string, role: string, roleLabel: string, extra: Record<string, unknown> = {}) => fieldToken({ ...newWrittenField(type, role), label, ...extra }, roleLabel);
const sigBlock = (role: string, label: string) =>
  `<p><br></p><table><tbody><tr><th>${label} signature</th><th>Date</th></tr><tr><td>${f("signature", "Signature", role, label)}</td><td>${f("date", "Date signed", role, label)}</td></tr><tr><td>Name: ${f("name", "Full name", role, label)}</td><td>Title: ${f("title", "Title", role, label, { required: false })}</td></tr></tbody></table>`;

export const STARTERS: Starter[] = [
  {
    key: "dispatch_agreement",
    name: "Dispatch Service Agreement",
    description: "TOSS dispatches for the carrier for a percentage of each load.",
    category: "company",
    doc_type: "dispatch_agreement",
    roles: [{ key: "signer", label: "Carrier" }],
    body: () =>
      `<h1>Dispatch Service Agreement</h1>
<p>This agreement is made on ${m("today")} between <b>Trucking One Stop Shop Corp</b> ("TOSS") and ${m("company.name")}, MC ${m("company.mc")}, USDOT ${m("company.dot")} (the "Carrier"), located at ${m("company.address")}.</p>
<h2>1. Services</h2>
<p>TOSS will find and book loads for the Carrier's equipment, negotiate rates with brokers and shippers, and handle the paperwork that goes with each load (rate confirmations, carrier packets, invoices) on the Carrier's behalf. The Carrier decides which loads it accepts.</p>
<h2>2. Fee</h2>
<p>The Carrier pays TOSS ${f("number", "Dispatch fee %", "toss", "TOSS")} percent of the gross amount of each load TOSS books, invoiced weekly.</p>
<h2>3. The Carrier's duties</h2>
<ul><li>Keep its operating authority, insurance and all required documents current, and send TOSS updated copies.</li><li>Operate legally and safely, and tell TOSS right away about any accident, inspection or change.</li><li>Pay TOSS's invoices within ${f("number", "Payment terms (days)", "toss", "TOSS")} days.</li></ul>
<h2>4. Term</h2>
<p>This agreement starts on the date signed and continues until either party ends it with written notice.</p>
${sigBlock("signer", "Carrier")}`,
  },
  {
    key: "driver_application",
    name: "Driver Employment Application",
    description: "The driver's details, license and work history, signed by the driver.",
    category: "driver",
    doc_type: "driver_application",
    roles: [{ key: "driver", label: "Driver" }],
    body: () =>
      `<h1>Driver Employment Application</h1>
<p>Applying to drive for ${m("company.name")} (USDOT ${m("company.dot")}).</p>
<h2>Applicant</h2>
<table><tbody>
<tr><td>Full name</td><td>${f("name", "Full name", "driver", "Driver")}</td></tr>
<tr><td>Date of birth</td><td>${f("text", "Date of birth", "driver", "Driver", { auto: "driver.dob" })}</td></tr>
<tr><td>Phone</td><td>${f("text", "Phone", "driver", "Driver", { validation: "phone", auto: "driver.phone" })}</td></tr>
<tr><td>Email</td><td>${f("email", "Email", "driver", "Driver")}</td></tr>
<tr><td>Address</td><td>${f("text", "Address", "driver", "Driver")}</td></tr>
</tbody></table>
<h2>License</h2>
<table><tbody>
<tr><td>License number</td><td>${f("text", "License number", "driver", "Driver", { auto: "driver.license" })}</td></tr>
<tr><td>State</td><td>${f("text", "License state", "driver", "Driver", { auto: "driver.license_state" })}</td></tr>
<tr><td>Class</td><td>${f("dropdown", "License class", "driver", "Driver", { options: ["CDL A", "CDL B", "CDL C", "Non-CDL"] })}</td></tr>
<tr><td>Expires</td><td>${f("text", "License expires", "driver", "Driver", { auto: "driver.license_expiry" })}</td></tr>
<tr><td>Photo of the license</td><td>${f("attachment", "License photo", "driver", "Driver")}</td></tr>
</tbody></table>
<h2>Experience</h2>
<p>Years driving a commercial vehicle: ${f("number", "Years of experience", "driver", "Driver")}</p>
<p>Any accidents or moving violations in the last 3 years? ${f("radio", "Accidents or violations", "driver", "Driver", { options: ["No", "Yes"] })}</p>
<p>If yes, please explain: ${f("text", "Explanation", "driver", "Driver", { required: false })}</p>
<h2>Previous employer</h2>
<p>Company: ${f("text", "Previous employer", "driver", "Driver", { required: false })} · From–to: ${f("text", "Employment dates", "driver", "Driver", { required: false })}</p>
<h2>Certification</h2>
<p>I certify that the information in this application is true and complete, and I authorize ${m("company.name")} to verify it, including my driving record and past employment.</p>
${sigBlock("driver", "Driver")}`,
  },
  {
    key: "drug_alcohol_policy",
    name: "Drug & Alcohol Policy Acknowledgment",
    description: "The driver confirms they received and understand the testing policy.",
    category: "driver",
    doc_type: "driver_policies",
    roles: [{ key: "driver", label: "Driver" }],
    body: () =>
      `<h1>Drug &amp; Alcohol Policy Acknowledgment</h1>
<p>Company: ${m("company.name")} · USDOT ${m("company.dot")}</p>
<p>I acknowledge that I have received a copy of ${m("company.name")}'s drug and alcohol testing policy, which follows the U.S. Department of Transportation rules for commercial drivers, and that I have had the chance to ask questions about it.</p>
<p>I understand that I may be tested before employment, at random, after certain accidents, on reasonable suspicion, and when returning to duty, and that refusing a test is treated as a positive result.</p>
<p>${f("checkbox", "I have read the policy", "driver", "Driver", { required: true })} I have read and understand the policy.</p>
${sigBlock("driver", "Driver")}`,
  },
  {
    key: "clearinghouse_consent",
    name: "Clearinghouse Limited Query Consent",
    description: "The driver allows limited queries of the FMCSA Drug & Alcohol Clearinghouse.",
    category: "driver",
    doc_type: "clearinghouse_full_query",
    roles: [{ key: "driver", label: "Driver" }],
    body: () =>
      `<h1>Clearinghouse Limited Query Consent</h1>
<p>I, ${f("name", "Full name", "driver", "Driver")}, with CDL number ${f("text", "CDL number", "driver", "Driver", { auto: "driver.license" })} issued by ${f("text", "CDL state", "driver", "Driver", { auto: "driver.license_state" })}, give ${m("company.name")} (USDOT ${m("company.dot")}) permission to run limited queries of the FMCSA Commercial Driver's License Drug and Alcohol Clearinghouse about me, for as long as I work for the company.</p>
<p>I understand that a limited query only shows whether information about me exists there, and that if it does, the company must get my separate consent in the Clearinghouse to see it.</p>
${sigBlock("driver", "Driver")}`,
  },
  {
    key: "der_designation",
    name: "DER Designation",
    description: "The carrier names its Designated Employer Representative.",
    category: "der",
    doc_type: null,
    roles: [{ key: "der", label: "DER" }],
    body: () =>
      `<h1>Designated Employer Representative</h1>
<p>${m("company.name")} (USDOT ${m("company.dot")}) names the person below as its Designated Employer Representative (DER) for its drug and alcohol testing program. The DER receives test results, removes drivers from safety-sensitive work when required, and makes the program's decisions for the company.</p>
<table><tbody>
<tr><td>DER name</td><td>${f("name", "Full name", "der", "DER")}</td></tr>
<tr><td>Phone</td><td>${f("text", "Phone", "der", "DER", { validation: "phone" })}</td></tr>
<tr><td>Email</td><td>${f("email", "Email", "der", "DER")}</td></tr>
</tbody></table>
<p>${f("checkbox", "I accept the DER duties", "der", "DER", { required: true })} I accept the duties of DER for the company.</p>
${sigBlock("der", "DER")}`,
  },
];
