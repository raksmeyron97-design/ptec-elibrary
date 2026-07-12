# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: abstract-reader.spec.ts >> Publication abstract reader >> exposes the localized Khmer reader and passes an open-dialog axe scan
- Location: e2e/abstract-reader.spec.ts:97:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('dialog').locator('article > section[lang="km"]').first()
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for getByRole('dialog').locator('article > section[lang="km"]').first()

```

```yaml
- link "Skip to content":
  - /url: "#main-content"
- banner:
  - link "(+855) 92 788 990":
    - /url: tel:+85592788990
  - link "info@ptec.edu.kh":
    - /url: mailto:info@ptec.edu.kh
  - link "មើលផែនទី":
    - /url: https://www.google.com/maps/place/Phnom+Penh+Teacher+Education+College/@11.5574509,104.8872382,1090m/data=!3m1!1e3!4m6!3m5!1s0x310951a618265c67:0x159b1d2bb350bbae!8m2!3d11.5568858!4d104.8872782!16s%2Fg%2F1q665w1lh
  - link "Facebook":
    - /url: https://web.facebook.com/ptec.edu
    - img
  - link "YouTube":
    - /url: https://www.youtube.com/@phnompenhteachereducationc3430
    - img
  - link "PTEC official website":
    - /url: https://www.ptec.edu.kh
  - button "ភាសា": ខ្មែរ
  - link "PTEC Seal បណ្ណាល័យ វ.គ.ភ PTEC Library":
    - /url: /km/home
    - img "PTEC Seal"
    - text: បណ្ណាល័យ វ.គ.ភ PTEC Library
  - navigation "Primary":
    - link "ទំព័រដើម":
      - /url: /km/home
    - button "បណ្ណាល័យឌីជីថល"
    - link "សៀវភៅក្នុងបណ្ណាល័យ":
      - /url: /km/catalogs
    - link "ព័ត៌មាន និងព្រឹត្តិការណ៍":
      - /url: /km/posts
    - button "អំពីយើង"
  - button "ប្ដូរទៅផ្ទៃងងឹត"
  - link "ស្វែងរកក្នុងបណ្ណាល័យ":
    - /url: /km/search
    - img
    - text: ស្វែងរក
  - link "ចូលគណនី":
    - /url: /auth/login
