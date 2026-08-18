import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout/Layout.js';
import LookupPage from './features/lookup/LookupPage.js';
import DictionaryPage from './features/dictionary/DictionaryPage.js';
import ReviewPage from './features/review/ReviewPage.js';
import PhoneticPage from './features/phonetic/PhoneticPage.js';
import ExpressPage from './features/express/ExpressPage.js';
import SettingsPage from './features/settings/SettingsPage.js';
import SentenceAnalysisPage from './features/sentence/SentenceAnalysisPage.js';
import SentenceCollectionPage from './features/sentence/SentenceCollectionPage.js';
import BookHomePage from './features/book/BookHomePage.js';
import BookShelfPage from './features/book/BookShelfPage.js';
import BookUploadPage from './features/book/BookUploadPage.js';
import BookReaderPage from './features/book/reader/BookReaderPage.js';
import WebHomePage from './features/reading/web/WebHomePage.js';
import WebShelfPage from './features/reading/web/WebShelfPage.js';
import WebReaderPage from './features/reading/web/reader/WebReaderPage.js';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* 全局布局页面（带侧边栏） */}
        <Route element={<Layout />}>
          <Route path="/" element={<LookupPage />} />
          <Route path="/dictionary" element={<DictionaryPage />} />
          <Route path="/sentence/analysis" element={<SentenceAnalysisPage />} />
          <Route path="/sentence/collection" element={<SentenceCollectionPage />} />
          <Route path="/review" element={<ReviewPage />} />
          <Route path="/phonetic" element={<PhoneticPage />} />
          <Route path="/express" element={<ExpressPage />} />
          <Route path="/settings" element={<SettingsPage />} />

          {/* Reading - Books 子模块 */}
          <Route path="/reading/books" element={<BookHomePage />} />
          <Route path="/reading/books/shelf" element={<BookShelfPage />} />
          <Route path="/reading/books/upload" element={<BookUploadPage />} />

          {/* Reading - Internet Pages (Web Articles) 子模块 */}
          <Route path="/reading/web" element={<WebHomePage />} />
          <Route path="/reading/web/shelf" element={<WebShelfPage />} />

          {/* 向后兼容重定向 */}
          <Route path="/book" element={<Navigate to="/reading/books" replace />} />
          <Route path="/book/shelf" element={<Navigate to="/reading/books/shelf" replace />} />
          <Route path="/book/upload" element={<Navigate to="/reading/books/upload" replace />} />
          <Route path="/reading" element={<Navigate to="/reading/books" replace />} />
        </Route>

        {/* 沉浸式阅读器页面（全屏暗色无侧边栏） */}
        <Route path="/reading/books/read/:id" element={<BookReaderPage />} />
        <Route path="/reading/web/read/:id" element={<WebReaderPage />} />
        <Route path="/book/read/:id" element={<BookReaderPage />} />
      </Routes>
    </BrowserRouter>
  );
}
