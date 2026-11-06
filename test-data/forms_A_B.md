🟧 [AI]

These are fictional Qualtrics drafts for a university usability test. They compare filling a scholarship form from Excel and Drive with filling the same form from a personal achievement management app. No real scholarship uses these questions. Do not treat any profile as a real person.

The Next.js app is unchanged. This file does not record participant results.

## How to use these drafts

Testers answer from their assigned profile only (`test-data/profiles.csv`). Profiles P1–P4 have 6 achievement rows. Profiles P5–P8 have 9. Use every row, including rows marked messy. Do not invent achievements, hours, awards, or files.

Bank columns a question may use: item name, organizer, date, hours served, award received, year of award, category, role, description, and evidence file name.

**Today for every “last 2 years” question is 6 November 2026.** The window is 6 November 2024 through 6 November 2026 inclusive. A row matches when its date range overlaps that window: the start is on or before 6 November 2026 and the end is on or after 6 November 2024. A single date matches when it falls inside the window. A range that started before the window and ends inside it still matches.

Each numbered question is one field. Copy the stem into Qualtrics. Set the question type from **Field type**. Where a dropdown lists options, enter those options and no others.

**Essay** means the one long-text question with a 100–150 word instruction. The 80-word selection is long text, and it is a selection task, not a second essay.

---

## Form A — Kite & Quill Academic Scholarship

Fictional scholarship for university students in Hong Kong. Emphasis: academic merit, awards, and leadership.

**Qualtrics survey name:** Form A — Kite & Quill Academic Scholarship

**Opening text (not a field):** Answer from your assigned achievement bank only. Where a question says “If none, write N/A”, that phrase is a complete answer.

### A1. Recent awards

- **Field type:** Short text
- **Task type:** Simple fact
- **Qualtrics:** Text entry, multi-line. Force response on.
- **Stem:** List your 3 most recent awards. For each one, write the award received, the year of award, and the organizer. If you have fewer than 3, list every award you have. If none, write N/A.
- **Which achievement fields it uses:** Award received, Year of award, Organizer

### A2. Date of the award-bearing achievement

- **Field type:** Date
- **Task type:** Simple fact
- **Qualtrics:** Date picker (day, month, and year). Force response on.
- **Stem:** Enter the start date of the achievement that carries your most recent award. If that row shows a single date, enter that date. If it shows a range, enter the first date.
- **Which achievement fields it uses:** Date, Award received, Year of award

### A3. Category of that award

- **Field type:** Dropdown
- **Task type:** Simple fact
- **Qualtrics:** Multiple choice, single answer, dropdown. Force response on.
- **Stem:** What is the category of the achievement you used in A2?
- **Options:**
  - Internship
  - Volunteering
  - Competition
  - Leadership
  - Certificate
  - Qualification
  - Workshop
  - Other
- **Which achievement fields it uses:** Category, Award received

### A4. Competition and leadership count

- **Field type:** Number
- **Task type:** Filtering
- **Qualtrics:** Text entry, number, whole number, minimum 0. Force response on.
- **Stem:** How many achievements in your bank have category Competition or category Leadership? Count each matching row once. Enter the total as a whole number.
- **Which achievement fields it uses:** Category

### A5. Leadership roles

- **Field type:** Short text
- **Task type:** Filtering
- **Qualtrics:** Text entry, multi-line. Force response on.
- **Stem:** List every achievement whose category is Leadership. Ignore the last-2-years window. For each, write the item name, role, organizer, and dates. If none, write N/A.
- **Which achievement fields it uses:** Item name, Role, Organizer, Date, Category

### A6. Internships in the last 2 years

- **Field type:** Short text
- **Task type:** Filtering
- **Qualtrics:** Text entry, multi-line. Force response on.
- **Stem:** List every internship whose dates overlap 6 November 2024 to 6 November 2026. For each, write the item name, organizer, dates, and role. If none, write N/A.
- **Which achievement fields it uses:** Item name, Organizer, Date, Role, Category

