import { supabaseAdmin } from '@/utils/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { loginId } = await req.json()
  const { data: profile, error } = await supabaseAdmin
    .from('profiles')
    .select('email')
    .eq('login_id', loginId)
    .single()

  if (error || !profile) {
    return NextResponse.json({ success: false, error: 'Invalid User ID / 用户ID无效' }, { status:400 })
  }
  return NextResponse.json({ success: true, data: profile })
}
