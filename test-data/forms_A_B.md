# Form A and Form B

Fictional scholarship applications for a university usability test. No real scholarship uses these questions. Testers answer from their assigned profile in `test-data/profiles.csv`. Profiles P1–P4 have 6 achievement rows. Profiles P5–P8 have 9.

Import each file in Qualtrics with Tools → Import survey, or Create survey → From a file.

- `test-data/form_A.qsf` is Evidence Vault Form A, an academic scholarship (Kite & Quill). It asks for three award slots and two volunteering items.
- `test-data/form_B.qsf` is Evidence Vault Form B, a community bursary (Open Desk). It asks for two award slots and three volunteering items. Wording and the order of boxes differ from Form A.

Dates and durations are typed as they appear in the profile, for example 15 Nov 2026 or 1 Jan 2025 - 1 Jan 2026. Those boxes are single-line text, including the date box inside a form question. They do not use date validation.

Where a profile may have nothing that fits, the question says “If none, write N/A” and is not required. A form box cannot check that hours are a whole number, so each required volunteering item asks for hours in the next or previous question. That question accepts a whole number, minimum 0. Form B’s third volunteering item is optional and keeps hours in the form, so the student can write N/A.

Every profile can answer the required questions. Each profile has a name, year of study, major, and GPA; exactly one award; at least one internship and a second activity that is an internship, competition, workshop, certificate, qualification, or leadership role; and at least two volunteering rows with numeric hours. Extra award slots, and Form B’s third volunteering item, are the optional questions.

The Next.js app is unchanged.

## Evidence Vault Form A

**Qualtrics survey name:** Evidence Vault Form A

### Block 1. Personal information

#### A_Name

- **Type:** Short text, single line
- **Response:** Required
- **Question text:** Full name as it should appear on the Kite & Quill Academic Scholarship application.

#### A_Year

- **Type:** Multiple choice, dropdown
- **Response:** Required
- **Question text:** Year of study.
- **Options:**
  - Year 1
  - Year 2
  - Year 3
  - Year 4
  - Year 5 or above

#### A_Major

- **Type:** Multiple choice, dropdown
- **Response:** Required
- **Question text:** Major. Choose the closest programme. If yours is not listed, choose Other.
- **Options:**
  - BA (Fine Arts), HKU
  - BBA (Accounting), HKUST
  - BBA (Finance), HKUST
  - BBA (Management), HKUST
  - BBA (Marketing), CUHK
  - BEd (English Language Education), EdUHK
  - BEng (Electronic Engineering), HKU
  - BEng Computer Science, HKU
  - BEng Mechanical Engineering, HKUST
  - BSc (Chemistry), HKUST
  - BSc Biomedical Sciences, HKU
  - BSocSc (Psychology), HKU
  - BSocSc Global Communication, CUHK
  - LLB, HKU
  - Other

#### A_Grad

- **Type:** Multiple choice, dropdown
- **Response:** Required
- **Question text:** Expected graduation year.
- **Options:**
  - 2026
  - 2027
  - 2028
  - 2029
  - 2030

#### A_GPA

- **Type:** Short text, single line
- **Response:** Required
- **Question text:** GPA, including the scale (for example 3.68/4.3).

### Block 2. Awards and academic recognition

#### A_Award1

- **Type:** Form (several boxes on one question)
- **Response:** Required
- **Question text:** Award you would cite first for academic merit. Enter the award name, the year, the organizer, and the date or duration.
- **Boxes, in order:**
  - Award name
  - Year of award (2022-2026)
  - Organizer
  - Date or duration (for example 15 Nov 2026 or 1 Jan 2025 - 1 Jan 2026)

#### A_Award2

- **Type:** Form (several boxes on one question)
- **Response:** Not required
- **Question text:** A second award, if you have one. If none, write N/A in each box.
- **Boxes, in order:**
  - Award name
  - Year of award (2022-2026)
  - Organizer
  - Date or duration (for example 15 Nov 2026 or 1 Jan 2025 - 1 Jan 2026)

#### A_Award3

- **Type:** Form (several boxes on one question)
- **Response:** Not required
- **Question text:** A third award, if you have one. If none, write N/A in each box.
- **Boxes, in order:**
  - Award name
  - Year of award (2022-2026)
  - Organizer
  - Date or duration (for example 15 Nov 2026 or 1 Jan 2025 - 1 Jan 2026)

### Block 3. Leadership and activities

#### A_Act1

