await supabase.auth.signUp({
  email,
  password,
  options: { data: { full_name: "Sokha Chan" } }
})