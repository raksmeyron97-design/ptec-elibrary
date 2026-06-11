/* eslint-disable @typescript-eslint/no-require-imports */
require('dotenv').config({ path: '.env' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  const { data, error } = await supabase
    .from("books")
    .select(`id, slug, title, book_files ( file_url, format )`)
    .eq("slug", "educational-research-contemporary-issues-and-practical-approaches")
    .single();
  console.log("Error:", error);
  console.log("Data:", JSON.stringify(data, null, 2));
}

run();
