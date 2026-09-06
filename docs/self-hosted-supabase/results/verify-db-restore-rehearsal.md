# Database verification report (20260906-091913)

- cloud snapshot: `before.txt`
- self-hosted snapshot: `after-restore.txt`
- verdict: **DIFFERENCES FOUND — review /private/tmp/claude-501/-Users-mac-Downloads-e-library-ptec/aa486efa-9385-48c5-90c4-7b4ecbb4ee6e/scratchpad/wt-selfhost/reports/migration/verify/diff-20260906-091913.txt**

## Row counts

| table | cloud | self-hosted | ok |
|---|---|---|---|
| auth.identities | 4 | 4 | ✓ |
| auth.mfa_factors | 1 | 1 | ✓ |
| auth.users | 4 | 4 | ✓ |
| public.activity_events | 0 | 0 | ✓ |
| public.admin_audit_log | 0 | 0 | ✓ |
| public.ai_usage | 0 | 0 | ✓ |
| public.alert_deliveries | 0 | 0 | ✓ |
| public.announcement_delivery_jobs | 0 | 0 | ✓ |
| public.announcement_push_deliveries | 0 | 0 | ✓ |
| public.announcement_status_history | 0 | 0 | ✓ |
| public.announcement_templates | 0 | 0 | ✓ |
| public.announcements | 2 | 2 | ✓ |
| public.app_events | 0 | 0 | ✓ |
| public.authors | 4 | 4 | ✓ |
| public.book_annotations | 0 | 0 | ✓ |
| public.book_chunks | 0 | 0 | ✓ |
| public.book_files | 1 | 1 | ✓ |
| public.book_import_runs | 0 | 0 | ✓ |
| public.book_notes | 0 | 0 | ✓ |
| public.book_pages | 5 | 5 | ✓ |
| public.book_requests | 0 | 0 | ✓ |
| public.book_slug_redirects | 0 | 0 | ✓ |
| public.books | 6 | 6 | ✓ |
| public.catalog_books | 3 | 3 | ✓ |
| public.catalog_copies | 5 | 5 | ✓ |
| public.catalog_copies_log | 0 | 0 | ✓ |
| public.catalog_import_jobs | 0 | 0 | ✓ |
| public.catalog_slug_redirects | 0 | 0 | ✓ |
| public.categories | 4 | 4 | ✓ |
| public.comment_likes | 0 | 0 | ✓ |
| public.contact_audit_logs | 0 | 0 | ✓ |
| public.contact_messages | 0 | 0 | ✓ |
| public.contact_notes | 0 | 0 | ✓ |
| public.contact_rate_limit | 0 | 0 | ✓ |
| public.contact_replies | 0 | 0 | ✓ |
| public.contact_reply_drafts | 0 | 0 | ✓ |
| public.content_subscriptions | 0 | 0 | ✓ |
| public.content_versions | 0 | 0 | ✓ |
| public.contributors | 0 | 0 | ✓ |
| public.daily_content_downloads | 0 | 0 | ✓ |
| public.daily_content_views | 0 | 0 | ✓ |
| public.daily_user_signups | 1 | 1 | ✓ |
| public.departments | 3 | 3 | ✓ |
| public.download_logs | 0 | 0 | ✓ |
| public.file_health | 0 | 0 | ✓ |
| public.homepage_photos | 0 | 0 | ✓ |
| public.learning_path_enrollments | 0 | 0 | ✓ |
| public.learning_path_modules | 0 | 0 | ✓ |
| public.learning_path_step_progress | 0 | 0 | ✓ |
| public.learning_path_steps | 0 | 0 | ✓ |
| public.learning_paths | 0 | 0 | ✓ |
| public.notification_reads | 0 | 0 | ✓ |
| public.notifications | 0 | 0 | ✓ |
| public.ops_events | 4 | 4 | ✓ |
| public.organizations | 1 | 1 | ✓ |
| public.post_comments | 0 | 0 | ✓ |
| public.post_drafts | 0 | 0 | ✓ |
| public.post_likes | 0 | 0 | ✓ |
| public.post_saves | 0 | 0 | ✓ |
| public.posts | 3 | 3 | ✓ |
| public.profiles | 4 | 4 | ✓ |
| public.publication_affiliations | 3 | 3 | ✓ |
| public.publication_authors | 7 | 7 | ✓ |
| public.publication_authorships | 10 | 10 | ✓ |
| public.publication_drafts | 0 | 0 | ✓ |
| public.publication_figures | 4 | 4 | ✓ |
| public.publication_files | 2 | 2 | ✓ |
| public.publication_reviews | 0 | 0 | ✓ |
| public.publications | 6 | 6 | ✓ |
| public.push_subscriptions | 0 | 0 | ✓ |
| public.rate_limit | 4 | 4 | ✓ |
| public.reader_open_logs | 0 | 0 | ✓ |
| public.reading_list_books | 0 | 0 | ✓ |
| public.reading_list_items | 0 | 0 | ✓ |
| public.reading_lists | 0 | 0 | ✓ |
| public.reading_progress | 0 | 0 | ✓ |
| public.research_academic_years | 8 | 8 | ✓ |
| public.research_cohorts | 8 | 8 | ✓ |
| public.research_faculties | 5 | 5 | ✓ |
| public.research_programs | 3 | 3 | ✓ |
| public.research_report_downloads | 0 | 0 | ✓ |
| public.research_reports | 4 | 4 | ✓ |
| public.resource_contributors | 0 | 0 | ✓ |
| public.resource_files | 0 | 0 | ✓ |
| public.resource_index_state | 1 | 1 | ✓ |
| public.resource_keywords | 0 | 0 | ✓ |
| public.resource_references | 0 | 0 | ✓ |
| public.resource_relations | 0 | 0 | ✓ |
| public.resource_semantic_insights | 0 | 0 | ✓ |
| public.resource_subjects | 0 | 0 | ✓ |
| public.reviews | 0 | 0 | ✓ |
| public.role_permissions | 65 | 65 | ✓ |
| public.saved_books | 0 | 0 | ✓ |
| public.search_curated_results | 0 | 0 | ✓ |
| public.search_queries | 24 | 26 | ✗ |
| public.search_result_clicks | 0 | 0 | ✓ |
| public.search_synonyms | 0 | 0 | ✓ |
| public.search_term_actions | 0 | 0 | ✓ |
| public.security_baselines | 0 | 0 | ✓ |
| public.security_events | 0 | 0 | ✓ |
| public.security_incidents | 0 | 0 | ✓ |
| public.site_setting_versions | 5 | 5 | ✓ |
| public.site_settings | 5 | 5 | ✓ |
| public.storage_objects | 0 | 0 | ✓ |
| public.subjects | 0 | 0 | ✓ |
| public.team_members | 3 | 3 | ✓ |
| public.team_sections | 8 | 8 | ✓ |
| public.thesis_drafts | 0 | 0 | ✓ |
| public.upload_sessions | 0 | 0 | ✓ |
| public.view_logs | 0 | 0 | ✓ |

