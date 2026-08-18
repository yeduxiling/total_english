import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout/Layout';
import LookupPage from './features/lookup/LookupPage';
import DictionaryPage from './features/dictionary/DictionaryPage';
import ReviewPage from './features/review/ReviewPage';
import PhoneticPage from './features/phonetic/PhoneticPage';
import ExpressPage from './features/express/ExpressPage';
import SettingsPage from './features/settings/SettingsPage';
import SentenceAnalysisPage from './features/sentence/SentenceAnalysisPage';
import SentenceCollectionPage from './features/sentence/SentenceCollectionPage';
import BookHomePage from './features/book/BookHomePage';
import BookShelfPage from './features/book/BookShelfPage';
import BookUploadPage from './features/book/BookUploadPage';
import BookReaderPage from './features/book/reader/BookReaderPage';

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
          <Route path="/book" element={<BookHomePage />} />
          <Route path="/book/shelf" element={<BookShelfPage />} />
          <Route path="/book/upload" element={<BookUploadPage />} />
        </Route>

        {/* 沉浸式阅读器页面（全屏暗色无侧边栏） */}
        <Route path="/book/read/:id" element={<BookReaderPage />} />
      </Routes>
    </BrowserRouter>
  );
}

