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

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<LookupPage />} />
          <Route path="/dictionary" element={<DictionaryPage />} />
          <Route path="/sentence/analysis" element={<SentenceAnalysisPage />} />
          <Route path="/sentence/collection" element={<SentenceCollectionPage />} />
          <Route path="/review" element={<ReviewPage />} />
          <Route path="/phonetic" element={<PhoneticPage />} />
          <Route path="/express" element={<ExpressPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
