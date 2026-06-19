import { useState } from 'react';
import SpeakButton from '../../components/SpeakButton/SpeakButton.js';
import './PhoneticPage.css';

interface PhoneticItem {
  kk: string;
  ipa: string;
  word: string;
}

const vowels: PhoneticItem[] = [
  { kk: 'i', ipa: 'iː', word: 'see' },
  { kk: 'ɪ', ipa: '', word: 'sit' },
  { kk: 'e', ipa: 'eɪ', word: 'say' },
  { kk: 'ɛ', ipa: 'e', word: 'bed' },
  { kk: 'æ', ipa: '', word: 'cat' },
  { kk: 'ɑ', ipa: 'ɑː', word: 'hot' },
  { kk: 'ɔ', ipa: 'ɔː', word: 'dog' },
  { kk: 'o', ipa: 'oʊ', word: 'go' },
  { kk: 'ʊ', ipa: '', word: 'book' },
  { kk: 'u', ipa: 'uː', word: 'too' },
  { kk: 'ʌ', ipa: '', word: 'cup' },
  { kk: 'ə', ipa: '', word: 'ago' },
  { kk: 'ɝ', ipa: 'ɜːr', word: 'bird' },
  { kk: 'ɚ', ipa: 'ər', word: 'teacher' },
  { kk: 'aɪ', ipa: '', word: 'my' },
  { kk: 'aʊ', ipa: '', word: 'now' },
  { kk: 'ɔɪ', ipa: '', word: 'boy' },
  { kk: 'ɪr', ipa: 'ɪər', word: 'near' },
  { kk: 'ɛr', ipa: 'eər', word: 'hair' },
  { kk: 'ɔr', ipa: 'ɔːr', word: 'door' }
];

const consonants: PhoneticItem[] = [
  // 爆破音 (6)
  { kk: 'p', ipa: '', word: 'pen' },
  { kk: 'b', ipa: '', word: 'bed' },
  { kk: 't', ipa: '', word: 'tea' },
  { kk: 'd', ipa: '', word: 'dog' },
  { kk: 'k', ipa: '', word: 'key' },
  { kk: 'g', ipa: '', word: 'go' },
  // 摩擦音 (10)
  { kk: 'f', ipa: '', word: 'fat' },
  { kk: 'v', ipa: '', word: 'van' },
  { kk: 'θ', ipa: '', word: 'thin' },
  { kk: 'ð', ipa: '', word: 'this' },
  { kk: 's', ipa: '', word: 'sun' },
  { kk: 'z', ipa: '', word: 'zoo' },
  { kk: 'ʃ', ipa: '', word: 'shoe' },
  { kk: 'ʒ', ipa: '', word: 'vision' },
  { kk: 'h', ipa: '', word: 'hat' },
  { kk: 'r', ipa: '', word: 'red' },
  // 破擦音 (6)
  { kk: 'tʃ', ipa: '', word: 'chin' },
  { kk: 'dʒ', ipa: '', word: 'job' },
  { kk: 'ts', ipa: '', word: 'cats' },
  { kk: 'dz', ipa: '', word: 'beds' },
  { kk: 'tr', ipa: '', word: 'tree' },
  { kk: 'dr', ipa: '', word: 'drink' },
  // 鼻音 (3)
  { kk: 'm', ipa: '', word: 'man' },
  { kk: 'n', ipa: '', word: 'no' },
  { kk: 'ŋ', ipa: '', word: 'sing' },
  // 舌边音 (1)
  { kk: 'l', ipa: '', word: 'leg' },
  // 半元音 (2)
  { kk: 'w', ipa: '', word: 'wet' },
  { kk: 'j', ipa: '', word: 'yes' }
];

export default function PhoneticPage() {
  const [activeTab, setActiveTab] = useState<'vowels' | 'consonants'>('vowels');

  const items = activeTab === 'vowels' ? vowels : consonants;

  return (
    <div className="phonetic-page animate-in">
      <div className="phonetic-header">
        <div>
          <h1 className="page-title">Phonetic Chart</h1>
          <p className="page-subtitle">Learn the 48 KK Phonetic symbols for American English pronunciation.</p>
        </div>
      </div>

      <div className="phonetic-tabs-container">
        <div className="phonetic-tabs">
          <button
            className={`phonetic-tab-btn ${activeTab === 'vowels' ? 'active' : ''}`}
            onClick={() => setActiveTab('vowels')}
          >
            Vowels (元音) <span className="tab-count">{vowels.length}</span>
          </button>
          <button
            className={`phonetic-tab-btn ${activeTab === 'consonants' ? 'active' : ''}`}
            onClick={() => setActiveTab('consonants')}
          >
            Consonants (辅音) <span className="tab-count">{consonants.length}</span>
          </button>
        </div>
      </div>

      <div className="phonetic-grid">
        {items.map((item, index) => (
          <div
            key={index}
            className="phonetic-card card"
            title={`Click speaker to listen to "${item.word}"`}
          >
            <div className="phonetic-card-left">
              <div className="phonetic-symbol-kk">
                <span className="slash">/</span>
                <span className="symbol-text">{item.kk}</span>
                <span className="slash">/</span>
              </div>
              <div className="phonetic-symbol-ipa">
                {item.ipa ? (
                  <>
                    <span className="ipa-label">IPA:</span>
                    <span className="ipa-value">/{item.ipa}/</span>
                  </>
                ) : (
                  <span className="ipa-same">Same as IPA</span>
                )}
              </div>
            </div>

            <div className="phonetic-card-right">
              <div className="phonetic-sample-word font-english">
                {item.word}
              </div>
              <div className="phonetic-speak-action">
                <SpeakButton text={item.word} size="md" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
