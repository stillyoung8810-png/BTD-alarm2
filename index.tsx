import './index.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import App from './App';
import { PostsListPage } from './features/board/PostsListPage';
import { PostDetailPage } from './features/board/PostDetailPage';
import { TdsDialogDebugHarness } from './components/tds-adapter/TdsDialogDebugHarness';
import TdsErrorToastHost from './components/tds-adapter/TdsErrorToastHost';

const ROOT_ELEMENT_ID = 'root';
const ROOT_ELEMENT_MISSING_ERROR = 'Could not find root element';

const ROUTE_PATHS = {
  debugTdsDialog: '/__debug/tds-dialog',
  postsList: '/posts',
  postDetail: '/posts/:id',
  markets: '/markets',
  appFallback: '*',
} as const;

function getRootElement(): HTMLElement {
  const rootElement = document.getElementById(ROOT_ELEMENT_ID);
  if (rootElement == null) {
    throw new Error(ROOT_ELEMENT_MISSING_ERROR);
  }
  return rootElement;
}

function AppRoutes(): React.ReactElement {
  const isDev = import.meta.env?.DEV ?? false;

  return (
    <Routes>
      {isDev && (
        <Route
          path={ROUTE_PATHS.debugTdsDialog}
          element={<TdsDialogDebugHarness />}
        />
      )}
      <Route path={ROUTE_PATHS.postsList} element={<PostsListPage />} />
      <Route path={ROUTE_PATHS.postDetail} element={<PostDetailPage />} />
      <Route path={ROUTE_PATHS.markets} element={<App />} />
      <Route path={ROUTE_PATHS.appFallback} element={<App />} />
    </Routes>
  );
}

const root = ReactDOM.createRoot(getRootElement());

root.render(
  <React.StrictMode>
    <BrowserRouter>
      <AppRoutes />
      <TdsErrorToastHost />
    </BrowserRouter>
  </React.StrictMode>,
);