- main:
  - navigation "Breadcrumb":
    - link "ទំព័រដើម":
      - /url: /km
    - link "អត្ថបទសិក្សា":
      - /url: /km/publications
    - text: "Review of Guidelines for Laboratory Design: Health, Safety, and Environmental Considerations, 4th Edition"
  - text: Journal of Chemical Education Article ចូលប្រើដោយសេរី
  - 'link "DOI: 10.1234/eds"':
    - /url: https://doi.org/10.1234/eds
  - 'heading "Review of Guidelines for Laboratory Design: Health, Safety, and Environmental Considerations, 4th Edition" [level=1]'
  - paragraph: ការវាយតម្លៃសៀវភៅ៖ គោលការណ៍ណែនាំសម្រាប់ការរចនាមន្ទីរពិសោធន៍ — សុខភាព សុវត្ថិភាព និងបរិស្ថាន (បោះពុម្ពលើកទី៤)
  - paragraph:
    - text: Shadi Abu-Baker
    - superscript: "1"
    - superscript: "*"
  - group: សាខា និងអ្នកនិពន្ធទំនាក់ទំនង
  - paragraph:
    - text: សម្រង់៖
    - emphasis: Journal of Chemical Education 2026, 19 (6), 1–2
  - text: 4 July 2026 CC BY 44 English
  - link "ទាញយក PDF":
    - /url: /api/publications/journal-of-chemical-education/file?download=1
  - button "មើលសាកល្បង PDF"
  - button "Save publication": រក្សាទុក
  - button "Share": ចែករំលែក
  - button "Copy Link"
  - link "នាំចេញសម្រង់":
    - /url: "#cite-panel"
  - list:
    - listitem:
      - paragraph: "0"
      - paragraph: ចំនួនមើល
    - listitem:
      - paragraph: "0"
      - paragraph: ចំនួនទាញយក
    - listitem:
      - paragraph: "0"
      - paragraph: ឯកសារយោង
    - listitem:
      - paragraph: "2026"
      - paragraph: ឆ្នាំ
  - navigation "Section navigation":
    - link "ទិដ្ឋភាពទូទៅ":
      - /url: "#overview"
    - link "សេចក្តីសង្ខេប":
      - /url: "#abstract"
    - link "មាតិកា":
      - /url: "#toc"
    - link "លទ្ធផលនៃការសិក្សា":
      - /url: "#outcomes"
    - link "អត្ថបទពេញលេញ":
      - /url: "#fulltext"
    - link "ឯកសារយោង":
      - /url: "#references"
    - link "អំពីអ្នកនិពន្ធ":
      - /url: "#authors"
    - link "ការវាយតម្លៃ និងមតិយោបល់":
      - /url: "#reviews"
    - link "សំណួរញឹកញាប់":
      - /url: "#faq"
    - link "ការដកស្រង់":
      - /url: "#cite-panel"
    - link "ពាក់ព័ន្ធ":
      - /url: "#related"
  - region "ទិដ្ឋភាពទូទៅ":
    - heading "ទិដ្ឋភាពទូទៅ" [level=2]
    - heading "មុខវិជ្ជា" [level=3]
    - text: Chemical Education Laboratory Design Laboratory Safety Environmental Health and Safety Science Facility Planning
    - heading "វិស័យស្រាវជ្រាវ និងពាក្យគន្លឹះ" [level=3]
    - link "laboratory design":
      - /url: /km/publications?keyword=laboratory%20design
    - link "laboratory safety":
      - /url: /km/publications?keyword=laboratory%20safety
    - link "health safety and environmental considerations":
      - /url: /km/publications?keyword=health%20safety%20and%20environmental%20considerations
    - link "chemical education":
      - /url: /km/publications?keyword=chemical%20education
    - link "book review":
      - /url: /km/publications?keyword=book%20review
    - link "laboratory renovation":
      - /url: /km/publications?keyword=laboratory%20renovation
    - link "HVAC systems":
      - /url: /km/publications?keyword=HVAC%20systems
    - link "teaching laboratories":
      - /url: /km/publications?keyword=teaching%20laboratories
    - link "fume hoods":
      - /url: /km/publications?keyword=fume%20hoods
    - link "environmental health and safety":
      - /url: /km/publications?keyword=environmental%20health%20and%20safety
  - region "សេចក្តីសង្ខេប":
    - article:
      - text: អាន 6 នាទី 1166 ពាក្យ
      - heading "សេចក្តីសង្ខេប" [level=2]
      - group "ឧបករណ៍កំណត់ការអានសេចក្តីសង្ខេប":
        - button "បន្ថយទំហំអក្សរ"
        - button "ទំហំអក្សរបច្ចុប្បន្ន៖ 100%. កំណត់ទំហំអក្សរទៅដើម"
        - button "ពង្រីកទំហំអក្សរ"
        - button "បើកកម្មវិធីអានសេចក្តីសង្ខេប"
      - paragraph: "When Guidelines for Laboratory Design: Health, Safety, and Environmental Considerations, 4th ed. was written, the goal was to make it easier for lab users and designers to meet the many challenges and considerations inherent in laboratory design, such as complying with health, safety, and environmental requirements. The book emphasizes the critical nature of the communication between the laboratory users, construction engineers, administration, and environmental health and safety personnel for a successful lab design. Such a design provides the best place for scientists to engage in research or teaching with reduced health and safety risks, as has been discussed in this Journal. (1, 2) The authors make it quite clear that a safe and efficient lab does not come about just by hiring the best in the business, but through clear communication and genuine cooperation between all parties involved, including those who will be working in the lab."
      - paragraph: Cover image provided by Wiley and reproduced with permission. Reading and learning from a book of this kind with so many technical details and recommendations can easily overwhelm any reader. Credit should be given to the authors for their thoughtfulness in organizing the information in a rather unique fashion. Methods of organization such as listing identical topics under the same numerical designation make navigating the book unexpectedly easier, despite the many details. The appendices, table of units, and explanations for abbreviations and the like are helpful to those who are not familiar with some technical verbatim used in the book.
      - paragraph:
        - text: Guidelines for Laboratory Design is by far one of the best in terms of layout, comprehension, and material. It is written by a group of experts who represent all aspects critical for lab design, safety, and operation. The book is organized neatly and systemically, starting with guidelines common for all types of laboratories. Discussion then moves to the distinction between new construction projects and renovation projects before it details the guidelines and considerations for specialized laboratories. The current edition is updated with relevant information pertinent to typical and highly advanced laboratories. The book makes a clear distinction between general purpose and highly specialized laboratories, and further suggests unique or specialized labs that may be designed using a combination of the guidelines presented for both.
        - link "ឯកសារយោង 1":
          - /url: "#reference-ref-1nkt5fa"
          - text: "1"
      - paragraph: This book is organized in six parts. In the first part, the common elements of lab design and renovation are discussed, including building and laboratory considerations. In the second part, the design guidelines for a number of commonly used laboratories are discussed, including lab layout, heating, ventilation and air conditioning, loss prevention, industrial hygiene, personal safety, and other special considerations. We are pleased to see that 20 specific labs that cover a broad spectrum of end users are described in detail in this section, including general chemistry, clinical, teaching, physics, animal research, pathology, anatomy, radiation, engineering, and nanotechnology labs, as well as many others. In the third part of the book, the layout and specifications of lab support service facilities and purpose-specific rooms such as support shops and storerooms and waste handling are described in detail. In the fourth part, a general description of installing the heating, ventilation, and air conditioning (HVAC) systems are discussed. In the fifth part, administrative procedures are described, including the project execution and bidding formalities, commissioning and final acceptance criteria, and sustainable laboratory design. And finally, part six contains appendices and matrix tables related to safety items such as emergency showers, eyewash stations, warning signs, and checklists for health and safety.
      - paragraph:
        - text: In the section of the book dealing with general and analytical laboratories, excellent suggestions are offered for designing a new building, as well as providing a wide range of choices for renovating just a single lab or a whole building. Several suggestions cover details such as placement of tables, counters, and other general laboratory furniture. In this section, one may find a variety of issues for these laboratories. One noteworthy point is to avoid having very sensitive instruments placed in the same area where many chemicals are in use on a daily basis. Another useful suggestion is to consider caution regarding safety; there are instances where a combination of nontoxic chemicals can generate a toxic substance; therefore, proper chemical storage and handling should be taken seriously. Because general and analytical laboratories are not normally designed to handle extremely hazardous material, the book gives a list of situations, dealing with carcinogenic materials, for example, that must be avoided and the list is a good reference resource for those who are new to the profession. The authors provide alternative choices to laboratory designs to meet the specific needs of users. These designs give specific suggestions regarding the location of equipment such as fume hoods, bulky instruments, benches, and space gaps for a safe working environment with ease of accessibility. Training of personnel in proper use of facilities and handling of safety equipment and dangerous substances is a must, especially in an academic environment in which a majority of users are untrained students. The authors’ recommendation of the separation of laboratories from office space is good, but in academic settings, especially in smaller institutions, this is not always possible.
        - link "ឯកសារយោង 2":
          - /url: "#reference-ref-1dx1rvg"
          - text: "2"
        - text: The possibility of construction and use of laboratories with restricted access will probably increase in the near future. Perhaps the authors should have addressed these types of laboratories in a separate section of the book rather than suggesting that the designers use of a combination of the guidelines of other types of laboratories.
      - paragraph: "An area that needs some more detail is designing laboratories for future upgrades: for example, a BSL2 biomedical sciences laboratory intended for upgrade to BSL3 facility in the near future. Furthermore, we would like to see (in the next edition?) several economic versions of laboratory design guidelines, if possible. In today’s world, it is common to see unpredictable cuts for construction projects and the presence of such guidelines would allow the shift to a more economic version of these facilities."
      - paragraph: The authors acknowledge the use of elaborate and technical language across the spectrum of those involved in the process, for example, environmental health and safety, architect and design engineers, scientists and other end users. For ease of readability by those involved, we recommend that the appendices include a summary of guidelines of interest to each group, especially the scientists or end users.
      - paragraph: Chapters 1–5 and 16 may be of great interest and value to readers of this Journal. Writing a book of this kind is a challenge, and we commend the authors for a job very well done. We admired the inclusive nature of the book, and we appreciate the authors sharing their expertise. Perhaps the publishers could provide a customized version of this book, including just the chapters appropriate for a specific audience, such as chemists or biologists.
      - paragraph: In summary, this edition of the book addresses a broad spectrum of end users including administrators, researchers, instructors, engineers, and environment health officers. The book is a useful comprehensive reference for academic institutions, but perhaps not for individual instructors.
      - button "បង្ហាញបន្ថែម — សេចក្តីសង្ខេបជាភាសាអង់គ្លេស"
  - region "មាតិកា":
    - heading "មាតិកា" [level=2]
    - list:
      - listitem:
        - text: "01"
        - paragraph: Part 1
        - text: Common Elements of Laboratory Design and Renovation
      - listitem:
        - text: "02"
        - paragraph: Part 2 — Design Guidelines for 20 Commonly Used Laboratory Types
      - listitem:
        - text: "03"
        - paragraph: Part 3 — Laboratory Support Services and Purpose-Specific Rooms
      - listitem:
        - text: "04"
        - paragraph: Part 4 — Heating, Ventilation, and Air Conditioning (HVAC) Systems
      - listitem:
        - text: "05"
        - paragraph: "Part 5 — Administrative Procedures: Bidding, Commissioning, and Sustainable Design"
      - listitem:
        - text: "06"
        - paragraph: "Part 6 — Appendices: Safety Checklists and Matrix Tables"
  - region "លទ្ធផលនៃការសិក្សា":
    - heading "លទ្ធផលនៃការសិក្សា" [level=2]
    - paragraph: បន្ទាប់ពីអានអត្ថបទនេះ អ្នកអាននឹងអាច៖
    - list:
      - listitem: Identify the core health, safety, and environmental requirements that shape modern laboratory design
      - listitem: Explain why clear communication between laboratory users, engineers, administrators, and EHS personnel is critical to a successful design
      - listitem: Distinguish design considerations for new laboratory construction from those for renovation projects
      - listitem: Compare layout and safety requirements across more than 20 specialized laboratory types, from general chemistry to nanotechnology labs
      - listitem: Recognize the role of HVAC, loss prevention, and industrial hygiene in laboratory planning
      - listitem: Apply safety checklists covering emergency showers, eyewash stations, and warning signage in academic laboratories
  - region "អត្ថបទពេញលេញ":
    - heading "អត្ថបទពេញលេញ" [level=2]
    - link "បើកនៅផ្ទាំងថ្មី":
      - /url: /api/publications/journal-of-chemical-education/file
    - button "មើលអត្ថបទពេញលេញ ចុចដើម្បីផ្ទុកកម្មវិធីអាន PDF។"
  - region "ឯកសារយោង2":
    - heading "ឯកសារយោង2" [level=2]
    - list:
      - listitem:
        - text: "ឯកសារយោង 1: Kovac, J. Laboratory Design, Construction and Renovation: Participants, Process, and Product J. Chem. Educ. 2000, 77 (9) 1126"
        - link "ត្រឡប់ទៅការដកស្រង់ទី 1 ក្នុងអត្ថបទ":
          - /url: "#citation-abstract-en-ref-1nkt5fa-1"
        - button "ចម្លងឯកសារយោង"
      - listitem:
        - text: "ឯកសារយោង 2: Guidelines for Laboratory Design: Health, Safety, and Environmental Considerations; 4th ed., by Louis J. DiBerardinis, Janet S. Baum, Melvin W. First, Gari T. Gatwood, and Anand K. Seth. Wiley: Hoboken, New Jersey, 2013. 552 pp. ISBN: 978-0470505526 (hardcover). $149.95."
        - link "ត្រឡប់ទៅការដកស្រង់ទី 1 ក្នុងអត្ថបទ":
          - /url: "#citation-abstract-en-ref-1dx1rvg-1"
        - button "ចម្លងឯកសារយោង"
  - region "អំពីអ្នកនិពន្ធ":
    - heading "អំពីអ្នកនិពន្ធ" [level=2]
    - article:
      - text: SA
      - heading "Shadi Abu-Baker អ្នកនិពន្ធទំនាក់ទំនង" [level=3]
      - paragraph: Shadi Abu-Baker
      - paragraph: Ron Raksmey, PP, Cambodia
      - link "ORCID":
        - /url: https://orcid.org/001
      - link "raksmeyron97@gmail.com":
        - /url: mailto:raksmeyron97@gmail.com
  - region "ការវាយតម្លៃ និងមតិយោបល់4.0 ★ · 1":
    - heading "ការវាយតម្លៃ និងមតិយោបល់4.0 ★ · 1" [level=2]
    - text: "4.0"
    - img
    - img
    - img
    - img
    - img
    - text: 1 review
    - article:
      - text: Ron Raksmey Jul 6, 2026
      - img
      - img
      - img
      - img
      - img
      - paragraph: good
    - heading "ផ្តល់ការវាយតម្លៃ" [level=3]
    - paragraph: ចូលគណនីដើម្បីវាយតម្លៃ និងបញ្ចេញមតិ
    - link "ចូលគណនីដើម្បីវាយតម្លៃ និងបញ្ចេញមតិ":
      - /url: /auth/login?callbackUrl=/km/publications/journal-of-chemical-education#reviews
  - region "សំណួរញឹកញាប់":
    - heading "សំណួរញឹកញាប់" [level=2]
    - group: What is this publication about?
    - group: Why does this publication matter for teacher education?
    - group: Who should read this publication?
    - group: How is the reviewed book organized?
    - group: Which laboratory types does the reviewed book cover?
    - group: Is this publication free to read and download?
  - complementary:
    - 'img "Review of Guidelines for Laboratory Design: Health, Safety, and Environmental Considerations, 4th Edition"'
    - text: ចូលប្រើដោយសេរី
    - heading "សកម្មភាពរហ័ស" [level=3]
    - link "ទាញយក PDF":
      - /url: /api/publications/journal-of-chemical-education/file?download=1
    - button "Save publication": Save
    - button "Share": ចែករំលែក
    - link "Cite":
      - /url: "#cite-panel"
    - text: 55 ចំនួនមើល 3 ចំនួនទាញយក
    - heading "ដកស្រង់អត្ថបទនេះ" [level=3]
    - button "APA" [pressed]
    - button "MLA"
    - button "Chicago"
    - button "IEEE"
    - button "BibTeX"
    - button "RIS"
    - text: "Shadi Abu-Baker (2026). Review of Guidelines for Laboratory Design: Health, Safety, and Environmental Considerations, 4th Edition. Journal of Chemical Education, 19(6), 1–2. https://doi.org/10.1234/eds"
    - button "ចម្លង"
    - button "TXT"
    - heading "ព័ត៌មានអត្ថបទ" [level=3]
    - term: ប្រភេទ
    - definition: Article
    - term: ទស្សនាវដ្ដី
    - definition: Journal of Chemical Education
    - term: លេខភាគ
    - definition: 19 (6)
    - term: ទំព័រ
    - definition: 1–2
    - term: អ្នកបោះពុម្ពផ្សាយ
    - definition: American Chemical Society — Division of Chemical Education
    - term: ISBN
    - definition: 978-0-470-50552-6
    - term: DOI
    - definition:
      - link "10.1234/eds":
        - /url: https://doi.org/10.1234/eds
    - term: ភាសា
    - definition: English
    - term: ថ្ងៃបោះពុម្ពផ្សាយ
    - definition: 4 July 2026
    - term: អាជ្ញាប័ណ្ណ
    - definition: CC BY 44
    - term: កម្មសិទ្ធិបញ្ញា
    - definition: Copyright © 2014 The American Chemical Society and Division of Chemical Education, Inc.
    - button "ត្រឡប់ទៅលើ"
  - region "អត្ថបទពាក់ព័ន្ធ":
    - text: អានបន្ត
    - heading "អត្ថបទពាក់ព័ន្ធ" [level=2]
    - paragraph: អត្ថបទផ្សេងទៀតដែលអ្នកអាចចាប់អារម្មណ៍
    - link "មើលទាំងអស់":
      - /url: /km/publications
    - paragraph: រកមិនឃើញអត្ថបទពាក់ព័ន្ធនៅឡើយទេ។
  - region "សៀវភៅស្រដៀងគ្នាពីបណ្ណាល័យ":
    - text: សៀវភៅណែនាំ
    - heading "សៀវភៅស្រដៀងគ្នាពីបណ្ណាល័យ" [level=2]
    - paragraph: សៀវភៅក្នុងបណ្ណាល័យ PTEC ដែលពាក់ព័ន្ធនឹងអត្ថបទនេះ
    - link "រកមើលបណ្ណាល័យ":
      - /url: /km/books
    - article:
      - link "Cover of តេស្ត PISA D វិទ្យាសាស្ត្រ កម្មវិធី PISA តេស្ត PISA D វិទ្យាសាស្ត្រ ក្រសួងអប់រំយុវជន និងកីឡា 28 · 4 មើល":
        - /url: /km/books/pisa-d
        - img "Cover of តេស្ត PISA D វិទ្យាសាស្ត្រ"
        - text: កម្មវិធី PISA
        - heading "តេស្ត PISA D វិទ្យាសាស្ត្រ" [level=3]
        - paragraph: ក្រសួងអប់រំយុវជន និងកីឡា
        - text: 28 · 4 មើល
    - article:
      - link "Cover of Action Research in Practice ស្រាវជ្រាវសកម្មភាព Action Research in Practice Ortrun Zuber-Skerritt (ed.) 18 · 2 មើល":
        - /url: /km/books/action-research-in-practice
        - img "Cover of Action Research in Practice"
        - text: ស្រាវជ្រាវសកម្មភាព
        - heading "Action Research in Practice" [level=3]
        - paragraph: Ortrun Zuber-Skerritt (ed.)
        - text: 18 · 2 មើល
    - article:
      - 'link "Cover of Student Statistics: Challenges in Data Collection Processes ស្ថិតិ និងវិភាគទិន្នន័យ Student Statistics: Challenges in Data Collection Processes Naroath 23 · 2 មើល"':
        - /url: /km/books/student-statistics-challenges-in-data-collection-processes
        - 'img "Cover of Student Statistics: Challenges in Data Collection Processes"'
        - text: ស្ថិតិ និងវិភាគទិន្នន័យ
        - 'heading "Student Statistics: Challenges in Data Collection Processes" [level=3]'
        - paragraph: Naroath
        - text: 23 · 2 មើល
    - article:
      - link "Cover of \"This IS NOT Acceptable\" ថ្មី ភាសាអង់គ្លេសសិក្សា \"This IS NOT Acceptable\" Norbert J. Pienta 1 មើល":
        - /url: /km/books/this-is-not-acceptable
        - img "Cover of \"This IS NOT Acceptable\""
        - text: ថ្មី ភាសាអង់គ្លេសសិក្សា
        - heading "\"This IS NOT Acceptable\"" [level=3]
        - paragraph: Norbert J. Pienta
        - text: 1 មើល
    - article:
      - link "Cover of កម្មវិធីសិក្សាលម្អិតវិធីសាស្ត្របង្រៀនគណិតវិទ្យា ២ គណិតវិទ្យា កម្មវិធីសិក្សាលម្អិតវិធីសាស្ត្របង្រៀនគណិតវិទ្យា ២ PTEC 4 · 1 មើល":
        - /url: /km/books/book-1781238129420
        - img "Cover of កម្មវិធីសិក្សាលម្អិតវិធីសាស្ត្របង្រៀនគណិតវិទ្យា ២"
        - text: គណិតវិទ្យា
        - heading "កម្មវិធីសិក្សាលម្អិតវិធីសាស្ត្របង្រៀនគណិតវិទ្យា ២" [level=3]
        - paragraph: PTEC
        - text: 4 · 1 មើល
    - article:
      - link "Cover of Qualitative Research ស្រាវជ្រាវបែបគុណភាព Qualitative Research Frances Julia Riemer, Marylynn T. Quartaroli, Stephen D. Lapan 9 · 1 មើល":
        - /url: /km/books/qualitative-research
        - img "Cover of Qualitative Research"
        - text: ស្រាវជ្រាវបែបគុណភាព
        - heading "Qualitative Research" [level=3]
        - paragraph: Frances Julia Riemer, Marylynn T. Quartaroli, Stephen D. Lapan
        - text: 9 · 1 មើល