### A7. Two strongest academic achievements

- **Field type:** Long text
- **Task type:** Selection
- **Qualtrics:** Text entry, essay box. Do not set a hard 100-word minimum (this is not the essay). Instruction text asks for about 80 words. Force response on.
- **Stem:** Choose your 2 strongest achievements for academic merit or leadership. Name each item, give the role, and explain why you chose it, in about 80 words for both together. If you have fewer than 2, explain the ones you have. If none, write N/A.
- **Which achievement fields it uses:** Item name, Role, Category, Award received, Description

### A8. Evidence for the top award

- **Field type:** File upload
- **Task type:** Evidence upload
- **Qualtrics:** File upload, 1 PDF, force response on.
- **Stem:** Upload the evidence file for the achievement that carries your most recent award.
- **Which achievement fields it uses:** Award received, Year of award, Evidence file name

### A9. Name and description of that award

- **Field type:** Short text
- **Task type:** Simple fact
- **Qualtrics:** Text entry, multi-line. Force response on.
- **Stem:** For the file you uploaded in A8, write the item name and the description from the bank. Do not add facts that are not in the description.
- **Which achievement fields it uses:** Item name, Description, Evidence file name

### A10. Leadership evidence file

- **Field type:** File upload
- **Task type:** Evidence upload
- **Qualtrics:** File upload, 1 PDF, force response **off**, because one assigned profile has no file that matches. Put this line in the question text so the tester can type it: `If none, write N/A: ________`. That line is part of A10, not an extra field. A completed answer is either one PDF or the text N/A.
- **Stem:** Upload the evidence file for one achievement whose category is Leadership. If you have no Leadership row, upload the evidence file for a Competition whose role contains the word “lead”. If none, write N/A and do not upload a file.
- **Which achievement fields it uses:** Category, Role, Evidence file name

### A11. What you would rank first

- **Field type:** Dropdown
- **Task type:** Selection
- **Qualtrics:** Multiple choice, single answer, dropdown. Force response on.
- **Stem:** Which label best fits the single achievement you would rank first for academic merit?
- **Options:**
  - An award from a competition
  - An award attached to a leadership role
  - An internship with no award
  - A certificate, qualification, or workshop
  - No achievement fits
- **Which achievement fields it uses:** Category, Award received, Role

### A12. Leadership or community impact

- **Field type:** Long text
- **Task type:** Essay
- **Qualtrics:** Text entry, essay box. Show the 100–150 word instruction. Do not hard-fail the answer N/A. Force response on.
- **Stem:** In 100–150 words, describe one leadership achievement from your bank. Name the item and the organizer, and say what you did in the role, using only the description. If you have no leadership achievement, describe the community impact of one volunteering item instead, including its item name and organizer. If none, write N/A.
- **Which achievement fields it uses:** Item name, Organizer, Role, Description, Category

---

## Form B — Open Desk Community Bursary

Fictional bursary for university students in Hong Kong. Emphasis: community service, hours served, and career relevance. Wording, order, and caps differ from Form A (up to 5 volunteering roles here; up to 3 awards on Form A).

**Qualtrics survey name:** Form B — Open Desk Community Bursary

**Opening text (not a field):** Answer from your assigned achievement bank only. Hours served count only on volunteering rows. Where a question says “If none, write N/A”, that phrase is a complete answer.

### B1. All volunteering

- **Field type:** Short text
- **Task type:** Filtering
- **Qualtrics:** Text entry, multi-line. Force response on.
- **Stem:** List every volunteering achievement. For each, write the item name, organizer, dates, role, and hours served. If none, write N/A.
- **Which achievement fields it uses:** Item name, Organizer, Date, Role, Hours served, Category

### B2. Total hours served

