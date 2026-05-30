"use server";

import { createServiceClient } from "@/lib/supabase/server";
import { createClient } from "@/lib/supabase/server";

const RESERVED_ADMIN_DOMAINS = ["@ptec.edu.kh", "@admin.ptec.edu.kh", "@ptec-admin.edu.kh"];

export async function verifySignup() {
  const authClient = await createClient();
  const { data: { user } } = await authClient.auth.getUser();

  if (!user || !user.email) {
    return { success: true };
  }

  const email = user.email.toLowerCase();
  
  // Check if email domain is reserved
  const isReserved = RESERVED_ADMIN_DOMAINS.some(domain => email.endsWith(domain));

  if (isReserved) {
    // This is an unauthorized admin signup via the public page.
    const supabase = createServiceClient();
    
    // Delete the user from auth.users via admin API
    await supabase.auth.admin.deleteUser(user.id);

    return { 
      success: false, 
      error: "Signup with an admin domain is not permitted via this page." 
    };
  }

  return { success: true };
}