- contentinfo:
  - region "PTEC Library":
    - img "PTEC Seal"
    - paragraph: បណ្ណាល័យវិទ្យាស្ថានគរុកោសល្យរាជធានីភ្នំពេញ
    - heading "PTEC Library" [level=2]
    - paragraph: វិទ្យាស្ថានគរុកោសល្យរាជធានីភ្នំពេញ ត្រូវបានបង្កើតឡើងដើម្បីបណ្តុះបណ្តាលគ្រូបង្រៀនប្រកបដោយគុណភាពអប់រំ ដើម្បីដឹកនាំសិស្សានុសិស្សឆ្ពោះទៅកាន់អនាគតដ៏ភ្លឺស្វាង ដោយគ្មានការរើសអើង។
    - link "Facebook":
      - /url: https://web.facebook.com/ptec.edu
    - link "YouTube":
      - /url: https://www.youtube.com/@phnompenhteachereducationc3430
    - link "គេហទំព័រផ្លូវការ PTEC":
      - /url: https://www.ptec.edu.kh
    - button "ដំឡើងកម្មវិធី"
  - region "រុករក":
    - heading "រុករក" [level=2]
    - list:
      - listitem:
        - link "សៀវភៅ":
          - /url: /km/books
      - listitem:
        - link "សារណា / និក្ខេបបទ":
          - /url: /km/theses
      - listitem:
        - link "អត្ថបទសិក្សា":
          - /url: /km/publications
      - listitem:
        - link "ផ្លូវសិក្សា":
          - /url: /km/paths
      - listitem:
        - link "សៀវភៅក្នុងបណ្ណាល័យ":
          - /url: /km/catalogs
      - listitem:
        - link "ព័ត៌មាន និងព្រឹត្តិការណ៍":
          - /url: /km/posts
  - region "ជំនួយ និងព័ត៌មាន":
    - heading "ជំនួយ និងព័ត៌មាន" [level=2]
    - list:
      - listitem:
        - link "អំពីយើង":
          - /url: /km/about
      - listitem:
        - link "ដំណើររបស់យើង":
          - /url: /km/about/our-journey
      - listitem:
        - link "ទំនាក់ទំនង":
          - /url: /km/contact
      - listitem:
        - link "បទបញ្ជាបណ្ណាល័យ":
          - /url: /km/about/rules
      - listitem:
        - link "ម៉ោងបម្រើសេវាកម្ម":
          - /url: /km/about/timings
      - listitem:
        - link "បណ្ដុំឯកសារបណ្ណាល័យ":
          - /url: /km/about/collection
      - listitem:
        - link "គណៈកម្មការបណ្ណាល័យ":
          - /url: /km/about/committee
      - listitem:
        - link "ក្រុមការងារបណ្ណាល័យ":
          - /url: /km/about/team
      - listitem:
        - link "គោលការណ៍ឯកជនភាព":
          - /url: /km/privacy
      - listitem:
        - link "គោលការណ៍ប្រើប្រាស់":
          - /url: /km/policy
  - region "មកកាន់ PTEC":
    - heading "មកកាន់ PTEC" [level=2]
    - paragraph: ទីតាំង
    - text: ផ្លូវ ២៧១ សង្កាត់ទឹកល្អក់៣ ខណ្ឌទួលគោក រាជធានីភ្នំពេញ ព្រះរាជាណាចក្រកម្ពុជា
    - paragraph: លេខទូរស័ព្ទ
    - link "(+855) 92 788 990":
      - /url: tel:+85592788990
    - paragraph: អ៊ីមែល
    - link "info@ptec.edu.kh":
      - /url: mailto:info@ptec.edu.kh
    - paragraph: ម៉ោងធ្វើការ
    - text: "ច័ន្ទ – សុក្រ: ម៉ោង ៧:០០ ព្រឹក – ៥:០០ ល្ងាច · សៅរ៍: ៨:០០ ព្រឹក – ៤:០០ រសៀល (ថ្ងៃអាទិត្យ: បិទ)"
    - iframe
    - link "មើលផែនទី":
      - /url: https://www.google.com/maps/place/Phnom+Penh+Teacher+Education+College/@11.5574509,104.8872382,1090m/data=!3m1!1e3!4m6!3m5!1s0x310951a618265c67:0x159b1d2bb350bbae!8m2!3d11.5568858!4d104.8872782!16s%2Fg%2F1q665w1lh
  - paragraph: រក្សាសិទ្ធិគ្រប់យ៉ាង © 2026 បណ្ណាល័យ PTEC។ — វិទ្យាស្ថានគរុកោសល្យរាជធានីភ្នំពេញ។
  - navigation "ច្បាប់ និងគោលការណ៍":
    - link "គោលការណ៍ឯកជនភាព":
      - /url: /km/privacy
    - link "គោលការណ៍ប្រើប្រាស់":
      - /url: /km/policy