- **Field type:** Number
- **Task type:** Filtering
- **Qualtrics:** Text entry, number, whole number, minimum 0. Force response on.
- **Stem:** Add the hours served on every volunteering row in your bank. Enter the total as a whole number. Do not add rows whose hours are N/A.
- **Which achievement fields it uses:** Hours served, Category

### B3. Volunteering in the last 2 years

- **Field type:** Short text
- **Task type:** Filtering
- **Qualtrics:** Text entry, multi-line. Force response on.
- **Stem:** From your volunteering rows, list only those whose dates overlap 6 November 2024 to 6 November 2026. For each, write the item name, organizer, and hours served. A row that started before 6 November 2024 and ended on or after that date still counts. If none, write N/A.
- **Which achievement fields it uses:** Item name, Organizer, Date, Hours served, Category

### B4. Up to five volunteering roles

- **Field type:** Short text
- **Task type:** Simple fact
- **Qualtrics:** Text entry, multi-line. Force response on.
- **Stem:** List your 5 most recent volunteering roles. For each, write the role and the organizer. If you have fewer than 5, list every volunteering role you have. If none, write N/A.
- **Which achievement fields it uses:** Role, Organizer, Date, Category

### B5. Which service item to feature

- **Field type:** Dropdown
- **Task type:** Selection
- **Qualtrics:** Multiple choice, single answer, dropdown. Force response on.
- **Stem:** Which volunteering item would you feature first on a community-service bursary?
- **Options:**
  - The volunteering item with the most hours
  - The volunteering item with the latest end date
  - The volunteering item where my role was the most responsible
  - I have no volunteering item
- **Which achievement fields it uses:** Hours served, Date, Role, Category

### B6. Up to two career internships

- **Field type:** Short text
- **Task type:** Filtering
- **Qualtrics:** Text entry, multi-line. Force response on.
- **Stem:** List up to 2 internships that best match work you might do after university. Any date is allowed; do not apply the last-2-years window. If you have more than 2, list the 2 with the latest end dates. For each, write the item name, organizer, dates, and role. If none, write N/A.
- **Which achievement fields it uses:** Item name, Organizer, Date, Role, Category

### B7. End date of the latest internship

- **Field type:** Date
- **Task type:** Simple fact
- **Qualtrics:** Date picker (day, month, and year). Force response on.
- **Stem:** Enter the end date of your most recent internship. If two internships end on different days, use the later end date. If the row shows a single date, enter that date.
- **Which achievement fields it uses:** Date, Category

### B8. Two strongest service or career activities

- **Field type:** Long text
- **Task type:** Selection
- **Qualtrics:** Text entry, essay box. Do not set a hard 100-word minimum (this is not the essay). Instruction text asks for about 80 words. Force response on.
- **Stem:** Choose your 2 strongest activities for community service or career relevance. Name each item and explain why you chose it, in about 80 words for both together. If you have fewer than 2, explain the ones you have. If none, write N/A.
- **Which achievement fields it uses:** Item name, Role, Description, Hours served, Category

### B9. Evidence for the longest volunteering item

- **Field type:** File upload
- **Task type:** Evidence upload
- **Qualtrics:** File upload, 1 PDF, force response on.
- **Stem:** Upload the evidence file for the volunteering item with the most hours served. If two volunteering items tie on hours, upload the one with the later end date.
- **Which achievement fields it uses:** Hours served, Date, Category, Evidence file name

### B10. Facts for that volunteering item

- **Field type:** Short text
- **Task type:** Simple fact
- **Qualtrics:** Text entry, multi-line. Force response on.
- **Stem:** For the volunteering item you used in B9, write the item name, the hours served, the award received, the year of award, and the description. Copy None or N/A when that is what the bank says.
- **Which achievement fields it uses:** Item name, Hours served, Award received, Year of award, Description

### B11. Evidence for a career internship

