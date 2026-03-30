import './index.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import App from './App';
import { PostsListPage } from './features/board/PostsListPage';
import { PostDetailPage } from './features/board/PostDetailPage';
import { TdsDialogDebugHarness } from './components/tds-adapter/TdsDialogDebugHarness';
import TdsErrorToastHost from './components/tds-adapter/TdsErrorToastHost';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error("Could not find root element");

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <BrowserRouter>
      <>
        <Routes>
          {import.meta.env.DEV ? (
            <Route path="/__debug/tds-dialog" element={<TdsDialogDebugHarness />} />
          ) : null}
          {/* 애드센스용 게시판 — 웹 전용, 토스 미니앱 미노출 */}
          <Route path="/posts" element={<PostsListPage />} />
          <Route path="/posts/:id" element={<PostDetailPage />} />
          {/* 앱인토스 앱 내 기능: 시세 탭 바로 진입용 */}
          <Route path="/markets" element={<App />} />
          <Route path="*" element={<App />} />
        </Routes>
        <TdsErrorToastHost />
      </>
    </BrowserRouter>
  </React.StrictMode>
);