- button "សួរជំនួយការបណ្ណាល័យ"
- alert
- 'dialog "សេចក្តីសង្ខេប: Review of Guidelines for Laboratory Design: Health, Safety, and Environmental Considerations, 4th Edition"':
  - banner:
    - paragraph: របៀបអានពេញអេក្រង់
    - 'heading "សេចក្តីសង្ខេប: Review of Guidelines for Laboratory Design: Health, Safety, and Environmental Considerations, 4th Edition" [level=2]'
    - group "ឧបករណ៍កំណត់ការអានសេចក្តីសង្ខេប":
      - button "បន្ថយទំហំអក្សរ"
      - tooltip "បន្ថយទំហំអក្សរ"
      - button "ទំហំអក្សរបច្ចុប្បន្ន៖ 100%. កំណត់ទំហំអក្សរទៅដើម"
      - button "ពង្រីកទំហំអក្សរ"
      - button "បិទកម្មវិធីអានសេចក្តីសង្ខេប"
    - status: ទំហំអក្សរ 100%
  - main:
    - article:
      - region "សេចក្តីសង្ខេបជាភាសាអង់គ្លេស":
        - heading "សេចក្តីសង្ខេបជាភាសាអង់គ្លេស" [level=3]
        - paragraph: "When Guidelines for Laboratory Design: Health, Safety, and Environmental Considerations, 4th ed. was written, the goal was to make it easier for lab users and designers to meet the many challenges and considerations inherent in laboratory design, such as complying with health, safety, and environmental requirements. The book emphasizes the critical nature of the communication between the laboratory users, construction engineers, administration, and environmental health and safety personnel for a successful lab design. Such a design provides the best place for scientists to engage in research or teaching with reduced health and safety risks, as has been discussed in this Journal. (1, 2) The authors make it quite clear that a safe and efficient lab does not come about just by hiring the best in the business, but through clear communication and genuine cooperation between all parties involved, including those who will be working in the lab."
        - paragraph: Cover image provided by Wiley and reproduced with permission. Reading and learning from a book of this kind with so many technical details and recommendations can easily overwhelm any reader. Credit should be given to the authors for their thoughtfulness in organizing the information in a rather unique fashion. Methods of organization such as listing identical topics under the same numerical designation make navigating the book unexpectedly easier, despite the many details. The appendices, table of units, and explanations for abbreviations and the like are helpful to those who are not familiar with some technical verbatim used in the book.
        - paragraph:
          - text: Guidelines for Laboratory Design is by far one of the best in terms of layout, comprehension, and material. It is written by a group of experts who represent all aspects critical for lab design, safety, and operation. The book is organized neatly and systemically, starting with guidelines common for all types of laboratories. Discussion then moves to the distinction between new construction projects and renovation projects before it details the guidelines and considerations for specialized laboratories. The current edition is updated with relevant information pertinent to typical and highly advanced laboratories. The book makes a clear distinction between general purpose and highly specialized laboratories, and further suggests unique or specialized labs that may be designed using a combination of the guidelines presented for both.
          - link "ឯកសារយោង 1":
            - /url: "#reference-ref-1nkt5fa"
            - text: "1"
        - paragraph: This book is organized in six parts. In the first part, the common elements of lab design and renovation are discussed, including building and laboratory considerations. In the second part, the design guidelines for a number of commonly used laboratories are discussed, including lab layout, heating, ventilation and air conditioning, loss prevention, industrial hygiene, personal safety, and other special considerations. We are pleased to see that 20 specific labs that cover a broad spectrum of end users are described in detail in this section, including general chemistry, clinical, teaching, physics, animal research, pathology, anatomy, radiation, engineering, and nanotechnology labs, as well as many others. In the third part of the book, the layout and specifications of lab support service facilities and purpose-specific rooms such as support shops and storerooms and waste handling are described in detail. In the fourth part, a general description of installing the heating, ventilation, and air conditioning (HVAC) systems are discussed. In the fifth part, administrative procedures are described, including the project execution and bidding formalities, commissioning and final acceptance criteria, and sustainable laboratory design. And finally, part six contains appendices and matrix tables related to safety items such as emergency showers, eyewash stations, warning signs, and checklists for health and safety.
        - paragraph:
          - text: In the section of the book dealing with general and analytical laboratories, excellent suggestions are offered for designing a new building, as well as providing a wide range of choices for renovating just a single lab or a whole building. Several suggestions cover details such as placement of tables, counters, and other general laboratory furniture. In this section, one may find a variety of issues for these laboratories. One noteworthy point is to avoid having very sensitive instruments placed in the same area where many chemicals are in use on a daily basis. Another useful suggestion is to consider caution regarding safety; there are instances where a combination of nontoxic chemicals can generate a toxic substance; therefore, proper chemical storage and handling should be taken seriously. Because general and analytical laboratories are not normally designed to handle extremely hazardous material, the book gives a list of situations, dealing with carcinogenic materials, for example, that must be avoided and the list is a good reference resource for those who are new to the profession. The authors provide alternative choices to laboratory designs to meet the specific needs of users. These designs give specific suggestions regarding the location of equipment such as fume hoods, bulky instruments, benches, and space gaps for a safe working environment with ease of accessibility. Training of personnel in proper use of facilities and handling of safety equipment and dangerous substances is a must, especially in an academic environment in which a majority of users are untrained students. The authors’ recommendation of the separation of laboratories from office space is good, but in academic settings, especially in smaller institutions, this is not always possible.
          - link "ឯកសារយោង 2":
            - /url: "#reference-ref-1dx1rvg"
            - text: "2"
          - text: The possibility of construction and use of laboratories with restricted access will probably increase in the near future. Perhaps the authors should have addressed these types of laboratories in a separate section of the book rather than suggesting that the designers use of a combination of the guidelines of other types of laboratories.
        - paragraph: "An area that needs some more detail is designing laboratories for future upgrades: for example, a BSL2 biomedical sciences laboratory intended for upgrade to BSL3 facility in the near future. Furthermore, we would like to see (in the next edition?) several economic versions of laboratory design guidelines, if possible. In today’s world, it is common to see unpredictable cuts for construction projects and the presence of such guidelines would allow the shift to a more economic version of these facilities."
        - paragraph: The authors acknowledge the use of elaborate and technical language across the spectrum of those involved in the process, for example, environmental health and safety, architect and design engineers, scientists and other end users. For ease of readability by those involved, we recommend that the appendices include a summary of guidelines of interest to each group, especially the scientists or end users.
        - paragraph: Chapters 1–5 and 16 may be of great interest and value to readers of this Journal. Writing a book of this kind is a challenge, and we commend the authors for a job very well done. We admired the inclusive nature of the book, and we appreciate the authors sharing their expertise. Perhaps the publishers could provide a customized version of this book, including just the chapters appropriate for a specific audience, such as chemists or biologists.
        - paragraph: In summary, this edition of the book addresses a broad spectrum of end users including administrators, researchers, instructors, engineers, and environment health officers. The book is a useful comprehensive reference for academic institutions, but perhaps not for individual instructors.
