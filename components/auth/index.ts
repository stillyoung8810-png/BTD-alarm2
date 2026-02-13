/**
 * Auth 모달 서브뷰 (Phase 0.3)
 * AUTH_VIEW_MAP으로 type → 컴포넌트 매핑, Cognitive Complexity 감소
 */

import React from 'react';
import type { AuthModalType } from './authViewTypes';
import LoginView from './LoginView';
import SignupView from './SignupView';
import ResetPasswordView from './ResetPasswordView';
import ChangePasswordView from './ChangePasswordView';
import ProfileView from './ProfileView';

export type { AuthModalType, AuthEmailFormProps, ResetPasswordViewProps, ChangePasswordViewProps, ProfileViewProps } from './authViewTypes';
export { LoginView, SignupView, ResetPasswordView, ChangePasswordView, ProfileView };

export const AUTH_VIEW_MAP: Record<AuthModalType, React.FC<any>> = {
  login: LoginView,
  signup: SignupView,
  'reset-password': ResetPasswordView,
  'change-password': ChangePasswordView,
  profile: ProfileView,
};