- **Field type:** File upload
- **Task type:** Evidence upload
- **Qualtrics:** File upload, 1 PDF, force response on.
- **Stem:** Upload the evidence file for the internship you would cite first for career relevance. If you listed two internships in B6, use the one you would rather a reviewer read.
- **Which achievement fields it uses:** Item name, Category, Role, Evidence file name

### B12. Community impact

- **Field type:** Long text
- **Task type:** Essay
- **Qualtrics:** Text entry, essay box. Show the 100–150 word instruction. Do not hard-fail the answer N/A. Force response on.
- **Stem:** In 100–150 words, describe the community impact of your service. Use at least one volunteering item: name it, name the organizer, and include the hours served, drawing only on the description. If you have no volunteering item, describe the career relevance of one internship instead. If none, write N/A.
- **Which achievement fields it uses:** Item name, Organizer, Hours served, Description, Category

---

## Coverage table

A dot means that question needs that bank column. Testers should not need any column outside this set.

| Question | Task | Item name | Organizer | Date | Hours served | Award received | Year of award | Category | Role | Description | Evidence file |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A1 | Simple fact |  | ● |  |  | ● | ● |  |  |  |  |
| A2 | Simple fact |  |  | ● |  | ● | ● |  |  |  |  |
| A3 | Simple fact |  |  |  |  | ● |  | ● |  |  |  |
| A4 | Filtering |  |  |  |  |  |  | ● |  |  |  |
| A5 | Filtering | ● | ● | ● |  |  |  | ● | ● |  |  |
| A6 | Filtering | ● | ● | ● |  |  |  | ● | ● |  |  |
| A7 | Selection | ● |  |  |  | ● |  | ● | ● | ● |  |
| A8 | Evidence upload |  |  |  |  | ● | ● |  |  |  | ● |
| A9 | Simple fact | ● |  |  |  |  |  |  |  | ● | ● |
| A10 | Evidence upload |  |  |  |  |  |  | ● | ● |  | ● |
| A11 | Selection |  |  |  |  | ● |  | ● | ● |  |  |
| A12 | Essay | ● | ● |  |  |  |  | ● | ● | ● |  |
| B1 | Filtering | ● | ● | ● | ● |  |  | ● | ● |  |  |
| B2 | Filtering |  |  |  | ● |  |  | ● |  |  |  |
| B3 | Filtering | ● | ● | ● | ● |  |  | ● |  |  |  |
| B4 | Simple fact |  | ● | ● |  |  |  | ● | ● |  |  |
| B5 | Selection |  |  | ● | ● |  |  | ● | ● |  |  |
| B6 | Filtering | ● | ● | ● |  |  |  | ● | ● |  |  |
| B7 | Simple fact |  |  | ● |  |  |  | ● |  |  |  |
| B8 | Selection | ● |  |  | ● |  |  | ● | ● | ● |  |
| B9 | Evidence upload |  |  | ● | ● |  |  | ● |  |  | ● |
| B10 | Simple fact | ● |  |  | ● | ● | ● |  |  | ● |  |
| B11 | Evidence upload | ● |  |  |  |  |  | ● | ● |  | ● |
| B12 | Essay | ● | ● |  | ● |  |  | ● |  | ● |  |

Form A stresses award, year of award, and leadership. Form B stresses hours served and volunteering, and still reads award received and year of award on the featured service row (those cells may say None and N/A).

## Answer-key template

Column headers for the results sheet. Leave the body empty until the test is run. This file does not contain participant results.

`Participant ID, Profile ID, Method, Form, Order, Start time, End time, Total minutes, Errors, Notes`

| Participant ID | Profile ID | Method | Form | Order | Start time | End time | Total minutes | Errors | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |

Suggested values, not sample people: Method is `Excel and Drive` or `Personal achievement management app`. Form is `A` or `B`. Order is `A then B` or `B then A`.

## Same-count check

One numbered question counts as one field. File-upload questions are included in the field count and counted again as uploads. The essay count is the 100–150 word question only.

