# AI answer benchmark — failure matrix

Generated 2026-09-11T14:01:01.703Z · live provider · corpus: 268 published books, labelled 2026-09-10 · 4 of 24 questions failing

## [E] cmp-005 — comparison

| | |
|---|---|
| question | Compare "English for Writing Research Papers" and "Essentials of Research Design and Methodology" |
| expected intent | document_compare |
| predicted intent | document_compare (ok), confidence 0.85 |
| normalized query / topic | Compare "English for Writing Research Papers" and "Essentials of Research Design and Methodology" (frame: comparison, language: en) |
| entities detected | titles: English for Writing Research Papers; Essentials of Research Design and Methodology; isbn: —; compare: English for Writing Research Papers vs Essentials of Research Design and Methodology |
| retrieval strategy | evidence:document-comparison (mode multi_document), candidates 8, semantic true, entity — |
| retrieved documents | english-for-writing-research-papers, essentials-of-research-design-and-methodology |
| selected context | 4 passage(s), 2 work(s), 0 fact(s), ~744 input tokens |
| prompt policy | locale en, verbosity detailed, evidence yes |
| model output | refusal, 1210 chars — I couldn’t find enough evidence in the PTEC Library to answer that confidently. However, here is what the library holds and discusses regarding these two books: **English for Writing Research Papers* |
| citations | grounded 4, hallucinated 0, quoted 0, attached 4 — english-for-writing-research-papers, essentials-of-research-design-and-methodology |
| expected evidence | english-for-writing-research-papers, essentials-of-research-design-and-methodology |
| actual failure | evidence reached the prompt and the answer still refused |
| failure stage | E — PROMPT |
| proposed fix | check the mode rider for this intent — an instruction that contradicts the evidence it is handed (lib/ai/prompts.ts) |

Ranked passages:

| # | record | page | match | score | signals |
|---|---|---|---|---|---|
| 1 | English for Writing Research Papers | 4 | semantic | 0.0164 | {"semantic":0.717756628990173,"rrf":0.01639344262295082} |
| 2 | Essentials of Research Design and Methodology | 37 | semantic | 0.0315 | {"semantic":0.721318802872861,"rrf":0.03149801587301587} |
| 3 | Essentials of Research Design and Methodology | 25 | pdf_exact | 0.0204 | {"lexical":4,"density":69.5,"definition":false,"rrf":0.01639344262295082} |
| 4 | Essentials of Research Design and Methodology | 2 | semantic | 0.0164 | {"semantic":0.75158324097345,"rrf":0.01639344262295082} |

## [G] single-002 — single_document

| | |
|---|---|
| question | What does this book say about formative assessment? |
| expected intent | pdf_question |
| predicted intent | pdf_question (ok), confidence 0.75 |
| normalized query / topic | What does this book say about formative assessment (frame: none, language: en) |
| entities detected | titles: —; isbn: —; compare: — |
| retrieval strategy | evidence:scoped (mode scoped), candidates 24, semantic true, entity — |
| retrieved documents | pedagogy-and-practice-leadership-guide |
| selected context | 4 passage(s), 0 work(s), 0 fact(s), ~1020 input tokens |
| prompt policy | locale en, verbosity normal, evidence yes |
| model output | generated, 399 chars — The PTEC Library holds the guide "Pedagogy and Practice: Leadership Guide," which discusses formative assessment and assessment for learning. This work says that for feedback to be effective, it "shou |
| citations | grounded 0, hallucinated 0, quoted 0, attached 0 — — |
| expected evidence | pedagogy-and-practice-leadership-guide |
| actual failure | the answer has substance but carries no citation that survived grounding |
| failure stage | G — CITATION |
| proposed fix | lib/ai/guardrails.ts enforceGrounding + the citation format the rider asks for |

Ranked passages:

| # | record | page | match | score | signals |
|---|---|---|---|---|---|
| 1 | Pedagogy and Practice: Leadership Guide | 411–412 | pdf_exact | 0.0462 | {"lexical":2,"density":6,"definition":false,"semantic":0.708804888058001,"rrf":0.04560453004299347} |
| 2 | Pedagogy and Practice: Leadership Guide | 83–85 | pdf_exact | 0.0460 | {"lexical":2,"density":6,"definition":false,"semantic":0.704240861914238,"rrf":0.04536505445183319} |
| 3 | Pedagogy and Practice: Leadership Guide | 406 | pdf_exact | 0.0307 | {"lexical":2,"density":6,"definition":false,"semantic":0.718069553375244,"rrf":0.030090497737556562} |
| 4 | Pedagogy and Practice: Leadership Guide | 464–465 | pdf_exact | 0.0290 | {"lexical":2,"density":6,"definition":false,"rrf":0.028381642512077296,"semantic":0.707315700810213} |

