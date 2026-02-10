// Supabase Edge Function: FCM v1 API를 사용한 푸시 알림 전송
// Deno 환경에서 google-auth-library 대신 jose를 사용하여 JWT 생성
// 배포: supabase functions deploy push-notification --no-verify-jwt

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4'
import { SignJWT, importPKCS8 } from 'https://deno.land/x/jose@v5.2.0/index.ts'

// CORS 헤더 설정
const ALLOWED_ORIGIN = Deno.env.get("ALLOWED_ORIGIN") || "https://btd-alarm2.pages.dev";

const corsHeaders = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Google OAuth2 액세스 토큰 생성 함수
async function getGoogleAccessToken(serviceAccount: {
  client_email: string
  private_key: string
}): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  
  // PKCS8 형식의 private key import
  const privateKey = await importPKCS8(
    serviceAccount.private_key,
    'RS256'
  )
  
  // JWT 생성
  const jwt = await new SignJWT({
    iss: serviceAccount.client_email,
    sub: serviceAccount.client_email,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600, // 1시간 유효
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
  })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .sign(privateKey)
  
  // Google OAuth2 토큰 교환
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  })
  
  if (!tokenResponse.ok) {
    const errorText = await tokenResponse.text()
    throw new Error(`Google OAuth2 토큰 요청 실패: ${errorText}`)
  }
  
  const tokenData = await tokenResponse.json()
  return tokenData.access_token
}

Deno.serve(async (req) => {
  // CORS preflight 처리
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 1. 트리거된 데이터(DB에 새로 추가된 행) 또는 직접 호출 데이터를 받음
    const payload = await req.json()
    const record = payload.record || payload // DB 트리거 또는 직접 호출 지원
    
    console.log('푸시 알림 요청 수신')

    // 필수 필드 검증
    if (!record.user_id) {
      return new Response(
        JSON.stringify({ error: 'user_id가 필요합니다.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 2. Supabase 클라이언트 초기화
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Supabase 환경 변수가 설정되지 않았습니다.')
    }
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // 3. 해당 사용자의 활성화된 FCM 토큰 조회
    const { data: devices, error: deviceError } = await supabase
      .from('user_devices')
      .select('fcm_token, device_name')
      .eq('user_id', record.user_id)
      .eq('is_active', true)

    if (deviceError) {
      console.error('디바이스 조회 에러:', deviceError)
      throw new Error(`디바이스 조회 실패: ${deviceError.message}`)
    }

    if (!devices || devices.length === 0) {
      console.log('발송할 토큰이 없습니다.')
      return new Response(
        JSON.stringify({ message: '발송할 토큰이 없습니다.' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 4. Firebase 서비스 계정 정보 파싱
    const firebaseServiceAccountJson = Deno.env.get('FIREBASE_SERVICE_ACCOUNT')
    if (!firebaseServiceAccountJson) {
      throw new Error('FIREBASE_SERVICE_ACCOUNT 환경 변수가 설정되지 않았습니다.')
    }
    
    const serviceAccount = JSON.parse(firebaseServiceAccountJson)
    
    // 5. Google OAuth2 액세스 토큰 생성
    const accessToken = await getGoogleAccessToken(serviceAccount)

    // 6. 각 디바이스에 FCM v1 API로 알림 전송
    const results: Array<{ device: string; success: boolean; response?: unknown; error?: string }> = []
    
    for (const device of devices) {
      if (!device.fcm_token) continue
      
      try {
        const fcmResponse = await fetch(
          `https://fcm.googleapis.com/v1/projects/${serviceAccount.project_id}/messages:send`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify({
              message: {
                token: device.fcm_token,
                notification: {
                  title: record.title || '📈 BTD Alarm',
                  body: record.content || record.body || '새로운 알림이 있습니다.',
                },
                // 웹 푸시 추가 설정
                webpush: {
                  notification: {
                    icon: '/icon-192x192.png',
                    badge: '/badge-72x72.png',
                    requireInteraction: false,
                  },
                  fcm_options: {
                    link: record.link || '/',
                  },
                },
                // 데이터 페이로드 (앱에서 추가 처리용)
                data: {
                  type: record.type || 'general',
                  portfolio_id: record.portfolio_id || '',
                  timestamp: new Date().toISOString(),
                },
              },
            }),
          }
        )

        const fcmResult = await fcmResponse.json()
        
        if (fcmResponse.ok) {
          console.log(`알림 전송 성공 (${device.device_name})`)
          results.push({
            device: device.device_name || 'unknown',
            success: true,
            response: fcmResult,
          })
        } else {
          console.error(`알림 전송 실패 (${device.device_name}):`, fcmResult)
          
          // 토큰이 유효하지 않은 경우 비활성화 처리
          if (
            fcmResult.error?.code === 404 ||
            fcmResult.error?.details?.some((d: { errorCode?: string }) => 
              d.errorCode === 'UNREGISTERED' || d.errorCode === 'INVALID_ARGUMENT'
            )
          ) {
            console.log('유효하지 않은 토큰 비활성화 처리')
            await supabase
              .from('user_devices')
              .update({ is_active: false })
              .eq('fcm_token', device.fcm_token)
          }
          
          results.push({
            device: device.device_name || 'unknown',
            success: false,
            error: fcmResult.error?.message || 'FCM 전송 실패',
          })
        }
      } catch (fcmError) {
        console.error(`FCM 요청 에러 (${device.device_name}):`, fcmError)
        results.push({
          device: device.device_name || 'unknown',
          success: false,
          error: fcmError instanceof Error ? fcmError.message : 'Unknown error',
        })
      }
    }

    const successCount = results.filter(r => r.success).length
    const failCount = results.filter(r => !r.success).length

    // 7. user_devices의 last_notification_sent_at 업데이트
    if (successCount > 0) {
      const successfulTokens = devices
        .filter((_, idx) => results[idx]?.success)
        .map(d => d.fcm_token)
      
      if (successfulTokens.length > 0) {
        await supabase
          .from('user_devices')
          .update({ last_notification_sent_at: new Date().toISOString() })
          .in('fcm_token', successfulTokens)
      }
    }

    return new Response(
      JSON.stringify({
        message: `알림 전송 완료: 성공 ${successCount}개, 실패 ${failCount}개`,
        results,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('푸시 알림 에러:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

/* 
사용 방법:

1. 환경 변수 설정 (Supabase Dashboard > Edge Functions > Secrets):
   - FIREBASE_SERVICE_ACCOUNT: Firebase 서비스 계정 JSON (전체 내용을 문자열로)

2. 직접 호출 예시:
   curl -X POST 'https://your-project.supabase.co/functions/v1/push-notification' \
     -H 'Authorization: Bearer YOUR_ANON_KEY' \
     -H 'Content-Type: application/json' \
     -d '{
       "user_id": "user-uuid",
       "title": "테스트 알림",
       "content": "알림 내용입니다.",
       "type": "alarm",
       "portfolio_id": "portfolio-uuid"
     }'

3. DB 트리거 또는 다른 Edge Function에서 직접 호출 가능
*/