```

# Test source

```ts
  1   | import { expect, test, type Page } from "@playwright/test";
  2   | import AxeBuilder from "@axe-core/playwright";
  3   | 
  4   | const PUBLICATION_PATH = "/publications/journal-of-chemical-education";
  5   | 
  6   | async function openPublicationReader(page: Page, locale: "en" | "km" = "en") {
  7   |   const prefix = locale === "km" ? "/km" : "";
  8   |   // Publication detail is streamed while remote metadata/auth calls settle;
  9   |   // waiting for `commit` avoids coupling this feature test to those requests.
  10  |   await page.goto(`${prefix}${PUBLICATION_PATH}`, { waitUntil: "commit", timeout: 20_000 });
  11  |   const openName = locale === "km"
  12  |     ? "បើកកម្មវិធីអានសេចក្តីសង្ខេប"
  13  |     : "Open abstract reader";
  14  |   const trigger = page.getByRole("button", { name: openName });
  15  |   await trigger.waitFor({ state: "visible", timeout: 30_000 }).catch(() => {});
  16  |   test.skip((await trigger.count()) === 0, "No publication abstract is available in this environment");
  17  |   await trigger.scrollIntoViewIfNeeded();
  18  |   await trigger.click();
  19  |   const dialog = page.getByRole("dialog");
  20  |   await expect(dialog).toBeVisible();
  21  |   return { dialog, trigger };
  22  | }
  23  | 
  24  | test.describe("Publication abstract reader", () => {
  25  |   test.describe.configure({ mode: "serial", timeout: 90_000 });
  26  | 
  27  |   test.beforeEach(async ({ page }) => {
  28  |     await page.addInitScript(() => {
  29  |       try {
  30  |         localStorage.removeItem("ptec.abstractReader.textSize");
  31  |       } catch {}
  32  |     });
  33  |   });
  34  | 
  35  |   test("opens without the native Fullscreen API, traps focus, persists zoom, and closes with Escape", async ({ page }) => {
  36  |     const { dialog, trigger } = await openPublicationReader(page);
  37  |     await expect(dialog).toHaveAttribute("aria-modal", "true");
  38  |     await expect(page.getByText("Fullscreen reading mode", { exact: true })).toBeVisible();
  39  |     await expect(page.getByRole("button", { name: "Decrease text size" }).last()).toBeFocused();
  40  | 
  41  |     const bodyLock = await page.evaluate(() => ({
  42  |       overflow: document.body.style.overflow,
  43  |       position: document.body.style.position,
  44  |     }));
  45  |     expect(bodyLock).toEqual({ overflow: "hidden", position: "fixed" });
  46  | 
  47  |     await page.getByRole("button", { name: "Increase text size" }).last().click();
  48  |     await expect(dialog.getByRole("button", { name: /Current text size: 110%/ })).toBeVisible();
  49  |     await dialog.getByRole("button", { name: "Close abstract reader" }).press("Escape");
  50  |     await expect(dialog).toBeHidden();
  51  |     await expect(trigger).toBeFocused();
  52  | 
  53  |     await page.reload({ waitUntil: "domcontentloaded" });
  54  |     await expect(page.getByRole("button", { name: /Current text size: 110%/ })).toBeVisible();
  55  |   });
  56  | 
  57  |   test("has no horizontal overflow and keeps 44px controls at supported viewport sizes", async ({ page }) => {
  58  |     await page.setViewportSize({ width: 360, height: 800 });
  59  |     const { dialog } = await openPublicationReader(page);
  60  | 
  61  |     const viewports = [
  62  |       { width: 360, height: 800 },
  63  |       { width: 390, height: 844 },
  64  |       { width: 768, height: 1024 },
  65  |       { width: 1440, height: 900 },
  66  |       { width: 1920, height: 1080 },
  67  |     ];
  68  | 
  69  |     for (const viewport of viewports) {
  70  |       await page.setViewportSize(viewport);
  71  |       const dimensions = await dialog.evaluate((element) => {
  72  |         const scrollRegion = element.querySelector("main");
  73  |         const controls = [...element.querySelectorAll<HTMLButtonElement>("button")].map((button) => {
  74  |           const rect = button.getBoundingClientRect();
  75  |           return { width: rect.width, height: rect.height, left: rect.left, right: rect.right };
  76  |         });
  77  |         return {
  78  |           dialogScrollWidth: element.scrollWidth,
  79  |           dialogClientWidth: element.clientWidth,
  80  |           contentScrollWidth: scrollRegion?.scrollWidth ?? 0,
  81  |           contentClientWidth: scrollRegion?.clientWidth ?? 0,
  82  |           controls,
  83  |         };
  84  |       });
  85  | 
  86  |       expect(dimensions.dialogScrollWidth).toBeLessThanOrEqual(dimensions.dialogClientWidth + 1);
  87  |       expect(dimensions.contentScrollWidth).toBeLessThanOrEqual(dimensions.contentClientWidth + 1);
  88  |       for (const control of dimensions.controls) {
  89  |         expect(control.height).toBeGreaterThanOrEqual(44);
  90  |         expect(control.width).toBeGreaterThanOrEqual(44);
  91  |         expect(control.left).toBeGreaterThanOrEqual(-1);
  92  |         expect(control.right).toBeLessThanOrEqual(viewport.width + 1);
  93  |       }
  94  |     }
  95  |   });
  96  | 
  97  |   test("exposes the localized Khmer reader and passes an open-dialog axe scan", async ({ page }) => {
  98  |     const { dialog } = await openPublicationReader(page, "km");
  99  |     await expect(page.getByText("របៀបអានពេញអេក្រង់", { exact: true })).toBeVisible();
  100 |     await expect(dialog.getByRole("button", { name: "ពង្រីកទំហំអក្សរ" })).toBeVisible();
> 101 |     await expect(dialog.locator('article > section[lang="km"]').first()).toBeVisible();
      |                                                                          ^ Error: expect(locator).toBeVisible() failed
  102 | 
  103 |     const results = await new AxeBuilder({ page })
  104 |       .include('[role="dialog"]')
  105 |       .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
  106 |       .analyze();
  107 |     expect(results.violations).toEqual([]);
  108 |   });
  109 | });
  110 | 
```