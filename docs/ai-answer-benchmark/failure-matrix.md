# AI answer benchmark — failure matrix

Generated 2026-09-11T13:28:44.062Z · mock model · corpus: 268 published books, labelled 2026-09-10 · 2 of 123 questions failing

## [B] def-012 — definition

| | |
|---|---|
| question | What is literature review? |
| expected intent | pdf_question / general_knowledge |
| predicted intent | pdf_question (ok), confidence 0.75 |
| normalized query / topic | literature review (frame: definition, language: en) |
| entities detected | titles: —; isbn: —; compare: — |
| retrieval strategy | evidence:hybrid (mode hybrid), candidates 25, semantic true, entity — |
| retrieved documents | social-research-methods-4th-edition, research-design-qualitative-quantitative-and-mixed-methods-3rd-edition, how-to-design-and-evaluate-research-in-education-8th-edition, research-design-quantitative-qualitative-and-arts-based-approaches |
| selected context | 5 passage(s), 0 work(s), 0 fact(s), ~975 input tokens |
| prompt policy | locale en, verbosity normal, evidence yes |
| model output | generated, 503 chars — According to the retrieved PTEC Library materials: portant websites where key information can be gleaned. I also discuss in Chapter 5 the use of the Internet as a route for finding references for your |
| citations | grounded 0, hallucinated 0, quoted 0, attached 2 — social-research-methods-4th-edition, research-design-qualitative-quantitative-and-mixed-methods-3rd-edition |
| expected evidence | research-methods-in-education-8th-edition, english-for-writing-research-papers-2nd-edition, qualitative-inquiry-and-research-design-4th-edition, essentials-of-research-design-and-methodology, action-research-series-volume-3, qualitative-research-from-start-to-finish |
| actual failure | 5 passage(s) were retrieved and none came from a source that answers the question |
| failure stage | B — RETRIEVAL |
| proposed fix | lib/ai/retrieval.ts and the term extraction feeding it (queryTerms / extractQuery) |

Ranked passages:

| # | record | page | match | score | signals |
|---|---|---|---|---|---|
| 1 | Social Research Methods (4th Edition) | 36–38 | pdf_exact | 0.0264 | {"lexical":12,"density":68.5,"definition":false,"rrf":0.015151515151515152} |
| 2 | Research Design: Qualitative, Quantitative and Mixed Methods (3rd Edition) | 59 | pdf_exact | 0.0261 | {"lexical":15,"density":48,"definition":true,"rrf":0.016129032258064516} |
| 3 | How to Design and Evaluate Research in Education (8th Edition) | 27 | pdf_exact | 0.0259 | {"lexical":15,"density":40.5,"definition":true,"rrf":0.015873015873015872} |
| 4 | Social Research Methods (4th Edition) | 12 | pdf_exact | 0.0196 | {"lexical":12,"density":68.5,"definition":false,"rrf":0.015625} |
| 5 | Research Design: Quantitative, Qualitative and Arts-Based Approaches | 12 | pdf_exact | 0.0185 | {"lexical":12,"density":53,"definition":false,"rrf":0.014492753623188406} |

## [B] multi-002 — multi_document

| | |
|---|---|
| question | Across the library's books, how is literature review handled? |
| expected intent | pdf_question |
| predicted intent | pdf_question (ok), confidence 0.7 |
| normalized query / topic | literature review (frame: evidence, language: en) |
| entities detected | titles: —; isbn: —; compare: — |
| retrieval strategy | evidence:hybrid (mode hybrid), candidates 25, semantic true, entity — |
| retrieved documents | social-research-methods-4th-edition, research-design-quantitative-qualitative-and-arts-based-approaches, research-design-qualitative-quantitative-and-mixed-methods-3rd-edition |
| selected context | 5 passage(s), 0 work(s), 0 fact(s), ~1105 input tokens |
| prompt policy | locale en, verbosity normal, evidence yes |
| model output | generated, 466 chars — According to the retrieved PTEC Library materials: …What is meant by ‘social research’? 4 Why do social research? 5 The context of social research methods 5 Elements of the process of social research  |
| citations | grounded 0, hallucinated 0, quoted 0, attached 2 — social-research-methods-4th-edition |
| expected evidence | research-methods-in-education-8th-edition, english-for-writing-research-papers-2nd-edition, qualitative-inquiry-and-research-design-4th-edition, essentials-of-research-design-and-methodology, action-research-series-volume-3, qualitative-research-from-start-to-finish |
| actual failure | 5 passage(s) were retrieved and none came from a source that answers the question |
| failure stage | B — RETRIEVAL |
| proposed fix | lib/ai/retrieval.ts and the term extraction feeding it (queryTerms / extractQuery) |

Ranked passages:

| # | record | page | match | score | signals |
|---|---|---|---|---|---|
| 1 | Social Research Methods (4th Edition) | 12 | pdf_exact | 0.0204 | {"lexical":12,"density":68.5,"definition":false,"rrf":0.01639344262295082} |
| 2 | Social Research Methods (4th Edition) | 36–38 | pdf_exact | 0.0201 | {"lexical":12,"density":68.5,"definition":false,"rrf":0.015625} |
| 3 | Research Design: Quantitative, Qualitative and Arts-Based Approaches | 12 | pdf_exact | 0.0189 | {"lexical":12,"density":53,"definition":false,"rrf":0.014925373134328358} |
| 4 | Research Design: Quantitative, Qualitative and Arts-Based Approaches | 15–17 | pdf_exact | 0.0187 | {"lexical":12,"density":53,"definition":false,"rrf":0.014285714285714285} |
| 5 | Research Design: Qualitative, Quantitative and Mixed Methods (3rd Edition) | 11 | pdf_exact | 0.0177 | {"lexical":12,"density":48,"definition":false,"rrf":0.0136986301369863} |