- **Type:** Form (several boxes on one question)
- **Response:** Required
- **Question text:** The internship, competition, or leadership role you would put first for academic merit. Enter the activity name, your role, the organizer, and the date or duration.
- **Boxes, in order:**
  - Activity name
  - Your role
  - Organizer
  - Date or duration (for example 15 Nov 2026 or 1 Jan 2025 - 1 Jan 2026)

#### A_Act2

- **Type:** Form (several boxes on one question)
- **Response:** Required
- **Question text:** A second activity: another internship, competition, workshop, certificate, qualification, or leadership role.
- **Boxes, in order:**
  - Activity name
  - Your role
  - Organizer
  - Date or duration (for example 15 Nov 2026 or 1 Jan 2025 - 1 Jan 2026)

#### A_ActKind

- **Type:** Multiple choice, dropdown
- **Response:** Required
- **Question text:** Which label best fits the activity you listed first in this section?
- **Options:**
  - An internship
  - A competition
  - A leadership role
  - A workshop, certificate, or qualification
  - Other

### Block 4. Community service

#### A_Vol1

- **Type:** Form (several boxes on one question)
- **Response:** Required
- **Question text:** First volunteering item. Enter the work name, the duration, and a short description of the work. Enter the hours in the next question.
- **Boxes, in order:**
  - Work name
  - Duration (for example 15 Nov 2026 or 1 Jan 2025 - 1 Jan 2026)
  - Short description of the work

#### A_Vol1Hrs

- **Type:** Text entry, whole number, minimum 0
- **Response:** Required
- **Question text:** Hours served on that first volunteering item. Enter a whole number.
- **Validation:** whole number, minimum 0. No date validation.

#### A_Vol2

- **Type:** Form (several boxes on one question)
- **Response:** Required
- **Question text:** Second volunteering item. Enter the work name, the duration, and a short description of the work. Enter the hours in the next question.
- **Boxes, in order:**
  - Work name
  - Duration (for example 15 Nov 2026 or 1 Jan 2025 - 1 Jan 2026)
  - Short description of the work

#### A_Vol2Hrs

- **Type:** Text entry, whole number, minimum 0
- **Response:** Required
- **Question text:** Hours served on that second volunteering item. Enter a whole number.
- **Validation:** whole number, minimum 0. No date validation.

#### A_VolTotal

- **Type:** Text entry, whole number, minimum 0
- **Response:** Required
- **Question text:** Total hours served on every volunteering item in your record. Enter a whole number. Do not add a row whose hours are not a number.
- **Validation:** whole number, minimum 0. No date validation.

### Block 5. Personal statement

#### A_Essay

- **Type:** Text entry, essay
- **Response:** Required
- **Question text:** In 100-150 words, say what you would do with the Kite & Quill Academic Scholarship. Tie your answer to your academic record and to one leadership or service role you have already done.

### Block 6. Evidence

#### A_File

- **Type:** File upload
- **Response:** Required
- **Question text:** Upload one PDF that contains the evidence for the items you used on this application.
- **Validation:** none. The question text says PDF. Do not set a PDF content type.

## Evidence Vault Form B

**Qualtrics survey name:** Evidence Vault Form B

### Block 1. About you

#### B_Name

- **Type:** Short text, single line
- **Response:** Required
- **Question text:** Full name for the Open Desk Community Bursary.

#### B_Major

- **Type:** Multiple choice, dropdown
- **Response:** Required
- **Question text:** Major. Pick the programme that matches your record. If it is not listed, choose Other.
- **Options:**
  - BA (Fine Arts), HKU
  - BBA (Accounting), HKUST
  - BBA (Finance), HKUST
  - BBA (Management), HKUST
  - BBA (Marketing), CUHK
  - BEd (English Language Education), EdUHK
  - BEng (Electronic Engineering), HKU
  - BEng Computer Science, HKU
  - BEng Mechanical Engineering, HKUST
  - BSc (Chemistry), HKUST
  - BSc Biomedical Sciences, HKU
  - BSocSc (Psychology), HKU
  - BSocSc Global Communication, CUHK
  - LLB, HKU
  - Other

#### B_Year

- **Type:** Multiple choice, dropdown
- **Response:** Required
- **Question text:** Current year of study.
- **Options:**
  - Year 1
  - Year 2
  - Year 3
  - Year 4
  - Year 5 or above

#### B_GPA

- **Type:** Short text, single line
- **Response:** Required
- **Question text:** GPA as printed on your record, including the scale (for example 3.41/4.3).

#### B_Grad

