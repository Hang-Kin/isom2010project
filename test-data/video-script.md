# Evidence Vault video script

PART 1: Problem and market (0:00 - 1:30) | Speakers: Onardo, Vania, Jin
Screen: title slide, then a one-slide "pain points + competitor gap" table.
[0:00-0:15] Onardo 🟦
Hello! We are Onardo, Jin, Sylvia, and Vania, and we are presenting Evidence Vault, a web application that helps students organize their achievements, store supporting evidence, and efficiently reuse those achievements for all of their application needs.
[0:15-0:40] Onardo 🟦 (trimmed)
This started from my own experience. Applying for a scholarship at UST, I spent almost an hour looking for certificates across my house, old email attachments and Google Drive. This was not just me, and it happens every time a student applies.
[0:40-1:05] Vania 🟧 (fill ⬜ with your interview findings)
We interviewed ⬜[N] students and read ⬜[N] real application forms. Three pain points came up. First, ⬜[pain point 1, e.g. evidence is scattered across places]. Second, ⬜[pain point 2, e.g. the same details are retyped for every form]. Third, ⬜[pain point 3, e.g. students don't know which achievements fit which scholarship]. So the problem is not storage. It is turning stored evidence into an application-ready answer.
[1:05-1:30] Jin 🟦 (trimmed, from competitor analysis)
Google Drive and Excel store files well, but don't help prepare an application. HeroPortfolio showcases achievements publicly. Student Achievement Tracker logs achievements but doesn't produce tailored outputs. 🟧 That gap is our opportunity, and it also tells us what not to do. We don't compete on storage, because Drive already wins there. We compete on turning records into packets.
Concept hook 🟧 (Lecture 3, switching): Adoption is compared with the user's current behaviour. Students already use Drive and Excel, so our competitor is "doing nothing new".

PART 2: Live demo (1:30 - 6:45) | Speakers: Sylvia (driving), Onardo (design reasons)
Screen: real app recording. One concrete user and one task before the first click. Include a changed input and a failure case.
[1:30-1:50] Sylvia 🟧 Frame: gate 1, adoption
Our user is a second-year student, ⬜[profile name, e.g. Profile 3], applying for a scholarship. Our design question is the one from the course: why would she try this instead of Drive? Her first win has to come fast, so we count a user as activated at their first generated PDF, not at sign-up.
[1:50-2:40] Sylvia 🟧 Demo step 1: store once
*[Action: sign up, open first-win checklist, import the profile CSV.]*
She starts with the first-win checklist, then imports her records from a CSV. That is deliberate. Importing from Excel and the backup export lower the cost of leaving her current system, which is the habit and switching barrier. ⬜[CONFIRM: first-win checklist and CSV import exist]
*[Action: open one achievement, show fields, upload evidence PDF.]*
Each achievement stores its name, organizer, dates, hours, award, role and description, with its evidence file attached.
[2:40-3:15] Onardo 🟧 Trust and risk
*[Action: show the sensitive-document warning; mention private storage.]*
Application files are sensitive, so trust matters. The app warns before sensitive documents are uploaded, files sit in private storage, and only the owner can access them. ⬜[CONFIRM: warning, private bucket and owner-only access are live] Using the course's software layers, the app is the application layer, Supabase is middleware that handles storage and the database, and the browser is the system layer.
[3:15-4:15] Sylvia 🟧 Demo step 2: build the application packet
*[Action: open the application builder, choose the scholarship preset, paste the scholarship criteria.]*
Now she picks the scholarship preset and pastes the criteria from the form.
[Action: show the ranking list, click "Add" on two and "Not relevant" on one.]
The app turns the criteria into a keyword profile and scores her entries against it. This is content-based matching: items described by attributes, compared with a profile. She says yes or no to each suggestion, which is explicit feedback, and we record the acceptance rate.
[4:15-4:50] Onardo 🟧 Perceived ease of use
*[Action: toggle bullet vs paragraph format, reorder entries.]*
She can switch between bullet and paragraph, because a résumé and a scholarship answer need different formats. The presets and this toggle reduce the effort she perceives, which the course's technology acceptance model says drives intention to use.
[4:50-5:25] Sylvia 🟧 Quality beyond accuracy
*[Action: show the portfolio balance panel.]*
The balance panel checks category mix and date coverage, so the top results are not just ten similar items. The course calls this quality beyond accuracy. ⬜[CONFIRM: panel exists]
[5:25-6:05] Sylvia 🟧 Generate the packet: checkable evidence
*[Action: generate and download the PDF; scroll to numbered evidence.]*
The PDF has numbered evidence, so "Evidence 1.1 supports Achievement 1" ties each claim to a document. An assessor can't see quality directly, so numbered evidence works as a signal. These are the applicant's own uploads, though, and the app does not verify them. ⬜[CONFIRM: optional verifier field exists, otherwise say "a verifier is future work"]
[6:05-6:45] Sylvia 🟧 Changed input and failure case
*[Action 1: change a keyword or edit an entry's hours, show ranking and PDF update.]*
If we change this entry's hours, the ranking and the PDF update from the same saved record. One record feeds the form answers, the PDF and the packet.
[Action 2: try an empty title or negative hours.]
And if she enters negative hours, the app rejects it ⬜[CONFIRM and say the exact message]. ⬜[CONFIRM: if error messages are layer-tagged, add "the message tells us whether the application, the database or the browser failed".]

PART 3: Evaluation, limits, concepts (6:45 - 9:30) | Speakers: Vania, Sylvia, Onardo, Jin
Screen: Slide A (test design + results table), Slide B (funnel), Slide C (limits), Slide D (contributions).
[6:45-7:05] Vania 🟧 How we tested
*[Slide A. Test design.]*
We ran a within-subject comparison with 8 testers, who were teammates and friends. Each used fictional profiles with 6 or 9 achievements and completed two scholarship forms, one with Excel and Drive and one with Evidence Vault. We alternated the order and the form so one method wasn't always first.
[7:05-7:50] Vania 🟧 Results (all ⬜ until the data is in)
[Slide A: table. Rows: minutes per form, errors, packets completed, "ready-to-submit" rating, "match what you needed?" rating.]
Our primary metric is a completed packet. We did not use page views or sign-ups. On average, the app took ⬜[RESULT] minutes versus ⬜[RESULT] with Excel and Drive, with ⬜[RESULT] versus ⬜[RESULT] errors. ⬜[RESULT]/8 testers completed a packet. Asked "Did this packet match what you needed?", ⬜[RESULT] said yes, and this follows the expectation-confirmation logic. ⬜[CONFIRM: if the pop-up version isn't built, say we asked it in the survey.]
[7:50-8:15] Sylvia 🟧 Funnel and the three gates
*[Slide B: funnel signed up -> entry -> evidence -> selection -> PDF -> download, using unique users.]*
Our funnel uses unique users from our event log, which has stable event names and no personal content. The biggest drop is at ⬜[step], so our decision is ⬜[ship / revise / stop], with the fix ⬜[...]. Gate 1, adoption, was ⬜[RESULT]. Gate 2, continued use, is shown by ⬜[saved packets / second-application test]. Gate 3, value, is time saved and fewer errors.
[8:15-8:55] Onardo 🟧 Limits, stated honestly
*[Slide C.]*
The limits matter. The sample is 8 people, mostly friends, using fictional profiles, so we report descriptive results and do not claim statistical significance. We have not measured weekly retention, which needs more days of data. Matching is keyword-only and cannot understand meaning. Exporting a PDF shows task completion, not an accepted application. Evidence is self-uploaded and unverified. And the tool only works if students keep their records current. That is the complementary change it needs.
[8:55-9:15] Jin 🟧 Course concepts in one breath
*[Slide: three gates diagram.]*
Gate 1 was explained by perceived usefulness, ease of use, trust and switching cost. Gate 2 by expectation-confirmation and effective use. Gate 3 by outcomes, not clicks. We also used content-based matching, information signals, and the three software layers.
[9:15-9:30] Jin 🟦 (adapted)
In conclusion, students struggle to organize and reuse achievements. Evidence Vault is a centralized platform that stores achievements, manages evidence, and generates application-focused packets. Next, we would test long-term retention and add AI summarization. Thank you for listening. We welcome any questions.
[Slide D: contributions. One line each for Onardo, Jin, Sylvia, Vania. Fill in real contributions.] ⬜
