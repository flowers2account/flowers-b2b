import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.serve(async (req) => {
  const { email, password, phone, name, company_name } = await req.json()

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })

  if (authError) {
    return new Response(JSON.stringify({ error: authError.message, code: authError.code }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const userId = authData.user.id

  await supabaseAdmin.from('profiles').upsert({
    id: userId,
    email,
    role: 'client',
    phone,
    company_name: company_name || null,
    full_name: name || null,
  }, { onConflict: 'id' })

  return new Response(JSON.stringify({ userId }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