| | Form A | Form B | Equal? |
| --- | --- | --- | --- |
| Fields | 12 | 12 | Yes |
| File-upload fields | 2 (A8, A10) | 2 (B9, B11) | Yes |
| Essays | 1 (A12) | 1 (B12) | Yes |

Long-text questions are also equal if the 80-word selection is counted with the essay: 2 on Form A (A7, A12) and 2 on Form B (B8, B12).

Difficulty is matched by task shape, not by repeating the same prompts. Each form has one date lookup, one whole-number reduction, two PDF uploads, one ~80-word choice of 2 activities, one 100–150 word essay, and short lists that force a scan of the bank. Form A’s extra judgment is the leadership fallback (including a real N/A on A10 for a profile with no leadership file). Form B’s extra judgment is comparing hours and applying the date window to volunteering. Caps differ: Form A asks for up to 3 awards; Form B asks for up to 5 volunteering roles.

## Answerability checklist

Checked all 8 profiles in `test-data/profiles.csv`: **P1, P2, P3, P4, P5, P6, P7, P8**. P1–P4 have 6 rows. P5–P8 have 9 rows. Every row has an evidence file name. Every profile has exactly one row with an award, at least one internship, and at least two volunteering rows. Every volunteering row has a numeric hours value, and within each profile those hour values are unique, so B2 and B9 have a single total and a single file. No question asks for a fixed count the short banks cannot meet: “up to 3” and “up to 5” both say to list fewer when that is all the bank holds.

Dated questions use the overlap rule above (today = 6 November 2026). Under that rule:

| Profile | Rows | What was checked | Empty answers this profile may use |
| --- | --- | --- | --- |
| P1 | 6 | 1 award; 1 Leadership row; 1 internship overlaps the window; 2 volunteering rows, both overlap the window | None. A1 lists the one award (fewer than 3). B4 lists both volunteering roles (fewer than 5). |
| P2 | 6 | 1 award; no Leadership category, but one Competition role contains “lead”, so A10 is a file; 1 internship overlaps the window; 2 volunteering rows, both overlap the window | A5 is N/A. A12 can use the competition role that contains “lead”, or the volunteering fallback. |
| P3 | 6 | 1 award, and it sits on a Leadership row (A3 and A11 can select leadership); the only internship ends before 6 November 2024; 3 volunteering rows, and 2 of them overlap the window | A6 is N/A. B6 still has that internship, because B6 is not date-limited. B4 lists all 3 volunteering roles. |
| P4 | 6 | 1 award; no Leadership category and no role containing “lead”; 1 internship overlaps the window; 2 volunteering rows, and 1 of them overlaps the window | A5 is N/A. A10 is N/A. A12 uses the volunteering fallback. B3 lists the one overlapping volunteering row. |
| P5 | 9 | 1 award; 1 Leadership row (so A10 uses that file, not the competition role); 2 internships, and only 1 overlaps the window; 2 volunteering rows, both overlap the window | None. A6 lists the one overlapping internship. B6 may list both internships. |
| P6 | 9 | 1 award; 1 Leadership row, included in A5 even though it ends before the window; 2 internships, both overlap the window; 2 volunteering rows, both overlap the window | None. A1 lists the one award. B4 lists both volunteering roles. |
| P7 | 9 | 1 award; 1 Leadership row; 2 internships, both overlap the window; 3 volunteering rows, all overlap the window | None. B4 lists all 3 volunteering roles (fewer than 5). |
| P8 | 9 | 1 award; 1 Leadership row; 2 internships, both overlap the window; 2 volunteering rows, both overlap the window | None. A6 and B6 can both be answered from those internships. B3 lists both volunteering rows. |

A4 is a number for every profile: each bank has at least one Competition row or one Leadership row, so the count is never empty. A2 and B7 are real dates for every profile. A8, B9, and B11 each have a matching PDF on all 8 profiles. The only upload that is N/A for an assigned profile is A10 for P4.
