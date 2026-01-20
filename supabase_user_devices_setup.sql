-- ============================================
-- 사용자 기기 정보 및 FCM 토큰 관리 테이블 설정 SQL
-- ============================================

-- 1. 테이블 생성 (기존 테이블이 있으면 유지됨)
CREATE TABLE IF NOT EXISTS public.user_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  
  -- 사용자 참조
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  
  -- FCM 토큰 (고유해야 함)
  fcm_token text NOT NULL,
  
  -- 기기 정보
  device_type text DEFAULT 'web' NOT NULL,
  device_name text, -- 기기 이름 (선택사항, 예: "Chrome on Windows", "iPhone 14 Pro")
  user_agent text, -- User Agent 정보 (선택사항)
  
  -- 활성화 상태 (토큰이 유효한지 여부)
  is_active boolean DEFAULT true NOT NULL,
  
  -- 마지막 알림 전송 시간 (선택사항)
  last_notification_sent_at timestamp with time zone,
  
  -- 동일 사용자가 동일 토큰을 중복 저장하지 않도록 고유 제약 조건
  CONSTRAINT unique_user_fcm_token UNIQUE(user_id, fcm_token),
  
  -- device_type 체크 제약조건
  CONSTRAINT check_device_type CHECK (device_type IN ('web', 'ios', 'android', 'desktop'))
);

-- 2. 누락된 컬럼 추가 (기존 테이블이 있을 경우를 대비)
DO $$ 
BEGIN
  -- created_at
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_schema = 'public' 
                 AND table_name = 'user_devices' 
                 AND column_name = 'created_at') THEN
    ALTER TABLE public.user_devices ADD COLUMN created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL;
  END IF;
  
  -- updated_at
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_schema = 'public' 
                 AND table_name = 'user_devices' 
                 AND column_name = 'updated_at') THEN
    ALTER TABLE public.user_devices ADD COLUMN updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL;
  END IF;
  
  -- device_name
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_schema = 'public' 
                 AND table_name = 'user_devices' 
                 AND column_name = 'device_name') THEN
    ALTER TABLE public.user_devices ADD COLUMN device_name text;
  END IF;
  
  -- user_agent
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_schema = 'public' 
                 AND table_name = 'user_devices' 
                 AND column_name = 'user_agent') THEN
    ALTER TABLE public.user_devices ADD COLUMN user_agent text;
  END IF;
  
  -- is_active
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_schema = 'public' 
                 AND table_name = 'user_devices' 
                 AND column_name = 'is_active') THEN
    ALTER TABLE public.user_devices ADD COLUMN is_active boolean DEFAULT true NOT NULL;
  END IF;
  
  -- last_notification_sent_at
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_schema = 'public' 
                 AND table_name = 'user_devices' 
                 AND column_name = 'last_notification_sent_at') THEN
    ALTER TABLE public.user_devices ADD COLUMN last_notification_sent_at timestamp with time zone;
  END IF;
END $$;

-- 3. 인덱스 생성 (조회 성능 향상)
CREATE INDEX IF NOT EXISTS idx_user_devices_user_id ON public.user_devices(user_id);
CREATE INDEX IF NOT EXISTS idx_user_devices_fcm_token ON public.user_devices(fcm_token);
CREATE INDEX IF NOT EXISTS idx_user_devices_user_id_active ON public.user_devices(user_id, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_user_devices_created_at ON public.user_devices(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_devices_updated_at ON public.user_devices(updated_at DESC);

-- 4. updated_at 자동 업데이트 트리거 함수
CREATE OR REPLACE FUNCTION update_user_devices_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 5. updated_at 트리거 생성
DROP TRIGGER IF EXISTS trigger_update_user_devices_updated_at ON public.user_devices;
CREATE TRIGGER trigger_update_user_devices_updated_at
  BEFORE UPDATE ON public.user_devices
  FOR EACH ROW
  EXECUTE FUNCTION update_user_devices_updated_at();

-- 6. RLS 활성화
ALTER TABLE public.user_devices ENABLE ROW LEVEL SECURITY;

-- 7. 기존 정책 삭제 (안전하게 재생성하기 위해)
DROP POLICY IF EXISTS "Users can view own devices" ON public.user_devices;
DROP POLICY IF EXISTS "Users can insert own devices" ON public.user_devices;
DROP POLICY IF EXISTS "Users can update own devices" ON public.user_devices;
DROP POLICY IF EXISTS "Users can delete own devices" ON public.user_devices;
DROP POLICY IF EXISTS "사용자는 자신의 기기 정보만 관리할 수 있음" ON public.user_devices;

-- 8. RLS 정책 생성 (SELECT, INSERT, UPDATE, DELETE 분리)
-- 조회: 본인의 기기 정보만 조회 가능
CREATE POLICY "Users can view own devices" 
  ON public.user_devices FOR SELECT 
  USING (auth.uid() = user_id);

-- 삽입: 본인의 기기 정보만 삽입 가능
CREATE POLICY "Users can insert own devices" 
  ON public.user_devices FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

-- 수정: 본인의 기기 정보만 수정 가능
CREATE POLICY "Users can update own devices" 
  ON public.user_devices FOR UPDATE 
  USING (auth.uid() = user_id) 
  WITH CHECK (auth.uid() = user_id);

-- 삭제: 본인의 기기 정보만 삭제 가능
CREATE POLICY "Users can delete own devices" 
  ON public.user_devices FOR DELETE 
  USING (auth.uid() = user_id);

-- 9. 코멘트 추가 (테이블 및 컬럼 설명)
COMMENT ON TABLE public.user_devices IS '사용자의 기기 정보 및 FCM 토큰을 저장하는 테이블';
COMMENT ON COLUMN public.user_devices.id IS '기기 정보 고유 ID';
COMMENT ON COLUMN public.user_devices.created_at IS '레코드 생성 시간 (UTC)';
COMMENT ON COLUMN public.user_devices.updated_at IS '레코드 수정 시간 (UTC, 자동 업데이트)';
COMMENT ON COLUMN public.user_devices.user_id IS '사용자 ID (auth.users 참조)';
COMMENT ON COLUMN public.user_devices.fcm_token IS 'Firebase Cloud Messaging 토큰';
COMMENT ON COLUMN public.user_devices.device_type IS '기기 타입 (web, ios, android, desktop)';
COMMENT ON COLUMN public.user_devices.device_name IS '기기 이름 (선택사항)';
COMMENT ON COLUMN public.user_devices.user_agent IS 'User Agent 정보 (선택사항)';
COMMENT ON COLUMN public.user_devices.is_active IS '토큰 활성화 상태 (false 시 알림 미전송)';
COMMENT ON COLUMN public.user_devices.last_notification_sent_at IS '마지막 알림 전송 시간';