## [A] v2-typo-003 — typo

| | |
|---|---|
| question | What is validty? |
| expected intent | pdf_question / general_knowledge |
| predicted intent | pdf_question (ok), confidence 0.75 |
| normalized query / topic | validty (frame: definition, language: en) |
| entities detected | titles: —; isbn: —; compare: — |
| retrieval strategy | evidence:hybrid (mode hybrid), candidates 0, semantic false, entity — |
| retrieved documents | — |
| selected context | 0 passage(s), 0 work(s), 0 fact(s), ~0 input tokens |
| prompt policy | locale en, verbosity normal, evidence no |
| model output | refusal, 140 chars — I couldn’t find enough evidence in the PTEC Library to answer that confidently. Try asking more specifically, or name the document you mean. |
| citations | grounded 0, hallucinated 0, quoted 0, attached 0 — — |
| expected evidence | qualitative-research-from-start-to-finish, qualitative-inquiry-and-research-design-4th-edition, research-methods-in-education-8th-edition, english-for-writing-research-papers-2nd-edition, essentials-of-research-design-and-methodology, how-to-design-and-evaluate-research-in-education-8th-edition |
| actual failure | a canned template answered a question that needed evidence |
| failure stage | A — QUERY_UNDERSTANDING |
| proposed fix | deterministicAnswer() in lib/ai/plan.ts, or the intent that routed here |

## [G] v2-cmp-001 — comparison

| | |
|---|---|
| question | What is the difference between validity and reliability? |
| expected intent | document_compare |
| predicted intent | document_compare (ok), confidence 0.85 |
| normalized query / topic | difference between validity and reliability (frame: comparison, language: en) |
| entities detected | titles: validity; reliability; isbn: —; compare: validity vs reliability |
| retrieval strategy | evidence:concept-comparison (mode multi_document), candidates 54, semantic true, entity — |
| retrieved documents | research-methods-in-education-8th-edition, essentials-of-research-design-and-methodology, social-research-methods-qualitative-and-quantitative-7th-edition |
| selected context | 6 passage(s), 0 work(s), 1 fact(s), ~1416 input tokens |
| prompt policy | locale en, verbosity normal, evidence yes |
| model output | generated, 171 chars — According to the PTEC Library, validity represents the soundness of a research design or instrument to ensure that findings are accurate, meaningful, and able to withstand |
| citations | grounded 0, hallucinated 0, quoted 0, attached 0 — — |
| expected evidence | qualitative-inquiry-and-research-design-4th-edition, research-methods-in-education-8th-edition, essentials-of-research-design-and-methodology, how-to-design-and-evaluate-research-in-education-8th-edition, qualitative-research-from-start-to-finish, english-for-writing-research-papers-2nd-edition, methods-in-educational-research-from-theory-to-practice, from-teacher-to-manager-managing-language-teaching-organizations |
| actual failure | the answer has substance but carries no citation that survived grounding |
| failure stage | G — CITATION |
| proposed fix | lib/ai/guardrails.ts enforceGrounding + the citation format the rider asks for |

Ranked passages:

| # | record | page | match | score | signals |
|---|---|---|---|---|---|
| 1 | Research Methods in Education (8th Edition) | 274–275 | semantic | 0.0303 | {"semantic":0.724720001220708,"rrf":0.030309988518943745} |
| 2 | Essentials of Research Design and Methodology | 38 | pdf_exact | 0.0264 | {"lexical":14,"density":95,"definition":true,"rrf":0.01639344262295082} |
| 3 | Essentials of Research Design and Methodology | 81–82 | pdf_exact | 0.0261 | {"lexical":14,"density":95,"definition":true,"rrf":0.015873015873015872} |
| 4 | Social Research Methods: Qualitative and Quantitative (7th Edition) | 217–219 | pdf_exact | 0.0262 | {"lexical":14,"density":38,"definition":true,"rrf":0.015873015873015872} |
| 5 | Essentials of Research Design and Methodology | 25 | pdf_exact | 0.0247 | {"lexical":14,"density":31,"definition":true,"rrf":0.015625} |
| 6 | Essentials of Research Design and Methodology | 117 | pdf_exact | 0.0245 | {"lexical":14,"density":31,"definition":true,"rrf":0.015384615384615385} |