## Section sizes (lines)

| section | cloud | self-hosted |
|---|---|---|
| extensions | 4 | 4 |
| tables (public) with rls flag | 107 | 107 |
| columns (public) | 1397 | 1397 |
| constraints (public) | 407 | 407 |
| indexes (public) | 376 | 376 |
| functions (public, extension-owned excluded) | 230 | 81 |
| triggers | 52 | 52 |
| views (public) | 12 | 12 |
| policies (public) | 166 | 166 |
| table grants (public) | 289 | 289 |
| realtime publication | 0 | 0 |
| vector columns | 6 | 6 |
| migration history | 87 | 87 |

## DB latency (ms, from the verifying host)

```
cloud:
238 245 248 289 276 256
self-hosted:
347 339 313 323 318 301
```

## Structural diff (sequence values and latency excluded)

```diff
--- /dev/fd/63	2026-09-06 16:19:13
+++ /dev/fd/62	2026-09-06 16:19:13
@@ -213,7 +213,7 @@
 public.role_permissions 65
 public.saved_books 0
 public.search_curated_results 0
-public.search_queries 24
+public.search_queries 26
 public.search_result_clicks 0
 public.search_synonyms 0
 public.search_term_actions 0
@@ -2413,23 +2413,7 @@
 public.view_logs_pkey ON public.view_logs USING btree (id)
 public.view_logs_viewed_at_idx ON public.view_logs USING btree (viewed_at DESC)
 === functions (public, extension-owned excluded)
-array_to_halfvec(double precision[], integer, boolean) secdef=false lang=c md5=f197a8b4e6d4fcec8d6ec2b7ea146833
-array_to_halfvec(integer[], integer, boolean) secdef=false lang=c md5=f197a8b4e6d4fcec8d6ec2b7ea146833
-array_to_halfvec(numeric[], integer, boolean) secdef=false lang=c md5=f197a8b4e6d4fcec8d6ec2b7ea146833
-array_to_halfvec(real[], integer, boolean) secdef=false lang=c md5=f197a8b4e6d4fcec8d6ec2b7ea146833
-array_to_sparsevec(double precision[], integer, boolean) secdef=false lang=c md5=46287b30c09930284d5cdb22bbf0eefb
-array_to_sparsevec(integer[], integer, boolean) secdef=false lang=c md5=46287b30c09930284d5cdb22bbf0eefb
-array_to_sparsevec(numeric[], integer, boolean) secdef=false lang=c md5=46287b30c09930284d5cdb22bbf0eefb
-array_to_sparsevec(real[], integer, boolean) secdef=false lang=c md5=46287b30c09930284d5cdb22bbf0eefb
-array_to_vector(double precision[], integer, boolean) secdef=false lang=c md5=453949bf80899261e73a6c16482b4491
-array_to_vector(integer[], integer, boolean) secdef=false lang=c md5=453949bf80899261e73a6c16482b4491
-array_to_vector(numeric[], integer, boolean) secdef=false lang=c md5=453949bf80899261e73a6c16482b4491
-array_to_vector(real[], integer, boolean) secdef=false lang=c md5=453949bf80899261e73a6c16482b4491
 author_slugify(value text) secdef=false lang=sql md5=e5e300986773f485bfa1e1568b7ee214
-avg(halfvec) secdef=false lang=internal md5=3eb6d2f5e7ee95ed566dd6cdda54dac3
-avg(vector) secdef=false lang=internal md5=3eb6d2f5e7ee95ed566dd6cdda54dac3
-binary_quantize(halfvec) secdef=false lang=c md5=53aaa20f0c8d46a79857d0d263b6b99e
-binary_quantize(vector) secdef=false lang=c md5=5eaa802d3821174d8abd8814d249b6d9
 block_reserved_domain_signup() secdef=true lang=plpgsql md5=91748e4f1610631c9537ae955c3bf9df
 books_sync_publish_status() secdef=false lang=plpgsql md5=eb3b1030433bf3516015865cf7e31ed9
 bump_daily_content_downloads() secdef=true lang=plpgsql md5=00942c056567928f95baf90047790bfc
@@ -2438,62 +2422,13 @@
 capture_content_version() secdef=false lang=plpgsql md5=c9f53192e6645aa4c4bf8bf4ef4cef6f
 check_rate_limit(p_key text, p_limit integer, p_window_ms bigint) secdef=true lang=plpgsql md5=cbc9c1e870f898cd9906700df2fd1dd9
 cleanup_rate_limit() secdef=true lang=sql md5=974439432d3db73476c5d8d79b1e4e7c
-cosine_distance(halfvec, halfvec) secdef=false lang=c md5=ae02126ba2759a393ee931855f469c5c
-cosine_distance(sparsevec, sparsevec) secdef=false lang=c md5=69af33c2aec90cecfce83589d6359a7d
-cosine_distance(vector, vector) secdef=false lang=c md5=5c2667e37866764f77d3399dd1abe742
 default_organization_id() secdef=true lang=sql md5=13522cdbd6656e59be249b987725ecee
 download_logs_fill_content() secdef=true lang=plpgsql md5=5da4b095eee425118a866cfd2a62b2f6
 find_book_duplicate_candidates(p_title text, p_isbn_keys text[], p_author text, p_content_hash text, p_exclude_id uuid, p_limit integer) secdef=false lang=sql md5=0760ddcc72e66fd4b2aeaa70fd554904
 get_ai_usage(p_user_id uuid) secdef=true lang=plpgsql md5=b13892a5b65eda24f68606d43cb06d42
 get_comment_likes(p_comment_id uuid) secdef=true lang=sql md5=59d1c94b22c11dd6fcc558fd8caa3045
 get_home_stats() secdef=true lang=sql md5=cdb68a35735856e816bbce89b2f1dabb
-gin_extract_query_trgm(text, internal, smallint, internal, internal, internal, internal) secdef=false lang=c md5=bcc3d1b35e67c79fdd7743051b5bb54e
-gin_extract_value_trgm(text, internal) secdef=false lang=c md5=c75ed6efb95d6922885e652c3b1ae63f
-gin_trgm_consistent(internal, smallint, text, integer, internal, internal, internal, internal) secdef=false lang=c md5=1a51ef4f90da1f8206849b90da034f15
-gin_trgm_triconsistent(internal, smallint, text, integer, internal, internal, internal) secdef=false lang=c md5=2042fbe8e50aa61204b33362850572be
-gtrgm_compress(internal) secdef=false lang=c md5=0c5e51542dfa58ac5c28c29a37958c04
-gtrgm_consistent(internal, text, smallint, oid, internal) secdef=false lang=c md5=520315289c6207994f47bd6b574fcbe2
-gtrgm_decompress(internal) secdef=false lang=c md5=92fd74d4efb9a0f25dd35b9b75f71a6b
-gtrgm_distance(internal, text, smallint, oid, internal) secdef=false lang=c md5=96b6ebcb046f8c4a69cbe07f341d676e
-gtrgm_in(cstring) secdef=false lang=c md5=af406f0d6fd3f9f056beb474dc267883
-gtrgm_options(internal) secdef=false lang=c md5=e959830838e9384393160a2b19d70bb7
-gtrgm_out(gtrgm) secdef=false lang=c md5=809b516b4474d75b7ea2606e56263a8b
-gtrgm_penalty(internal, internal, internal) secdef=false lang=c md5=78a76e7fec267214504a675b59c13d82
-gtrgm_picksplit(internal, internal) secdef=false lang=c md5=c2073eb2953664de02fe1c5070a2c0e3
-gtrgm_same(gtrgm, gtrgm, internal) secdef=false lang=c md5=5b60e89adb1cae9e6b7e3b9e7512a859
-gtrgm_union(internal, internal) secdef=false lang=c md5=ac59a0687df15075468862ca946ee148
-halfvec(halfvec, integer, boolean) secdef=false lang=c md5=a788be2ec6c71c3cc2a0b8aed8fdf2c6
-halfvec_accum(double precision[], halfvec) secdef=false lang=c md5=3d89111233c04ed77479bd5be1bb99ac
-halfvec_add(halfvec, halfvec) secdef=false lang=c md5=5dd87f8a7ee62dfa577f7b4e4857d8a5
-halfvec_avg(double precision[]) secdef=false lang=c md5=533bac855868e7f82bc5d517467b9141
-halfvec_cmp(halfvec, halfvec) secdef=false lang=c md5=d8bf0c48833cee46870478cdea34c96f
-halfvec_combine(double precision[], double precision[]) secdef=false lang=c md5=3d24a6b6dd157a7fbaa26ac67722bfbd
-halfvec_concat(halfvec, halfvec) secdef=false lang=c md5=2663dc52dce742d7f5d1ce63a3944706
-halfvec_eq(halfvec, halfvec) secdef=false lang=c md5=863494d0d405a35d09db19388b6de213
-halfvec_ge(halfvec, halfvec) secdef=false lang=c md5=507179a04609f56d2867f4068f6b1a11
-halfvec_gt(halfvec, halfvec) secdef=false lang=c md5=43c445dd6f56811ee5f1a4ae355b6b73
-halfvec_in(cstring, oid, integer) secdef=false lang=c md5=bcc13f9e9d5eeca853c63268f180213d
-halfvec_l2_squared_distance(halfvec, halfvec) secdef=false lang=c md5=0e5bbaf825fa789cc0f59886c85dc879
-halfvec_le(halfvec, halfvec) secdef=false lang=c md5=6916cde1cf23dd3e707e3a84d88f50eb
-halfvec_lt(halfvec, halfvec) secdef=false lang=c md5=b40e18777670c4cc332f780d7605b8c1
-halfvec_mul(halfvec, halfvec) secdef=false lang=c md5=e58fa10f3c9f84f40e2a339c36270b83
-halfvec_ne(halfvec, halfvec) secdef=false lang=c md5=ed9fde290e4de1c91eb41512c0d1c5fc
-halfvec_negative_inner_product(halfvec, halfvec) secdef=false lang=c md5=9cdf9b22b41bf1e915e9b134d7d63740
-halfvec_out(halfvec) secdef=false lang=c md5=1a3a9e37a9ac3247459d46a2e131b761
-halfvec_recv(internal, oid, integer) secdef=false lang=c md5=6d1250ca2e2a21eeb00cac50af7fc610
-halfvec_send(halfvec) secdef=false lang=c md5=8bb84fbcefd20e505b34af0a7975a101
-halfvec_spherical_distance(halfvec, halfvec) secdef=false lang=c md5=317e820ca6ffc3d7a48a22621c5b5906
-halfvec_sub(halfvec, halfvec) secdef=false lang=c md5=69f80cd9e6edd8bffe4b4031bb1b8872
-halfvec_to_float4(halfvec, integer, boolean) secdef=false lang=c md5=89d3d8c907a69e31e14da3b43d9b04c3
-halfvec_to_sparsevec(halfvec, integer, boolean) secdef=false lang=c md5=1d12eb8200d29ac4a4b01514e76f888f
-halfvec_to_vector(halfvec, integer, boolean) secdef=false lang=c md5=b1fe8adbcceaa578ca0449c0a8b71f3d
-halfvec_typmod_in(cstring[]) secdef=false lang=c md5=59b9588ac9e9cb0e32ec082193523fd5
-hamming_distance(bit, bit) secdef=false lang=c md5=a66b5a1f71566a0e6a59a1d10a2ec172
 handle_new_user() secdef=true lang=plpgsql md5=5ab98d0486386a54697dfac78949e8d4
-hnsw_bit_support(internal) secdef=false lang=c md5=28b82774222dc168533ab6d42559cc5c
-hnsw_halfvec_support(internal) secdef=false lang=c md5=a2dffd54cc2ef4c9f8ecb7b519ba8945
-hnsw_sparsevec_support(internal) secdef=false lang=c md5=77de6b151de8117e2ef5f339fd0fae30
-hnswhandler(internal) secdef=false lang=c md5=5ba5c903b051cc4cc6d3750799df72af
 increment_ai_usage(p_user_id uuid, p_limit integer) secdef=true lang=plpgsql md5=2d69500b0267e24dcce163ddca078eff
 increment_download_count(row_id uuid) secdef=false lang=plpgsql md5=1485d290eb7a5eabb2abf9f5a7fea91d
 increment_post_views(p_post_id uuid) secdef=true lang=sql md5=db70a8a7acbbaf597b2d5de371afaf6e
@@ -2502,28 +2437,10 @@
 increment_research_download_count(row_id uuid) secdef=false lang=plpgsql md5=2f2de06e21023ff553dcee2703f1c33f
 increment_research_view_count(row_id uuid) secdef=false lang=plpgsql md5=d8dc7a40882681ab74fde6ae504f423c
 increment_view_count(row_id uuid) secdef=false lang=plpgsql md5=3d52229a4e2c5568a9024bebdcfd1473
-inner_product(halfvec, halfvec) secdef=false lang=c md5=4aa8f382df0dd6dd95b0ee5db3d3fb01
-inner_product(sparsevec, sparsevec) secdef=false lang=c md5=05689132039763385bd28c53135e4932
-inner_product(vector, vector) secdef=false lang=c md5=30813812e3beef3eefcc2b97dc2e0783
 is_admin() secdef=true lang=sql md5=224a7a91949b4d738ed842980dcfef98
 is_librarian() secdef=true lang=sql md5=f4e02f37f68cd95a760b07554b8ebc22
 is_staff() secdef=true lang=sql md5=04ae64076d2d2f4b444a6e00684afd09
 is_super_admin_role() secdef=true lang=sql md5=1dfdaa76d3c8a9a60d34612ddb30985d
-ivfflat_bit_support(internal) secdef=false lang=c md5=d623ee662388fb99e0fa6c27247a1d64
-ivfflat_halfvec_support(internal) secdef=false lang=c md5=de881578090bebcd2b4f05e6ac3655e2
-ivfflathandler(internal) secdef=false lang=c md5=553f6304a81ba52305626d8b87107e13
-jaccard_distance(bit, bit) secdef=false lang=c md5=81e4fcb158c75b909f25ef676a882d63
-l1_distance(halfvec, halfvec) secdef=false lang=c md5=803929c539b5c20876eacb006f4c4777
-l1_distance(sparsevec, sparsevec) secdef=false lang=c md5=95cffbb15d257b7764fddef44ef94524
-l1_distance(vector, vector) secdef=false lang=c md5=b6f1895e932097d8ac811597cf620bd5
-l2_distance(halfvec, halfvec) secdef=false lang=c md5=2946698f38367dea9bda7d81a66a50ae
-l2_distance(sparsevec, sparsevec) secdef=false lang=c md5=e73ffd3c5b6d40a31dd13465be7f5f76
-l2_distance(vector, vector) secdef=false lang=c md5=df0e3b21a9cebe4d6fe183f21a6cb364
-l2_norm(halfvec) secdef=false lang=c md5=db86b0fdbe3c2a33cb08a2c6a943d554
-l2_norm(sparsevec) secdef=false lang=c md5=af5b5f9a1b85f0dfccdf15c2ffcf436e
-l2_normalize(halfvec) secdef=false lang=c md5=8965f5f017ec80ba3c42d2550dcf1215
-l2_normalize(sparsevec) secdef=false lang=c md5=e38ce3deff8c3ae3524f3bb705510d91
-l2_normalize(vector) secdef=false lang=c md5=5432aa23b7a410364c9f96ebbdcfa55b
 match_book_chunks(query_embedding vector, match_count integer, min_similarity double precision) secdef=false lang=sql md5=d9c0fac9f3a39a5c35e04013c4708dfa
 match_books(query_embedding vector, match_threshold double precision, match_count integer) secdef=false lang=sql md5=12c22568bf799c56a7b0b8a39c3f66a9
 match_library(query_embedding vector, match_count integer, min_similarity double precision) secdef=false lang=sql md5=7bba3a962023d424097a1fe3df8d84c7
@@ -2550,40 +2467,8 @@
 search_book_authors(p_query text, p_limit integer) secdef=false lang=sql md5=b84a52f5fe49d2324881557eeb47140f
 search_library_fuzzy(query_text text, match_count integer, min_similarity real) secdef=false lang=sql md5=ba648797817faffec6ea0cef3b28c222
 security_incidents_touch() secdef=false lang=plpgsql md5=1c4318bee4240d4113d86fad7eb15623
-set_limit(real) secdef=false lang=c md5=79156a0336c67021d9428bff7da30542
 set_updated_at() secdef=false lang=plpgsql md5=301a884953d37769916294bb60562e05
-show_limit() secdef=false lang=c md5=3ab6c68b603f0310182efe3695d82a92
-show_trgm(text) secdef=false lang=c md5=bb20c15988887dca8023fcdec2e15705
-similarity(text, text) secdef=false lang=c md5=a65b94a37c1cfdf8414dc6e5180328ee
-similarity_dist(text, text) secdef=false lang=c md5=ace88dc523cc3a38ee252b232a6f3233
-similarity_op(text, text) secdef=false lang=c md5=4317659571d5d65d8c2c051c25c0cecd
 slugify(value text) secdef=false lang=sql md5=881804c7158be13fac690b6277ed884d
-sparsevec(sparsevec, integer, boolean) secdef=false lang=c md5=e413ed156fb4d21400a55a7ad4762613
-sparsevec_cmp(sparsevec, sparsevec) secdef=false lang=c md5=4f44d328c66e2c4c5001ca0108dffcaa
-sparsevec_eq(sparsevec, sparsevec) secdef=false lang=c md5=6f663f5c2c451eca9aa8a22bb5f5049f
-sparsevec_ge(sparsevec, sparsevec) secdef=false lang=c md5=029cafa5a6c337764f2d09f924e480f4
-sparsevec_gt(sparsevec, sparsevec) secdef=false lang=c md5=fb7c3f70be7396c3c4291f6ca28e59cc
-sparsevec_in(cstring, oid, integer) secdef=false lang=c md5=7c94b2810bae64441630446ef5792e30
-sparsevec_l2_squared_distance(sparsevec, sparsevec) secdef=false lang=c md5=59f0447c9c560ac446eb10d194f11339
-sparsevec_le(sparsevec, sparsevec) secdef=false lang=c md5=3d36b39ee63d3c44b8ac3a6b23f6fef5
-sparsevec_lt(sparsevec, sparsevec) secdef=false lang=c md5=f2dfce1affa90284e75250fe8fe7d8cd
-sparsevec_ne(sparsevec, sparsevec) secdef=false lang=c md5=60e0588ef72c49d0569b8951489e4e96
-sparsevec_negative_inner_product(sparsevec, sparsevec) secdef=false lang=c md5=1af2d20ce62e99e961f341d6a77f719e
-sparsevec_out(sparsevec) secdef=false lang=c md5=6c17aef8b608277c93b874cb47397b65
-sparsevec_recv(internal, oid, integer) secdef=false lang=c md5=e3da6eb80cb04e594ce48df681015ba8
-sparsevec_send(sparsevec) secdef=false lang=c md5=d2ccf3ac881f9fd622e5527e1a797390
-sparsevec_to_halfvec(sparsevec, integer, boolean) secdef=false lang=c md5=2186b8df750540ab947bf424bfd8835c
-sparsevec_to_vector(sparsevec, integer, boolean) secdef=false lang=c md5=edae362071756a197fe37218e73a1af3
-sparsevec_typmod_in(cstring[]) secdef=false lang=c md5=c32df2cc36ff5a13f97ad7aecfde04e3
-strict_word_similarity(text, text) secdef=false lang=c md5=658697160f2064b47734aebdbd38425f
-strict_word_similarity_commutator_op(text, text) secdef=false lang=c md5=d06f5838b6234053cb93ddd82002f172
-strict_word_similarity_dist_commutator_op(text, text) secdef=false lang=c md5=21d307ff0ca968d7cb12e9ecdf15ed5e
-strict_word_similarity_dist_op(text, text) secdef=false lang=c md5=4a6a81f56250df9a7e29bb72de12835f
-strict_word_similarity_op(text, text) secdef=false lang=c md5=04fed7fd0767165a07b85c5ec4fd59a1
-subvector(halfvec, integer, integer) secdef=false lang=c md5=ebc41748d75eb097b09ce5c42a1daa17
-subvector(vector, integer, integer) secdef=false lang=c md5=b63304446b89df3f9c132e4bdfd01749
-sum(halfvec) secdef=false lang=internal md5=3eb6d2f5e7ee95ed566dd6cdda54dac3
-sum(vector) secdef=false lang=internal md5=3eb6d2f5e7ee95ed566dd6cdda54dac3
 sync_catalog_book_copy_counts() secdef=true lang=plpgsql md5=a812d6bef53467248e552739a0793824
 sync_learning_path_status() secdef=false lang=plpgsql md5=64fa9ef4c5f2c2f3713829486f5f08d9
 sync_publish_status() secdef=false lang=plpgsql md5=f69191e8fcd5980846d217100877d22d
@@ -2609,58 +2494,8 @@
 update_reading_lists_updated_at() secdef=false lang=plpgsql md5=5b733ab523bad442e4b10f836de9e4ba
 upload_sessions_touch() secdef=false lang=plpgsql md5=fba9acec5bb139acd5f10537767f8366
 upsert_legacy_storage_object(p_ref text, p_mime text, p_size bigint, p_visibility text) secdef=false lang=plpgsql md5=af0e6a0b5f170906a44d822fe39dcaea
-vector(vector, integer, boolean) secdef=false lang=c md5=6ba8844da718b4a65f60dbfd0d92d6ef
-vector_accum(double precision[], vector) secdef=false lang=c md5=b63a7991daf657ad4f5fe8733e5dd176
-vector_add(vector, vector) secdef=false lang=c md5=621e63163f158ca2b28b610114df918b
-vector_avg(double precision[]) secdef=false lang=c md5=1a56d8d9f056d9ba72ed9b5abbe55deb
-vector_cmp(vector, vector) secdef=false lang=c md5=1df0df55a912bf27171e52a132c40737
-vector_combine(double precision[], double precision[]) secdef=false lang=c md5=3d24a6b6dd157a7fbaa26ac67722bfbd
-vector_concat(vector, vector) secdef=false lang=c md5=6ce910b9531e0d3ce58c7dedbd7def4e
-vector_dims(halfvec) secdef=false lang=c md5=c41ef380e6d683ca134f047ccb553bc3
-vector_dims(vector) secdef=false lang=c md5=0d012c00130d3108552f5df1c3d639fb
-vector_eq(vector, vector) secdef=false lang=c md5=15b8eec35de4d3d1cfa4d490c04e8041
-vector_ge(vector, vector) secdef=false lang=c md5=cd3f313bc9680512855af6ced329c236
-vector_gt(vector, vector) secdef=false lang=c md5=a9120874923c9472866bc3df9c75c408
-vector_in(cstring, oid, integer) secdef=false lang=c md5=ea403dd0df8a389a12f141a7d701a4b1
-vector_l2_squared_distance(vector, vector) secdef=false lang=c md5=6992f7d6b8ccc6283d2426b3f4685809
-vector_le(vector, vector) secdef=false lang=c md5=748c00e03ac02f0f4e5f60b61a1cc351
-vector_lt(vector, vector) secdef=false lang=c md5=0b71f058e32bc5ea3d83997be6d3f42c
-vector_mul(vector, vector) secdef=false lang=c md5=183d8306a1502ce6730169a33eb56c28
-vector_ne(vector, vector) secdef=false lang=c md5=8f704aa72f4305ee6c6813cea25f3a32
-vector_negative_inner_product(vector, vector) secdef=false lang=c md5=50de9b160578d41cbec049e7b72434ba
-vector_norm(vector) secdef=false lang=c md5=d1584d8c5fa4f01b24b5619a43678d81
-vector_out(vector) secdef=false lang=c md5=5f4d50d401aa87ccc426fc3fe750918e
-vector_recv(internal, oid, integer) secdef=false lang=c md5=4bf1b7d16af9f7bcd0a4b2bd8ad54166
-vector_send(vector) secdef=false lang=c md5=b6d2b67016bec0327a2444b3ac8e1718
-vector_spherical_distance(vector, vector) secdef=false lang=c md5=52594375eda5f248f8cf4128a93e2d09
-vector_sub(vector, vector) secdef=false lang=c md5=72b55ef782435927912d0d1a3175a532
-vector_to_float4(vector, integer, boolean) secdef=false lang=c md5=67f0d50568935f1b93e686330003af6d
-vector_to_halfvec(vector, integer, boolean) secdef=false lang=c md5=b4ca12c0850ac798b4c3988783037be8
-vector_to_sparsevec(vector, integer, boolean) secdef=false lang=c md5=845dea18a2bc145234cb73cfa47c3e55
… (truncated; full diff in diff-20260906-091913.txt)
```