- **Type:** Multiple choice, dropdown
- **Response:** Required
- **Question text:** Year you expect to graduate.
- **Options:**
  - 2026
  - 2027
  - 2028
  - 2029
  - 2030

### Block 2. Recognition

#### B_Award1

- **Type:** Form (several boxes on one question)
- **Response:** Required
- **Question text:** The award you would mention on a community-service bursary. Start with who gave it, then the award name, the year, and the date or duration.
- **Boxes, in order:**
  - Organizer
  - Award name
  - Year of award (2022-2026)
  - Date or duration (for example 15 Nov 2026 or 1 Jan 2025 - 1 Jan 2026)

#### B_Award2

- **Type:** Form (several boxes on one question)
- **Response:** Not required
- **Question text:** One more award, if you have one. If none, write N/A in each box.
- **Boxes, in order:**
  - Organizer
  - Award name
  - Year of award (2022-2026)
  - Date or duration (for example 15 Nov 2026 or 1 Jan 2025 - 1 Jan 2026)

### Block 3. Experience related to your career

#### B_Act1

- **Type:** Form (several boxes on one question)
- **Response:** Required
- **Question text:** The internship or placement you would cite first for the work you want after university. Start with the organizer.
- **Boxes, in order:**
  - Organizer
  - Activity name
  - Date or duration (for example 15 Nov 2026 or 1 Jan 2025 - 1 Jan 2026)
  - Your role

#### B_Act2

- **Type:** Form (several boxes on one question)
- **Response:** Required
- **Question text:** A second experience that points to that career: another internship, a workshop, a certificate, a competition, or a leadership role.
- **Boxes, in order:**
  - Organizer
  - Activity name
  - Date or duration (for example 15 Nov 2026 or 1 Jan 2025 - 1 Jan 2026)
  - Your role

#### B_ServicePick

- **Type:** Multiple choice, dropdown
- **Response:** Required
- **Question text:** Which volunteering item should a reviewer read first?
- **Options:**
  - The volunteering item with the most hours
  - The volunteering item with the latest end date
  - The volunteering item where my role was the most responsible
  - I have no volunteering item

### Block 4. Community service and hours

#### B_Vol1Hrs

- **Type:** Text entry, whole number, minimum 0
- **Response:** Required
- **Question text:** Hours served on the volunteering item you would feature first. Enter a whole number.
- **Validation:** whole number, minimum 0. No date validation.

#### B_Vol1

- **Type:** Form (several boxes on one question)
- **Response:** Required
- **Question text:** For that same volunteering item, enter the duration, a short description of the work, and the work name.
- **Boxes, in order:**
  - Duration (for example 15 Nov 2026 or 1 Jan 2025 - 1 Jan 2026)
  - Short description of the work
  - Work name

#### B_Vol2Hrs

- **Type:** Text entry, whole number, minimum 0
- **Response:** Required
- **Question text:** Hours served on a second volunteering item. Enter a whole number.
- **Validation:** whole number, minimum 0. No date validation.

#### B_Vol2

- **Type:** Form (several boxes on one question)
- **Response:** Required
- **Question text:** For that second item, enter the duration, a short description of the work, and the work name.
- **Boxes, in order:**
  - Duration (for example 15 Nov 2026 or 1 Jan 2025 - 1 Jan 2026)
  - Short description of the work
  - Work name

#### B_Vol3

- **Type:** Form (several boxes on one question)
- **Response:** Not required
- **Question text:** A third volunteering item, if you have one. If none, write N/A in each box.
- **Boxes, in order:**
  - Duration (for example 15 Nov 2026 or 1 Jan 2025 - 1 Jan 2026)
  - Hours (a whole number, or N/A)
  - Work name
  - Short description of the work

#### B_VolTotal

- **Type:** Text entry, whole number, minimum 0
- **Response:** Required
- **Question text:** Total volunteering hours. Add every volunteering row that has a number of hours, and enter that whole number.
- **Validation:** whole number, minimum 0. No date validation.

### Block 5. Personal statement

#### B_Essay

- **Type:** Text entry, essay
- **Response:** Required
- **Question text:** In 100-150 words, explain why you want the Open Desk Community Bursary and the kind of work you hope to do after university. Name one volunteering item, its organizer, and the hours you served.

### Block 6. Supporting document

#### B_File

- **Type:** File upload
- **Response:** Required
- **Question text:** Upload one PDF with the evidence for the volunteering and the experience you cited above.
- **Validation:** none. The question text says PDF. Do not set a PDF content type.
